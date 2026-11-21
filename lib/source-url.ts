export function sourceUrl(value: string) {
  if (!value) return '';
  try {
    const u = new URL(value);
    u.hash = '';
    for (const key of [...u.searchParams.keys()])
      if (key.startsWith('utm_') || ['fbclid', 'gclid'].includes(key)) u.searchParams.delete(key);
    u.searchParams.sort();
    return u.href.replace(/\/$/, '');
  } catch {
    return value;
  }
}
