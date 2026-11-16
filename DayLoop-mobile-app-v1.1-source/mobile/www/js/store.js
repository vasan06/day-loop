// State, persistence (single app directory "DayLoop/") and domain logic.
import { uid, ymd, addDays, parseYmd, monthKey, isValidDate, isValidTime, clamp } from './util.js';

export const APP_DIR = 'DayLoop';
const FILE = `${APP_DIR}/data.json`;
const BACKUP = `${APP_DIR}/data.bak.json`;
export const EXPENSE_CATS = ['Food', 'Transport', 'Bills', 'Shopping', 'Health', 'Fun', 'Education', 'Other'];
export const INCOME_CATS = ['Salary', 'Stipend', 'Gift', 'Freelance', 'Other'];
export const COLORS = ['#df785f', '#69465f', '#d6a64d', '#a996c7', '#8c9a7b', '#5f8fa8'];

export const defaults = () => ({
  v: 1,
  settings: { name: '', currency: '₹', notifications: true, dailyBrief: '08:00', budgetAlerts: true, onboarded: false },
  tasks: [], projects: [], habits: [], transactions: [],
  budgets: { total: 0, cats: {} }, savings: [], notes: [], events: [], inbox: [], achievements: {},
});

export let state = defaults();
const listeners = new Set();
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));

// ---------- storage adapter: native Filesystem on Android, localStorage in a browser ----------
const FS = () => globalThis.Capacitor?.Plugins?.Filesystem;
const native = () => !!globalThis.Capacitor?.isNativePlatform?.() && !!FS();

async function readRaw(path) {
  if (native()) {
    try { return (await FS().readFile({ path, directory: 'DATA', encoding: 'utf8' })).data; } catch { return null; }
  }
  try { return localStorage.getItem(path); } catch { return null; }
}
async function writeRaw(path, data) {
  if (native()) {
    await FS().writeFile({ path, data, directory: 'DATA', encoding: 'utf8', recursive: true });
  } else localStorage.setItem(path, data);
}
export async function wipeStorage() {
  if (native()) {
    try { await FS().rmdir({ path: APP_DIR, directory: 'DATA', recursive: true }); } catch { /* already gone */ }
  } else {
    Object.keys(localStorage).filter((k) => k.startsWith(APP_DIR + '/')).forEach((k) => localStorage.removeItem(k));
  }
}
export async function writeExport(name, data) {
  const path = `${APP_DIR}/exports/${name}`;
  await writeRaw(path, data);
  return native() ? `App storage › ${path}` : path;
}

// merge so a file from an older version never lacks new keys
function normalize(raw) {
  const d = defaults();
  const s = { ...d, ...raw, settings: { ...d.settings, ...(raw.settings || {}) }, budgets: { ...d.budgets, ...(raw.budgets || {}) } };
  for (const k of ['tasks', 'projects', 'habits', 'transactions', 'savings', 'notes', 'events', 'inbox']) if (!Array.isArray(s[k])) s[k] = [];
  if (!s.budgets.cats || typeof s.budgets.cats !== 'object') s.budgets.cats = {};
  if (!s.achievements || typeof s.achievements !== 'object') s.achievements = {};
  return s;
}
export function replaceState(raw) { state = normalize(raw); emit(); }

export async function load() {
  for (const p of [FILE, BACKUP]) {
    const raw = await readRaw(p);
    if (!raw) continue;
    try { state = normalize(JSON.parse(raw)); return true; } catch { /* try backup */ }
  }
  state = defaults();
  return false;
}
let timer = null; let saving = Promise.resolve();
export function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 250);
}
export function flush() {
  clearTimeout(timer);
  const json = JSON.stringify(state);
  saving = saving.then(async () => {
    try {
      const prev = await readRaw(FILE);
      if (prev) await writeRaw(BACKUP, prev);
      await writeRaw(FILE, json);
    } catch (e) { console.error('save failed', e); }
  });
  return saving;
}
function emit() { listeners.forEach((f) => f()); }
export function commit() { save(); checkAchievements(); emit(); }

// ---------- validation helpers (return error string or '') ----------
const text = (v, label, max = 80, req = true) => {
  const s = String(v ?? '').trim();
  if (req && !s) return `${label} is required`;
  if (s.length > max) return `${label} must be ${max} characters or fewer`;
  return '';
};
const amount = (v) => {
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return 'Enter an amount greater than 0';
  if (n > 1e9) return 'Amount is too large';
  return '';
};

