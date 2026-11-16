// Small, dependency-free helpers shared by every module.
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const p2 = (n) => String(n).padStart(2, '0');
export const ymd = (d = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const monthKey = (s) => s.slice(0, 7);
export const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && ymd(parseYmd(s)) === s;
export const isValidTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s || '');
export const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

export function money(n, cur = '₹') {
  const v = Math.abs(Number(n) || 0);
  const s = v.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: v % 1 ? 2 : 0 });
  return (n < 0 ? '-' : '') + cur + s;
}
export function prettyDate(s) {
  if (!s) return '';
  const today = ymd();
  if (s === today) return 'Today';
  if (s === addDays(today, 1)) return 'Tomorrow';
  if (s === addDays(today, -1)) return 'Yesterday';
  const d = parseYmd(s);
  return `${DAY[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}
export function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
// Stable positive 31-bit hash -> usable as a notification id.
export function hash(str) {
  let h = 7;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h) % 2147483000 + 1;
}
