"""Build the offline index from Open Prices' public daily Parquet export.
Run with DuckDB installed: python scripts/refresh-market.py [prices.parquet]
"""
import datetime
import json
import pathlib
import sys
import tempfile
import urllib.request

import duckdb

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = "https://huggingface.co/datasets/openfoodfacts/open-prices/resolve/main/prices.parquet"
with tempfile.TemporaryDirectory() as tmp:
    path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(tmp, "prices.parquet")
    if not path.exists():
        urllib.request.urlretrieve(SOURCE, path)
    c = duckdb.connect()
    c.from_parquet(str(path)).create_view("prices")
    end = min(datetime.date.today(), c.sql("select max(date) from prices").fetchone()[0])
    start = end - datetime.timedelta(days=365)
    c.execute("""create temp table fr as select * from prices where
      lower(location_osm_address_country_code)='fr' and currency='EUR' and price>0
      and not coalesce(price_is_discounted,false) and duplicate_of is null and date between ? and ?""", [start,end])
    c.execute("""create temp table quotes as
      select replace(category_tag,'en:','') tag, case price_per when 'UNIT' then 'each' else 'loose' end kind,
        case price_per when 'UNIT' then 'pièce' else 'g' end unit,
        case price_per when 'UNIT' then price else price/1000 end rate,0 size,date,id,location_id shop,category_tag code
      from fr where price_per in ('UNIT','KILOGRAM') and category_tag like 'en:%'
      union all
      select replace(tag,'en:',''),'pack',product_product_quantity_unit, price/product_product_quantity,
        product_product_quantity,date,id,location_id,product_code from fr, unnest(product_categories_tags) t(tag)
      where tag like 'en:%' and product_product_quantity_unit in ('g','ml') and product_product_quantity between 1 and 10000
        and (tag!='en:skyrs' or not regexp_matches(strip_accents(lower(coalesce(product_product_name,''))), 'vanill|fraise|framboise|myrtill|peche|fruit|mangue|coco|chocolat|citron|caramel|ananas|boire'))
        and (tag!='en:chicken-breasts' or not regexp_matches(strip_accents(lower(coalesce(product_product_name,''))), 'roti|fume|proven[cç]ale|facon hache|pane|cuit'))
        and (tag!='en:long-grain-rices' or not (list_contains(product_categories_tags,'en:precooked-rices')
          or list_contains(product_categories_tags,'en:prepared-rices') or regexp_matches(strip_accents(lower(coalesce(product_product_name,''))), 'micro.onde|express|deja cuit|2 min')))""")
    # One observation per product, shop and day. Keep each retail size paired
    # with its observed shelf price, separately from loose and per-item sales.
    c.execute("""create temp table clean as select tag,kind,unit,size,date,shop,code,median(rate) rate,min(id) id
      from quotes where rate>0 and (kind='each' or rate<10) group by all""")
    rows = c.sql("""select tag,kind,unit,median(rate),quantile_disc(size,0.5),count(*),max(date),arg_max(id,date order by id)
      from clean group by all having count(*)>=3 order by tag,kind,unit""").fetchall()
    sizes = c.sql("""select tag,unit,size,median(rate*size),count(*) n,count(distinct shop) shops
      from clean where kind='pack' group by tag,unit,size having n>=3 and shops>=2
      qualify row_number() over(partition by tag,unit order by n desc,shops desc,size)<=4 or (tag='skyrs' and size=850)
      order by tag,unit,n desc,size""").fetchall()
    # For sparse categories retain the median-size format with its own median
    # observed price. It is still an estimate and is identified as such in the UI.
    actual = {(t,u,s):float(price) for t,u,s,price in c.sql("""select tag,unit,size,median(rate*size)
      from clean where kind='pack' group by all""").fetchall()}
    offers={}
    for tag,unit,size,price,count,_ in sizes:
        offers.setdefault((tag,unit),[]).append(dict(size=size,cents=round(float(price)*100),n=count))
    spec=json.loads((ROOT/'lib/market-data/market-families.json').read_text())
    wanted={tag for rule in spec for tag in rule['tags']}
    prices={}
    for tag,kind,unit,rate,size,n,latest,example in rows:
        if tag not in wanted:
            continue
        quote=dict(kind=kind,unit=unit,rate=round(float(rate)*100,6),pack=size,n=n,latest=str(latest),example=example)
        if kind=='pack':
            quote['formats']=offers.get((tag,unit)) or [dict(size=size,cents=round(actual[tag,unit,size]*100))]
        prices.setdefault(tag,[]).append(quote)
    dest=ROOT/'lib/market-data/market-fr.json'
    dest.write_text(json.dumps(dict(source=SOURCE,fromDate=str(start),toDate=str(end),prices=prices),ensure_ascii=False,indent=2)+'\n')
    print(f"{len(prices)} catégories tarifées, fenêtre {start} – {end}")