// ---------- tasks ----------
export function addTask(t) {
  const title = String(t.title ?? '').trim();
  const err = text(title, 'Title', 120) || (t.due && !isValidDate(t.due) ? 'Invalid due date' : '')
    || (t.time && !isValidTime(t.time) ? 'Invalid time' : '') || (t.time && !t.due ? 'Pick a due date for the reminder time' : '')
    || (t.repeat && !REPEATS.includes(t.repeat) ? 'Invalid repeat option' : '') || (t.repeat && !t.due ? 'Pick a due date for a repeating task' : '');
  if (err) return err;
  state.tasks.unshift({ id: uid(), title, notes: String(t.notes || '').trim().slice(0, 500), projectId: t.projectId || null,
    priority: clamp(Number(t.priority) || 4, 1, 4), due: t.due || null, time: t.time || null, repeat: t.repeat || null, anchorDay: t.due ? parseYmd(t.due).getDate() : null, spawned: false, done: false, doneAt: null, created: Date.now(), subtasks: [] });
  commit(); return '';
}
export const REPEATS = ['daily', 'weekly', 'monthly'];
// Next occurrence strictly after both the previous due date and `today`.
export function nextDue(due, repeat, anchorDay, today = ymd()) {
  let cur = due; let guard = 0;
  do {
    const d = parseYmd(cur);
    if (repeat === 'daily') d.setDate(d.getDate() + 1);
    else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
    else { // monthly: keep the original day, clamped to month length
      const day = anchorDay || d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + 1);
      d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    }
    cur = ymd(d);
  } while (cur <= today && ++guard < 40000);
  return cur;
}
export function toggleTask(id) {
  const t = state.tasks.find((x) => x.id === id); if (!t) return;
  t.done = !t.done; t.doneAt = t.done ? Date.now() : null;
  if (t.done) t.subtasks.forEach((s) => (s.done = true));
  if (t.done && t.repeat && t.due && !t.spawned) { // regenerate once per occurrence
    t.spawned = true;
    state.tasks.unshift({ ...t, id: uid(), due: nextDue(t.due, t.repeat, t.anchorDay), done: false, doneAt: null, spawned: false, created: Date.now(), subtasks: t.subtasks.map((x) => ({ id: uid(), title: x.title, done: false })) });
  }
  commit();
}
export function addSubtask(id, title) {
  const t = state.tasks.find((x) => x.id === id); const e = text(title, 'Subtask', 80);
  if (!t) return 'Task not found'; if (e) return e;
  t.subtasks.push({ id: uid(), title: title.trim(), done: false }); commit(); return '';
}
export function toggleSubtask(id, sid) {
  const t = state.tasks.find((x) => x.id === id); const s = t?.subtasks.find((x) => x.id === sid); if (!s) return;
  s.done = !s.done; if (t.subtasks.every((x) => x.done) && !t.done) { t.done = true; t.doneAt = Date.now(); }
  commit();
}
export const deleteTask = (id) => { state.tasks = state.tasks.filter((t) => t.id !== id); commit(); };
export const taskOverdue = (t) => !t.done && t.due && t.due < ymd();

// ---------- projects ----------
export function addProject(p) {
  const name = String(p.name ?? '').trim();
  const err = text(name, 'Name', 40) || (state.projects.some((x) => x.name.toLowerCase() === name.toLowerCase()) ? 'A project with this name exists' : '');
  if (err) return err;
  state.projects.push({ id: uid(), name, desc: String(p.desc || '').trim().slice(0, 200), color: p.color || COLORS[state.projects.length % COLORS.length], status: 'active', created: Date.now() });
  commit(); return '';
}
export function deleteProject(id) {
  state.projects = state.projects.filter((p) => p.id !== id);
  state.tasks.forEach((t) => { if (t.projectId === id) t.projectId = null; });
  commit();
}
export function projectStats(id) {
  const ts = state.tasks.filter((t) => t.projectId === id);
  const done = ts.filter((t) => t.done).length;
  return { total: ts.length, done, open: ts.length - done, pct: ts.length ? Math.round((done / ts.length) * 100) : 0, overdue: ts.filter(taskOverdue).length };
}

