"""Build the offline price index from the official Open Prices daily Parquet export.
Run: python -m pip install duckdb; python scripts/refresh-market.py [prices.parquet]
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
    # Loose €/kg and packaged €/g or €/ml are kept separate. One vote per shop,
    # item and day prevents duplicate receipts from dominating the median.
    c.execute("""create temp table quotes as
      select replace(category_tag,'en:','') tag, 'loose' kind,'g' unit, price/1000 rate,0 size,date,id,location_id shop, category_tag code
      from fr where price_per='KILOGRAM' and category_tag like 'en:%'
      union all
      select replace(tag,'en:',''),'pack',product_product_quantity_unit, price/product_product_quantity,
        product_product_quantity,date,id,location_id,product_code from fr, unnest(product_categories_tags) t(tag)
      where tag like 'en:%' and product_product_quantity_unit in ('g','ml') and product_product_quantity between 1 and 10000""")
    rows=c.sql("""with clean as (select tag,kind,unit,size,date,shop,code,median(rate) rate,min(id) id
      from quotes where rate>0 and rate<10 group by all)
      select tag,kind,unit,median(rate),quantile_disc(size,0.5),count(*),max(date),arg_max(id,date)
      from clean group by all having count(*)>=3""").fetchall()
    # Only ship families used by the estimator.
    spec=json.loads((ROOT/'lib/market-data/market-families.json').read_text())
    wanted={tag for rule in spec for tag in rule['tags']}
    prices={}
    for tag,kind,unit,rate,size,n,latest,example in sorted(rows):
        if tag in wanted:
            prices.setdefault(tag,[]).append(dict(kind=kind,unit=unit,rate=round(float(rate)*100,6),pack=size,n=n,latest=str(latest),example=example))
    dest=ROOT/'lib/market-data/market-fr.json'
    dest.write_text(json.dumps(dict(source=SOURCE,fromDate=str(start),toDate=str(end),prices=prices),ensure_ascii=False,indent=2)+'\n')
    print(f"{len(prices)} catégories tarifées, fenêtre {start} – {end}")
