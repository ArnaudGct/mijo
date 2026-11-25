import { z } from 'zod';
const barcode = z.string().regex(/^\d{8,14}$/);
const base = 'https://prices.openfoodfacts.org/api/v1/';
async function query(path: string, params: Record<string, string>) {
  const res = await fetch(base + path + '?' + new URLSearchParams(params), {
    signal: AbortSignal.timeout(8000),
    redirect: 'error',
    headers: {
      accept: 'application/json',
      'user-agent': 'Mijo/1.0 (personal meal planner)',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw Error('Open Prices est indisponible.');
  return res.json();
}
const location = z.object({
  id: z.number().int(),
  osm_name: z.string().nullable(),
  osm_address_city: z.string().nullable(),
});
const observed = z.object({
  id: z.number().int(),
  type: z.string(),
  product_code: z.string(),
  price: z.number().nonnegative(),
  date: z.iso.date(),
  currency: z.string(),
  price_per: z.string().nullable(),
  price_is_discounted: z.boolean().nullable(),
  location: location,
  product: z
    .object({
      product_name: z.string().nullable(),
      product_quantity: z.coerce.number().nullable(),
      product_quantity_unit: z.string().nullable(),
    })
    .nullable(),
});
export async function localObservations(code: string) {
  barcode.parse(code);
  const places = z
    .object({ items: z.array(location) })
    .parse(await query('locations', { osm_address_city__like: 'La Rochelle', size: '100' }))
    .items.filter((l) => l.osm_address_city === 'La Rochelle');
  if (!places.length) return [];
  const result = await query('prices', {
    product_code: code,
    location_id__in: places.map((l) => l.id).join(','),
    currency: 'EUR',
    order_by: '-date',
    size: '20',
  });
  return z
    .object({ items: z.array(observed) })
    .parse(result)
    .items.filter(
      (p) =>
        p.product_code === code &&
        p.currency === 'EUR' &&
        p.type === 'PRODUCT' &&
        p.price_per === null &&
        p.location.osm_address_city === 'La Rochelle',
    )
    .map((p) => ({
      product: p.product?.product_name ?? code,
      shop: p.location.osm_name ?? 'Magasin ' + p.location.id,
      quantity: p.product?.product_quantity || undefined,
      unit: p.product?.product_quantity_unit ?? '',
      cents: Math.round(p.price * 100),
      day: p.date,
      source: 'Open Prices #' + p.id + (p.price_is_discounted ? ' (promotion observée)' : ''),
      barcode: code,
      estimated: false,
    }));
}