// ---------- habits ----------
export function addHabit(h) {
  const name = String(h.name ?? '').trim();
  const days = (h.days?.length ? h.days : [0, 1, 2, 3, 4, 5, 6]).map(Number).filter((d) => d >= 0 && d <= 6);
  const err = text(name, 'Habit name', 40) || (state.habits.some((x) => !x.archived && x.name.toLowerCase() === name.toLowerCase()) ? 'You already track this habit' : '')
    || (h.reminder && !isValidTime(h.reminder) ? 'Invalid reminder time' : '');
  if (err) return err;
  state.habits.push({ id: uid(), name, icon: h.icon || '✦', color: h.color || COLORS[state.habits.length % COLORS.length], days: [...new Set(days)].sort(), reminder: h.reminder || null, created: ymd(), log: {}, archived: false });
  commit(); return '';
}
export function toggleHabit(id, date = ymd()) {
  const h = state.habits.find((x) => x.id === id); if (!h) return 'Habit not found';
  if (date > ymd()) return 'You cannot check in for a future date';
  if (h.log[date]) delete h.log[date]; else h.log[date] = true;
  commit(); return '';
}
export const deleteHabit = (id) => { state.habits = state.habits.filter((h) => h.id !== id); commit(); };
export const habitScheduled = (h, date) => h.days.includes(parseYmd(date).getDay());

export function habitStats(h, today = ymd()) {
  // current streak: consecutive scheduled days done; today pending doesn't break it
  let cur = 0; let d = today;
  if (habitScheduled(h, d) && !h.log[d]) d = addDays(d, -1);
  for (let i = 0; i < 1000; i++) {
    if (d < h.created && !h.log[d]) break;
    if (habitScheduled(h, d)) { if (h.log[d]) cur++; else break; }
    d = addDays(d, -1);
  }
  // best streak across all logged history
  const dates = Object.keys(h.log).sort(); let best = 0;
  if (dates.length) {
    let run = 0; let day = dates[0];
    while (day <= today) {
      if (habitScheduled(h, day)) { if (h.log[day]) { run++; best = Math.max(best, run); } else run = 0; }
      day = addDays(day, 1);
    }
  }
  // 30-day completion rate
  let sched = 0; let done = 0;
  for (let i = 0; i < 30; i++) {
    const dd = addDays(today, -i); if (dd < h.created) break;
    if (habitScheduled(h, dd)) { sched++; if (h.log[dd]) done++; }
  }
  return { current: cur, best: Math.max(best, cur), rate: sched ? Math.round((done / sched) * 100) : 0, total: dates.length };
}
export const habitsToday = (date = ymd()) => state.habits.filter((h) => !h.archived && habitScheduled(h, date));

// ---------- finance ----------
export function addTransaction(t) {
  const err = (t.type !== 'income' && t.type !== 'expense' ? 'Choose income or expense' : '') || amount(t.amount)
    || (!isValidDate(t.date) ? 'Invalid date' : '') || (t.date > ymd() ? 'Date cannot be in the future' : '') || text(t.note, 'Note', 80, false);
  if (err) return err;
  state.transactions.unshift({ id: uid(), type: t.type, amount: Math.round(Number(t.amount) * 100) / 100, cat: t.cat || 'Other', note: String(t.note || '').trim(), date: t.date, created: Date.now() });
  commit(); return '';
}
export const deleteTransaction = (id) => { state.transactions = state.transactions.filter((t) => t.id !== id); commit(); };
export function monthSummary(mk = monthKey(ymd())) {
  let income = 0; let expense = 0; const cats = {};
  for (const t of state.transactions) {
    if (monthKey(t.date) !== mk) continue;
    if (t.type === 'income') income += t.amount; else { expense += t.amount; cats[t.cat] = (cats[t.cat] || 0) + t.amount; }
  }
  return { income, expense, net: income - expense, cats };
}
export function monthlyTrend(n = 6) {
  const out = []; const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1); const mk = ymd(d).slice(0, 7);
    out.push({ key: mk, label: d.toLocaleString('en', { month: 'short' }), ...monthSummary(mk) });
  }
  return out;
}
export function setBudget(total, cats = {}) {
  const t = Number(total);
  if (!isFinite(t) || t < 0) return 'Budget must be 0 or more';
  state.budgets.total = t;
  for (const [k, v] of Object.entries(cats)) { const n = Number(v); if (isFinite(n) && n > 0) state.budgets.cats[k] = n; else delete state.budgets.cats[k]; }
  commit(); return '';
}
export function addSaving(s) {
  const err = text(s.name, 'Goal name', 40) || amount(s.target) || (s.saved !== '' && s.saved != null && Number(s.saved) < 0 ? 'Saved cannot be negative' : '')
    || (s.deadline && !isValidDate(s.deadline) ? 'Invalid deadline' : '');
  if (err) return err;
  state.savings.push({ id: uid(), name: s.name.trim(), target: Number(s.target), saved: Number(s.saved) || 0, deadline: s.deadline || null });
  commit(); return '';
}
export function contribute(id, v) {
  const s = state.savings.find((x) => x.id === id); const e = amount(v); if (!s) return 'Goal not found'; if (e) return e;
  s.saved += Number(v); commit(); return '';
}
export const deleteSaving = (id) => { state.savings = state.savings.filter((s) => s.id !== id); commit(); };

