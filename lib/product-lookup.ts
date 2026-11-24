import { z } from 'zod';
import { normalize } from './ingredients';
import type { ProductInfo } from './product-scan';

const product = z.object({
  product_name_fr: z.string().nullish(),
  product_name: z.string().nullish(),
  product_quantity: z.coerce.number().finite().nullish().catch(null),
  product_quantity_unit: z.string().nullish(),
});
export async function lookupProduct(barcode: string): Promise<ProductInfo | null> {
  const fields = 'product_name_fr,product_name,product_quantity,product_quantity_unit';
  const response = await fetch(
    'https://world.openfoodfacts.org/api/v2/product/' + barcode + '.json?fields=' + fields,
    {
      headers: {
        'User-Agent': 'TableDeSaison/1.0 (personal meal planner)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(4500),
      redirect: 'error',
    },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw Error('Catalogue indisponible.');
  const body = await response.json();
  if (body.status === 0) return null;
  const p = product.parse(body.product);
  const name = (p.product_name_fr || p.product_name || '').trim().slice(0, 300);
  if (!name) return null;
  const [q, unit] = normalize(p.product_quantity ?? 0, p.product_quantity_unit ?? '');
  return { name, quantity: q > 0 && unit ? q : null, unit };
}
