import assert from 'node:assert/strict';
const store = new Map(); // mirrors localStorage keys; real browsers enumerate keys via Object.keys(localStorage)
const ls = {};
for (const [name, fn] of Object.entries({ getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); store.set(k, 1); }, removeItem: (k) => { delete ls[k]; store.delete(k); } }))
  Object.defineProperty(ls, name, { value: fn, enumerable: false });
globalThis.localStorage = ls;
const S = await import('../www/js/store.js');
const N = await import('../www/js/notify.js');
const U = await import('../www/js/util.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };
const today = U.ymd();

t('task validation', () => {
  assert.match(S.addTask({ title: '  ' }), /required/);
  assert.match(S.addTask({ title: 'x'.repeat(121) }), /120/);
  assert.match(S.addTask({ title: 'a', due: '2026-02-30' }), /Invalid due/);
  assert.match(S.addTask({ title: 'a', time: '09:00' }), /due date/);
  assert.match(S.addTask({ title: 'a', due: today, time: '25:00' }), /Invalid time/);
  assert.equal(S.state.tasks.length, 0);
  assert.equal(S.addTask({ title: ' Buy milk ', due: today, priority: 9 }), '');
  assert.equal(S.state.tasks[0].title, 'Buy milk'); assert.equal(S.state.tasks[0].priority, 4);
});
t('subtasks complete parent', () => {
  const id = S.state.tasks[0].id; S.addSubtask(id, 'a'); S.addSubtask(id, 'b');
  const [a, b] = S.state.tasks[0].subtasks; S.toggleSubtask(id, a.id); assert.equal(S.state.tasks[0].done, false);
  S.toggleSubtask(id, b.id); assert.equal(S.state.tasks[0].done, true);
  assert.ok(S.BADGES.length && S.state.achievements.first_task);
});
t('project stats + duplicate name', () => {
  assert.equal(S.addProject({ name: 'Launch' }), ''); assert.match(S.addProject({ name: 'launch' }), /exists/);
  const p = S.state.projects[0]; S.addTask({ title: 'p1', projectId: p.id }); S.addTask({ title: 'p2', projectId: p.id });
  assert.equal(S.projectStats(p.id).pct, 0); S.toggleTask(S.state.tasks[0].id); assert.equal(S.projectStats(p.id).pct, 50);
  S.deleteProject(p.id); assert.ok(S.state.tasks.every((x) => !x.projectId));
});
t('habit streaks (scheduled days, pending today keeps streak)', () => {
  S.addHabit({ name: 'Run', days: [0, 1, 2, 3, 4, 5, 6] }); const h = S.state.habits[0];
  h.created = U.addDays(today, -20);
  for (let i = 1; i <= 5; i++) h.log[U.addDays(today, -i)] = true;
  assert.equal(S.habitStats(h).current, 5, 'today not done yet keeps 5');
  h.log[today] = true; assert.equal(S.habitStats(h).current, 6);
  delete h.log[U.addDays(today, -3)]; assert.equal(S.habitStats(h).current, 3); assert.equal(S.habitStats(h).best, 3);
});
t('weekday-only habit skips weekends', () => {
  S.addHabit({ name: 'Work out', days: [1, 2, 3, 4, 5] }); const h = S.state.habits[1]; h.created = '2026-01-01';
  const mon = '2026-11-16'; for (const d of ['2026-11-12', '2026-11-13', '2026-11-16']) h.log[d] = true; // Thu Fri (skip weekend) Mon
  assert.equal(S.habitStats(h, mon).current, 3);
});
t('habit validation', () => {
  assert.match(S.addHabit({ name: 'run' }), /already/); assert.match(S.addHabit({ name: '' }), /required/);
  assert.match(S.toggleHabit(S.state.habits[0].id, U.addDays(today, 1)), /future/);
});
t('transactions + summaries', () => {
  assert.match(S.addTransaction({ type: 'expense', amount: '0', date: today }), /greater/);
  assert.match(S.addTransaction({ type: 'expense', amount: '-5', date: today }), /greater/);
  assert.match(S.addTransaction({ type: 'expense', amount: 'abc', date: today }), /greater/);
  assert.match(S.addTransaction({ type: 'expense', amount: '5', date: U.addDays(today, 2) }), /future/);
  assert.match(S.addTransaction({ type: 'x', amount: '5', date: today }), /income or expense/);
  S.addTransaction({ type: 'income', amount: '1000', cat: 'Salary', date: today }); S.addTransaction({ type: 'expense', amount: '250.505', cat: 'Food', date: today });
  const m = S.monthSummary(); assert.equal(m.income, 1000); assert.equal(m.expense, 250.51); assert.equal(m.net, 749.49); assert.equal(m.cats.Food, 250.51);
  assert.equal(S.monthlyTrend(6).length, 6);
});
t('savings goals', () => {
  assert.match(S.addSaving({ name: 'Phone', target: 0 }), /greater/); S.addSaving({ name: 'Phone', target: 1000, saved: 100 });
  const g = S.state.savings[0]; assert.match(S.contribute(g.id, -1), /greater/); S.contribute(g.id, 900); assert.equal(g.saved, 1000); assert.ok(S.state.achievements.saver);
});
t('notes + events validation', () => {
  assert.match(S.saveNote({ title: '' }), /required/); S.saveNote({ title: 'A', body: 'b', tags: 'x, X, y' }); assert.deepEqual(S.state.notes[0].tags, ['x', 'y']);
  assert.match(S.addEvent({ title: 'e', date: 'nope' }), /valid date/); assert.equal(S.addEvent({ title: 'e', date: today, time: '10:00', remind: true }), '');
});
t('budget validation', () => { assert.match(S.setBudget(-1), /0 or more/); assert.equal(S.setBudget(500, { Food: 100 }), ''); assert.equal(S.state.budgets.cats.Food, 100); });
t('notification schedule', () => {
  const now = new Date(); const d = U.addDays(today, 1); S.state.tasks.unshift({ id: 'tt1', title: 'Call', due: d, time: '09:30', done: false, subtasks: [] });
  S.state.habits[0].reminder = '07:15'; const sch = N.buildSchedule(S.state, now);
  assert.ok(sch.find((x) => x.body === 'Call' && x.at > now)); assert.equal(sch.filter((x) => x.title.startsWith('Time for: Run')).length, 7);
  assert.ok(sch.find((x) => x.title === 'Your DayLoop for today')); assert.equal(new Set(sch.map((x) => x.id)).size, sch.length, 'ids unique');
  S.state.settings.notifications = false; assert.equal(N.buildSchedule(S.state, now).length, 0); S.state.settings.notifications = true;
});
t('normalize old/corrupt data', () => { S.replaceState({ tasks: 'bad', settings: { name: 'Z' } }); assert.deepEqual(S.state.tasks, []); assert.equal(S.state.settings.currency, '₹'); });
t('util: esc, money, dates', () => {
  assert.equal(U.esc('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;'); assert.equal(U.money(1234.5), '₹1,234.50'); assert.equal(U.money(-50), '-₹50');
  assert.equal(U.isValidDate('2026-02-29'), false); assert.equal(U.isValidDate('2028-02-29'), true);
});
await S.load(); S.replaceState({}); S.state.tasks.push({ id: 'z', title: 'persist', done: false, subtasks: [] }); await S.flush();
t('persistence to single dir', () => { assert.ok([...store.keys()].every((k) => k.startsWith('DayLoop/')), [...store.keys()].join()); });
await S.wipeStorage(); t('wipe removes the whole dir', () => assert.equal(store.size, 0));
console.log(`\n${n} test groups passed`);