// ---------- notes ----------
export function saveNote(n) {
  const title = String(n.title ?? '').trim();
  const err = text(title, 'Title', 80) || (String(n.body || '').length > 20000 ? 'Note is too long' : '');
  if (err) return err;
  const tags = [...new Set(String(n.tags || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean))].slice(0, 6);
  if (n.id) {
    const x = state.notes.find((q) => q.id === n.id); if (!x) return 'Note not found';
    Object.assign(x, { title, body: n.body || '', tags, updated: Date.now() });
  } else state.notes.unshift({ id: uid(), title, body: n.body || '', tags, pinned: false, updated: Date.now() });
  commit(); return '';
}
export const toggleNotePin = (id) => { const n = state.notes.find((x) => x.id === id); if (n) { n.pinned = !n.pinned; commit(); } };
export const deleteNote = (id) => { state.notes = state.notes.filter((n) => n.id !== id); commit(); };

// ---------- events ----------
export function addEvent(e) {
  const err = text(e.title, 'Title', 80) || (!isValidDate(e.date) ? 'Pick a valid date' : '') || (e.time && !isValidTime(e.time) ? 'Invalid time' : '');
  if (err) return err;
  state.events.push({ id: uid(), title: e.title.trim(), date: e.date, time: e.time || null, notes: String(e.notes || '').slice(0, 300), remind: !!e.remind && !!e.time });
  commit(); return '';
}
export const deleteEvent = (id) => { state.events = state.events.filter((e) => e.id !== id); commit(); };

// ---------- inbox ----------
export function pushInbox(title, body) {
  state.inbox.unshift({ id: uid(), title, body, ts: Date.now(), read: false });
  state.inbox = state.inbox.slice(0, 100); save(); emit();
}

// ---------- dashboard stats ----------
export function dayScore(date) {
  const hs = habitsToday(date); const hd = hs.filter((h) => h.log[date]).length;
  const ts = state.tasks.filter((t) => t.due === date); const td = ts.filter((t) => t.done).length;
  const total = hs.length + ts.length; return { total, done: hd + td };
}
export function weekActivity(today = ymd()) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    const doneTasks = state.tasks.filter((t) => t.doneAt && ymd(new Date(t.doneAt)) === date).length;
    const doneHabits = state.habits.filter((h) => h.log[date]).length;
    return { date, value: doneTasks + doneHabits };
  });
}
export function overallStreak(today = ymd()) {
  // days in a row with any completed habit or task
  const active = (d) => state.habits.some((h) => h.log[d]) || state.tasks.some((t) => t.doneAt && ymd(new Date(t.doneAt)) === d);
  let d = today; if (!active(d)) d = addDays(d, -1);
  let n = 0; while (active(d) && n < 3650) { n++; d = addDays(d, -1); }
  return n;
}

