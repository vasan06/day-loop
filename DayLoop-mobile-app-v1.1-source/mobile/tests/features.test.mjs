import assert from 'node:assert/strict'; import fs from 'node:fs';
const ls = {};
for (const [n, f] of Object.entries({ getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } })) Object.defineProperty(ls, n, { value: f, enumerable: false });
globalThis.localStorage = ls;
const S = await import('../www/js/store.js'); const N = await import('../www/js/notify.js'); const U = await import('../www/js/util.js');
let n = 0; const t = async (name, fn) => { S.replaceState({}); await fn(); n++; console.log('✓', name); };
const today = U.ymd();

await t('nextDue daily/weekly/monthly (clamped, always in future)', () => {
  assert.equal(S.nextDue('2030-01-10', 'daily', 10, '2030-01-01'), '2030-01-11');
  assert.equal(S.nextDue('2030-01-10', 'weekly', 10, '2030-01-01'), '2030-01-17');
  assert.equal(S.nextDue('2030-01-31', 'monthly', 31, '2030-01-01'), '2030-02-28');
  assert.equal(S.nextDue('2030-02-28', 'monthly', 31, '2030-01-01'), '2030-03-31');
  assert.equal(S.nextDue('2020-01-01', 'daily', 1, '2030-01-05'), '2030-01-06'); // overdue old task skips ahead
});
await t('repeat validation', () => {
  assert.match(S.addTask({ title: 'a', due: today, repeat: 'hourly' }), /Invalid repeat/);
  assert.match(S.addTask({ title: 'a', repeat: 'daily' }), /due date/);
});
await t('completing a repeating task regenerates once, with reminder time', () => {
  assert.equal(S.addTask({ title: 'Water plants', due: today, time: '09:30', repeat: 'daily' }), '');
  const id = S.state.tasks[0].id; S.addSubtask(id, 'Balcony');
  S.toggleTask(id);
  assert.equal(S.state.tasks.length, 2);
  const nxt = S.state.tasks[0];
  assert.equal(nxt.done, false); assert.equal(nxt.time, '09:30'); assert.ok(nxt.due > today); assert.equal(nxt.subtasks[0].done, false); assert.notEqual(nxt.id, id);
  S.toggleTask(id); S.toggleTask(id); // un-complete / re-complete must not duplicate
  assert.equal(S.state.tasks.length, 2);
  const sched = N.buildSchedule(S.state, new Date(2000, 0, 1));
  assert.ok(sched.some((s) => s.body === 'Water plants'));
});
await t('non-repeating task does not regenerate', () => { S.addTask({ title: 'once', due: today }); S.toggleTask(S.state.tasks[0].id); assert.equal(S.state.tasks.length, 1); });

const good = () => JSON.stringify({ v: 1, settings: { name: 'Asha' }, tasks: [{ id: 'a', title: 'T', due: '2030-01-01', subtasks: [] }], habits: [], transactions: [{ id: 'x', amount: 5 }], notes: [], events: [] });
await t('import: valid backup parses with counts', () => {
  const r = S.validateBackup(good()); assert.ok(!r.error); assert.equal(r.counts.tasks, 1); assert.equal(r.data.settings.name, 'Asha');
});
await t('import: rejects bad files with a message', () => {
  for (const [txt, re] of [['', /empty/], ['{oops', /valid JSON/], ['[]', /Not a DayLoop/], ['{"v":9,"settings":{}}', /version/], ['{"v":1}', /settings/],
    ['{"v":1,"settings":{},"tasks":"x"}', /list/], ['{"v":1,"settings":{},"tasks":[1]}', /invalid entry/], ['{"v":1,"settings":{},"tasks":[{"title":5}]}', /task/],
    ['{"v":1,"settings":{},"transactions":[{"amount":"abc"}]}', /amount/], ['{"v":1,"settings":{},"events":[{"title":"e","date":"2030-13-45"}]}', /event/], ['x'.repeat(S.MAX_IMPORT_BYTES + 1), /large/]])
    assert.match(S.validateBackup(txt).error || '', re, txt.slice(0, 30));
});
await t('import: a bad file never touches existing data', async () => {
  S.addTask({ title: 'keep me', due: today }); const before = JSON.stringify(S.state);
  assert.ok(S.validateBackup('{"v":1,"settings":{},"tasks":"bad"}').error); assert.equal(JSON.stringify(S.state), before);
});
await t('import: apply replaces data and keeps a safety copy in DayLoop/exports', async () => {
  S.addTask({ title: 'old', due: today });
  await S.applyImport(S.validateBackup(good()).data);
  assert.equal(S.state.tasks.length, 1); assert.equal(S.state.tasks[0].title, 'T');
  const keys = Object.keys(ls); assert.ok(keys.some((k) => /^DayLoop\/exports\/pre-import-\d+\.json$/.test(k)));
  assert.ok(keys.every((k) => k.startsWith('DayLoop/')));
  assert.ok(JSON.parse(ls[keys.find((k) => k.includes('pre-import'))]).tasks.some((x) => x.title === 'old'));
});
await t('import: HTML in imported text stays escaped', () => { assert.equal(U.esc('<img src=x onerror=1>'), '&lt;img src=x onerror=1&gt;'); });

await t('fonts bundled locally; CSP has no remote origins', () => {
  const css = fs.readFileSync(new URL('../www/css/app.css', import.meta.url), 'utf8'); const html = fs.readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');
  for (const m of css.matchAll(/url\(([^)]+\.woff2)\)/g)) assert.ok(fs.existsSync(new URL('../www/css/' + m[1], import.meta.url)), m[1]);
  assert.ok(!/https?:\/\//.test(css) && !/https?:\/\/(?!www\.w3)/.test(html.replace(/xmlns="[^"]+"/g, '')));
  assert.match(html, /font-src 'self'/); assert.ok(!/user-scalable=no/.test(html));
});
console.log(`\n${n} feature tests passed`);
