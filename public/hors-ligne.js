const key = 'table-offline';
const saved = JSON.parse(localStorage.getItem(key) || 'null');
const ownsCopy = () =>
  saved?.owner && document.cookie.split('; ').includes('mijo_notebook=' + saved.owner);
const data = ownsCopy() ? saved : null;
if (saved && !saved.owner) localStorage.removeItem(key);
window.addEventListener('pageshow', () => {
  if (data && !ownsCopy()) location.reload();
});
window.addEventListener('storage', (e) => {
  if (e.key === key && !ownsCopy()) location.reload();
});
const statusEl = document.querySelector('#status');
const save = () => {
  if (ownsCopy()) localStorage.setItem(key, JSON.stringify(data));
};
function show() {
  if (!data) {
    statusEl.textContent = 'Enregistrez la liste sur cet appareil depuis la page Courses.';
    return;
  }
  statusEl.textContent = 'Semaine du ' + data.week;
  document.querySelector('a[href="/courses"]').href =
    '/courses?week=' + encodeURIComponent(data.week);
  const rows = document.querySelector('#rows');
  let category;
  for (const row of data.rows) {
    if (row.category && row.category !== category) {
      category = row.category;
      const heading = document.createElement('h2');
      heading.textContent = category;
      rows.append(heading);
    }
    const label = document.createElement('label'),
      box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = row.checked;
    box.onchange = () => {
      row.checked = box.checked;
      save();
    };
    label.append(
      box,
      document.createTextNode(
        ' ' +
          row.name +
          ' · ' +
          (row.description ??
            (row.unknown
              ? row.unit === 'selon le goût'
                ? 'Selon le goût'
                : 'À préciser'
              : row.quantity + ' ' + row.unit)),
      ),
    );
    rows.append(label);
  }
}
let working = false;
async function sync() {
  if (!data || working || !ownsCopy()) return;
  const edits = data.rows
    .filter((r) => r.checked !== r.before)
    .flatMap((r) =>
      r.parts
        ? r.parts.map((p) => ({ ...p, week: data.week, checked: r.checked }))
        : [{ week: data.week, ...r }],
    );
  if (!edits.length) {
    statusEl.textContent = 'Toutes les coches sont synchronisées.';
    return;
  }
  working = true;
  try {
    const res = await fetch('/api/checks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Mijo-Account': data.owner },
      body: JSON.stringify(edits),
    });
    const r = await res.json();
    if (!res.ok) throw Error(r.error);
    const submitted = new Map(edits.map((edit) => [edit.key, edit.checked]));
    for (const row of data.rows) {
      if (row.parts) {
        for (const part of row.parts)
          if (submitted.has(part.key)) part.before = submitted.get(part.key);
        row.before = row.parts.every((part) => part.before);
      } else if (submitted.has(row.key)) row.before = submitted.get(row.key);
    }
    save();
    statusEl.textContent = 'Coches synchronisées.';
  } catch (e) {
    statusEl.textContent = e.message;
  } finally {
    working = false;
  }
}
show();
document.querySelector('#sync').onclick = sync;
window.addEventListener('online', sync);
if (navigator.onLine && data?.rows.some((r) => r.before !== r.checked)) void sync();

document.querySelector('#clear').onclick = () => {
  if (confirm('Effacer cette copie de la liste et ses éventuelles coches non synchronisées ?')) {
    localStorage.removeItem(key);
    location.reload();
  }
};