// ---------- achievements ----------
export const BADGES = [
  { id: 'first_task', icon: '✓', name: 'First step', desc: 'Complete your first task', test: (s) => s.tasks.some((t) => t.done) },
  { id: 'tasks_25', icon: '⚑', name: 'Getting things done', desc: 'Complete 25 tasks', test: (s) => s.tasks.filter((t) => t.done).length >= 25 },
  { id: 'habit_3', icon: '🔥', name: 'Warming up', desc: '3-day habit streak', test: (s) => s.habits.some((h) => habitStats(h).best >= 3) },
  { id: 'habit_7', icon: '🔥', name: 'One full week', desc: '7-day habit streak', test: (s) => s.habits.some((h) => habitStats(h).best >= 7) },
  { id: 'habit_30', icon: '🏆', name: 'Habit master', desc: '30-day habit streak', test: (s) => s.habits.some((h) => habitStats(h).best >= 30) },
  { id: 'project_done', icon: '◆', name: 'Project closed', desc: 'Finish every task in a project', test: (s) => s.projects.some((p) => { const x = projectStats(p.id); return x.total >= 2 && x.pct === 100; }) },
  { id: 'saver', icon: '₹', name: 'Saver', desc: 'Reach a savings goal', test: (s) => s.savings.some((g) => g.saved >= g.target) },
  { id: 'budget_keeper', icon: '◎', name: 'Budget keeper', desc: 'Finish a month under budget (with a budget set)', test: (s) => s.budgets.total > 0 && s.transactions.some((t) => t.type === 'expense') && monthSummary().expense <= s.budgets.total && new Date().getDate() >= 25 },
  { id: 'writer', icon: '✎', name: 'Note taker', desc: 'Write 5 notes', test: (s) => s.notes.length >= 5 },
];
export const pendingToasts = [];
export function checkAchievements() {
  for (const b of BADGES) {
    if (!state.achievements[b.id] && b.test(state)) {
      state.achievements[b.id] = Date.now(); pendingToasts.push(b);
      state.inbox.unshift({ id: uid(), title: `Achievement unlocked: ${b.name}`, body: b.desc, ts: Date.now(), read: false });
    }
  }
}

// ---------- backup import (validate fully before touching live data) ----------
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const LISTS = ['tasks', 'projects', 'habits', 'transactions', 'savings', 'notes', 'events', 'inbox'];
export function validateBackup(text) {
  if (typeof text !== 'string' || !text.trim()) return { error: 'File is empty' };
  if (text.length > MAX_IMPORT_BYTES) return { error: 'File is too large (5 MB max)' };
  let raw; try { raw = JSON.parse(text); } catch { return { error: 'Not a valid JSON file' }; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Not a DayLoop backup' };
  if (typeof raw.v !== 'number' || raw.v > 1) return { error: 'Unsupported backup version' };
  if (!raw.settings || typeof raw.settings !== 'object') return { error: 'Not a DayLoop backup (settings missing)' };
  for (const k of LISTS) {
    if (raw[k] === undefined) continue;
    if (!Array.isArray(raw[k])) return { error: `"${k}" must be a list` };
    if (raw[k].length > 50000) return { error: `Too many ${k}` };
    if (raw[k].some((i) => !i || typeof i !== 'object' || Array.isArray(i))) return { error: `"${k}" contains an invalid entry` };
  }
  if (raw.tasks?.some((t) => typeof t.title !== 'string' || (t.due && !isValidDate(t.due)))) return { error: 'A task has a bad title or date' };
  if (raw.habits?.some((h) => typeof h.name !== 'string' || !Array.isArray(h.days) || (h.log && typeof h.log !== 'object'))) return { error: 'A habit is malformed' };
  if (raw.transactions?.some((t) => !isFinite(Number(t.amount)))) return { error: 'A transaction has a bad amount' };
  if (raw.notes?.some((n) => typeof n.title !== 'string' && typeof n.body !== 'string')) return { error: 'A note is malformed' };
  if (raw.events?.some((e) => typeof e.title !== 'string' || !isValidDate(e.date))) return { error: 'An event has a bad title or date' };
  const data = normalize(raw);
  data.tasks.forEach((t) => { if (!Array.isArray(t.subtasks)) t.subtasks = []; });
  data.habits.forEach((h) => { if (!h.log || typeof h.log !== 'object') h.log = {}; });
  const counts = Object.fromEntries(LISTS.slice(0, 7).map((k) => [k, data[k].length]));
  return { data, counts };
}
// Keeps a safety copy of the current data in DayLoop/exports before replacing it.
export async function applyImport(data) {
  await flush();
  await writeExport(`pre-import-${Date.now()}.json`, JSON.stringify(state));
  state = normalize(data); await flush(); emit();
}
