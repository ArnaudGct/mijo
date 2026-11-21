const key = 'table-offline';
const data = JSON.parse(localStorage.getItem(key) || 'null'),
  statusEl = document.querySelector('#status');
const save = () => localStorage.setItem(key, JSON.stringify(data));
function show() {
  if (!data) {
    statusEl.textContent = 'Enregistrez la liste sur cet appareil depuis la page Courses.';
    return;
  }
  statusEl.textContent = 'Semaine du ' + data.week;
  for (const row of data.rows) {
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
        ' ' + row.name + ' · ' + (row.unknown ? 'À préciser' : row.quantity + ' ' + row.unit),
      ),
    );
    document.querySelector('#rows').append(label);
  }
}
let working = false;
async function sync() {
  if (!data || working) return;
  const edits = data.rows
    .filter((r) => r.checked !== r.before)
    .map((r) => ({ week: data.week, ...r }));
  if (!edits.length) {
    statusEl.textContent = 'Toutes les coches sont synchronisées.';
    return;
  }
  working = true;
  try {
    const res = await fetch('/api/checks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(edits),
    });
    const r = await res.json();
    if (!res.ok) throw Error(r.error);
    for (const edit of edits) data.rows.find((r) => r.key === edit.key).before = edit.checked;
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
