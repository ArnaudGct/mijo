export function today() {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
export function addDays(s: string, n: number) {
  const d = new Date(s + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function monday(s: string) {
  return addDays(s, -((new Date(s + 'T12:00Z').getUTCDay() + 6) % 7));
}
export function labelDate(
  s: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' },
) {
  return new Date(s + 'T12:00Z').toLocaleDateString('fr-FR', { ...options, timeZone: 'UTC' });
}
export const inWeek = (s: string, w: string) => s >= w && s < addDays(w, 7);
export const money = (c: number | null) =>
  c === null
    ? 'Inconnu'
    : (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
