// Local notifications (Capacitor) with browser Notification-API fallback + in-app inbox.
import { state, habitsToday, monthSummary, pushInbox } from './store.js';
import { hash, ymd, parseYmd, addDays, money } from './util.js';

const LN = () => globalThis.Capacitor?.Plugins?.LocalNotifications;
const isNative = () => !!globalThis.Capacitor?.isNativePlatform?.() && !!LN();

export async function permission(request = false) {
  try {
    if (isNative()) {
      let p = await LN().checkPermissions();
      if (p.display !== 'granted' && request) p = await LN().requestPermissions();
      return p.display === 'granted';
    }
    if (!('Notification' in globalThis)) return false;
    if (Notification.permission === 'default' && request) await Notification.requestPermission();
    return Notification.permission === 'granted';
  } catch { return false; }
}

// Builds the full list of future notifications from current state (pure → testable).
export function buildSchedule(s = state, now = new Date()) {
  const out = []; if (!s.settings.notifications) return out;
  const today = ymd(now); const hm = (t) => t.split(':').map(Number);
  const at = (date, time) => { const [h, m] = hm(time); const d = parseYmd(date); d.setHours(h, m, 0, 0); return d; };

  for (const t of s.tasks) {
    if (t.done || !t.due || !t.time) continue;
    const when = at(t.due, t.time); if (when > now) out.push({ id: hash('task' + t.id), title: 'Task due', body: t.title, at: when });
  }
  for (const e of s.events) {
    if (!e.remind || !e.time) continue;
    const when = at(e.date, e.time); if (when > now) out.push({ id: hash('ev' + e.id), title: 'Upcoming event', body: e.title, at: when });
  }
  for (const h of s.habits) {
    if (h.archived || !h.reminder) continue;
    const [H, M] = hm(h.reminder);
    for (const wd of h.days) out.push({ id: hash(`hab${h.id}${wd}`), title: `Time for: ${h.name}`, body: 'Keep your streak going.', every: { weekday: wd + 1, hour: H, minute: M } });
  }
  if (s.settings.dailyBrief) {
    const [H, M] = hm(s.settings.dailyBrief);
    out.push({ id: hash('daily-brief'), title: 'Your DayLoop for today', body: 'Open DayLoop to see today\'s tasks and habits.', every: { hour: H, minute: M } });
  }
  return out;
}

export async function reschedule() {
  const list = buildSchedule();
  if (!isNative()) return list.length;
  try {
    const pending = await LN().getPending();
    if (pending.notifications.length) await LN().cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    if (!list.length || !(await permission(false))) return 0;
    await LN().schedule({ notifications: list.map((n) => ({ id: n.id, title: n.title, body: n.body, schedule: n.at ? { at: n.at, allowWhileIdle: true } : { on: n.every, allowWhileIdle: true }, smallIcon: 'ic_stat_icon' })) });
  } catch (e) { console.error('schedule failed', e); }
  return list.length;
}

// Immediate alert (budget limits etc.) – also lands in the in-app inbox.
export async function alertNow(title, body) {
  pushInbox(title, body);
  try {
    if (isNative()) { if (await permission(false)) await LN().schedule({ notifications: [{ id: hash(title + Date.now()), title, body, schedule: { at: new Date(Date.now() + 800) } }] }); }
    else if (await permission(false)) new Notification(title, { body });
  } catch { /* non-fatal */ }
}

const alerted = new Set();
export function checkBudget() {
  const s = state; if (!s.settings.budgetAlerts || !s.budgets.total) return;
  const m = monthSummary(); const ratio = m.expense / s.budgets.total; const mk = ymd().slice(0, 7);
  const level = ratio >= 1 ? 100 : ratio >= 0.8 ? 80 : 0; const key = `${mk}:${level}`;
  if (level && !alerted.has(key) && !s.inbox.some((i) => i.title.startsWith('Budget') && i.key === key)) {
    alerted.add(key);
    alertNow(level === 100 ? 'Budget exceeded' : 'Budget 80% used', `You've spent ${money(m.expense, s.settings.currency)} of ${money(s.budgets.total, s.settings.currency)} this month.`);
    state.inbox[0].key = key;
  }
}

// In-app reminders while the app is open (covers task/event reminders the OS would also show).
export function dueNow(now = new Date()) {
  const today = ymd(now); const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return [...state.tasks.filter((t) => !t.done && t.due === today && t.time === hhmm).map((t) => ({ k: 't' + t.id + today, title: 'Task due now', body: t.title })),
    ...state.events.filter((e) => e.remind && e.date === today && e.time === hhmm).map((e) => ({ k: 'e' + e.id, title: 'Event starting', body: e.title }))];
}

// Android 12+: exact alarms need user consent. Without it, Android delivers reminders inexactly (a few minutes late).
export async function exactAlarm(request = false) {
  if (!isNative()) return 'granted';
  try {
    let r = await LN().checkExactNotificationSetting();
    if (r.exact_alarm !== 'granted' && request) r = await LN().changeExactNotificationSetting();
    return r.exact_alarm;
  } catch { return 'granted'; } // older Android: no restriction
}
