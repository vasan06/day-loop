import * as S from './store.js';
import { state } from './store.js';
import { esc, ymd, addDays, parseYmd, prettyDate, greeting, money, pct, DAY, MONTHS, monthKey } from './util.js';
import * as C from './charts.js';
import * as N from './notify.js';

const $ = (s, r = document) => r.querySelector(s);
const cur = () => state.settings.currency || '₹';
const route = { tab: 'today', sub: null, filter: 'today', projectFilter: '', calMonth: ymd().slice(0, 7), calSel: ymd(), noteQ: '', moneyTab: 'overview' };
let sheetOpen = false;

const ICON = {
  today: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  tasks: '<path d="M5 12l4 4 10-10"/>',
  habits: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-9z"/>',
  money: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', back: '<path d="M15 5l-7 7 7 7"/>', bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', chev: '<path d="M9 5l7 7-7 7"/>',
};
const ic = (n, s = 22) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

// ---------- toasts ----------
export function toast(msg, kind = '') {
  const t = document.createElement('div'); t.className = `toast ${kind}`; t.textContent = msg; t.setAttribute('role', 'status');
  $('#toasts').appendChild(t); setTimeout(() => t.classList.add('out'), 2600); setTimeout(() => t.remove(), 3000);
}
function drainBadges() { while (S.pendingToasts.length) { const b = S.pendingToasts.shift(); toast(`${b.icon} Unlocked: ${b.name}`, 'gold'); } }

// ---------- sheet ----------
function openSheet(title, body, { onSubmit, full = false, submitLabel = 'Save', hideSubmit = false } = {}) {
  const el = $('#sheet');
  if (!sheetOpen) { history.pushState({ sheet: 1 }, ''); sheetOpen = true; }
  el.className = `sheet open${full ? ' full' : ''}`; el.setAttribute('aria-hidden', 'false');
  el.innerHTML = `<div class="sheet-backdrop" data-a="close"></div><form class="sheet-card" novalidate role="dialog" aria-label="${esc(title)}">
    <div class="sheet-grip"></div><div class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="x" data-a="close" aria-label="Close">✕</button></div>
    <div class="sheet-body">${body}</div><p class="form-err" id="ferr" role="alert"></p>
    ${hideSubmit ? '' : `<button class="btn primary wide" type="submit">${esc(submitLabel)}</button>`}</form>`;
  const form = $('form', el);
  form.onsubmit = (e) => {
    e.preventDefault(); if (!onSubmit) return;
    const err = onSubmit(new FormData(form), form);
    if (err) { $('#ferr').textContent = err; form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); }
    else if (err === '') closeSheet();
  };
  setTimeout(() => form.querySelector('[autofocus]')?.focus(), 250);
}
function closeSheet() { if (sheetOpen) history.back(); }
function hideSheetDom() {
  sheetOpen = false; const el = $('#sheet'); el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); setTimeout(() => { if (!sheetOpen) el.innerHTML = ''; }, 280);
}
const field = (label, name, o = {}) => `<label class="fld"><span>${esc(label)}</span>${o.area ? `<textarea name="${name}" rows="${o.rows || 3}" maxlength="${o.max || 500}" ${o.af ? 'autofocus' : ''} placeholder="${esc(o.ph || '')}">${esc(o.v || '')}</textarea>`
  : `<input name="${name}" type="${o.type || 'text'}" value="${esc(o.v ?? '')}" ${o.max ? `maxlength="${o.max}"` : ''} ${o.step ? `step="${o.step}"` : ''} ${o.min != null ? `min="${o.min}"` : ''} ${o.inputmode ? `inputmode="${o.inputmode}"` : ''} placeholder="${esc(o.ph || '')}" ${o.af ? 'autofocus' : ''}>`}</label>`;
const select = (label, name, opts, val = '') => `<label class="fld"><span>${esc(label)}</span><select name="${name}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
const seg = (name, opts, val) => `<div class="seg">${opts.map(([v, t]) => `<label><input type="radio" name="${name}" value="${v}" ${v === val ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('')}</div>`;

// ---------- reusable pieces ----------
const empty = (t, s = '') => `<div class="empty"><div class="empty-mark">◌</div><strong>${esc(t)}</strong><p>${esc(s)}</p></div>`;
const PRI = { 1: ['P1', 'var(--coral)'], 2: ['P2', 'var(--saffron)'], 3: ['P3', 'var(--lilac)'], 4: ['', 'var(--line)'] };
function taskRow(t) {
  const p = state.projects.find((x) => x.id === t.projectId); const od = S.taskOverdue(t);
  const subs = t.subtasks.length ? `${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}` : '';
  return `<div class="row task${t.done ? ' done' : ''}" style="--pc:${PRI[t.priority][1]}">
    <button class="chk${t.done ? ' on' : ''}" data-a="tt" data-id="${t.id}" aria-label="${t.done ? 'Mark not done' : 'Mark done'}: ${esc(t.title)}"><svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10"/></svg></button>
    <div class="row-main" data-a="task" data-id="${t.id}"><strong>${esc(t.title)}</strong>
      <small>${p ? `<i class="dot" style="background:${p.color}"></i>${esc(p.name)} · ` : ''}${t.due ? `<span class="${od ? 'bad' : ''}">${prettyDate(t.due)}${t.time ? ' ' + t.time : ''}${t.repeat ? ' ↻' : ''}</span>` : 'No date'}${subs ? ` · ☰ ${subs}` : ''}${PRI[t.priority][0] ? ` · <b style="color:${PRI[t.priority][1]}">${PRI[t.priority][0]}</b>` : ''}</small></div></div>`;
}
const habitRow = (h, date = ymd()) => {
  const st = S.habitStats(h); const on = !!h.log[date];
  return `<div class="row habit${on ? ' done' : ''}" style="--hc:${h.color}"><button class="chk round${on ? ' on' : ''}" data-a="th" data-id="${h.id}" aria-label="${on ? 'Undo' : 'Check in'}: ${esc(h.name)}"><svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10"/></svg></button>
    <div class="row-main" data-a="habit" data-id="${h.id}"><strong><span class="hi">${esc(h.icon)}</span> ${esc(h.name)}</strong><small>🔥 ${st.current} day streak · ${st.rate}% (30d)${h.reminder ? ' · ⏰ ' + h.reminder : ''}</small></div></div>`;
};

// ================= VIEWS =================
function viewToday() {
  const today = ymd(); const sc = S.dayScore(today); const p = pct(sc.done, sc.total);
  const habits = S.habitsToday(); const due = state.tasks.filter((t) => !t.done && t.due && t.due <= today).sort((a, b) => a.due.localeCompare(b.due) || a.priority - b.priority);
  const week = S.weekActivity().map((d) => ({ label: DAY[parseYmd(d.date).getDay()][0], value: d.value, highlight: d.date === today }));
  const m = S.monthSummary(); const evs = state.events.filter((e) => e.date >= today).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))).slice(0, 3);
  const streak = S.overallStreak(); const budget = state.budgets.total;
  const name = state.settings.name ? `, ${esc(state.settings.name.split(' ')[0])}` : '';
  return `<header class="hero"><p class="eyebrow"><i class="dot"></i>${DAY[new Date().getDay()].toUpperCase()} · ${new Date().getDate()} ${MONTHS[new Date().getMonth()].toUpperCase()}</p>
    <h1>${greeting()}${name}.<br><em>Make room for what matters.</em></h1></header>
  <section class="grid2"><div class="card ringcard"><div class="kicker">TODAY'S PROGRESS</div><div class="ringrow">${C.ring(p, { center: p + '%', sub: `${sc.done}/${sc.total}` })}
    <div class="ringtext"><strong>${sc.total ? (p === 100 ? 'All done!' : `${sc.total - sc.done} left`) : 'Nothing planned'}</strong><small>${sc.total ? 'Tasks due + habits scheduled today' : 'Add a task or habit to begin'}</small></div></div></div>
    <div class="card"><div class="kicker">STREAK</div><div class="big">${streak}<small> day${streak === 1 ? '' : 's'}</small></div><p class="muted">Days in a row with activity</p></div>
    <div class="card"><div class="kicker">OPEN TASKS</div><div class="big">${state.tasks.filter((t) => !t.done).length}</div><p class="muted">${state.tasks.filter(S.taskOverdue).length ? `<span class="bad">${state.tasks.filter(S.taskOverdue).length} overdue</span>` : 'None overdue'}</p></div>
    <div class="card wk"><div class="kicker">THIS WEEK · COMPLETED</div>${C.bars(week, { height: 86 })}</div></section>
  <section class="card"><div class="sec"><h2>Habits today</h2><button class="link" data-a="tab" data-t="habits">All ${ic('chev', 14)}</button></div>${habits.length ? habits.map((h) => habitRow(h)).join('') : empty('No habits scheduled', 'Create one from the Habits tab.')}</section>
  <section class="card"><div class="sec"><h2>Due &amp; overdue</h2><button class="link" data-a="tab" data-t="tasks">All ${ic('chev', 14)}</button></div>${due.length ? due.slice(0, 6).map(taskRow).join('') : empty('You are clear', 'No tasks due today.')}</section>
  ${evs.length ? `<section class="card"><div class="sec"><h2>Coming up</h2><button class="link" data-a="sub" data-s="calendar">Calendar ${ic('chev', 14)}</button></div>${evs.map((e) => `<div class="row"><div class="evdate"><b>${parseYmd(e.date).getDate()}</b><small>${MONTHS[parseYmd(e.date).getMonth()].slice(0, 3)}</small></div><div class="row-main"><strong>${esc(e.title)}</strong><small>${prettyDate(e.date)}${e.time ? ' · ' + e.time : ''}</small></div></div>`).join('')}</section>` : ''}
  <section class="card"><div class="sec"><h2>Money · ${MONTHS[new Date().getMonth()]}</h2><button class="link" data-a="tab" data-t="money">Open ${ic('chev', 14)}</button></div>
    <div class="trio"><div><small>Income</small><strong class="pos">${money(m.income, cur())}</strong></div><div><small>Spent</small><strong class="neg">${money(m.expense, cur())}</strong></div><div><small>Net</small><strong>${money(m.net, cur())}</strong></div></div>
    ${budget ? `${C.meter(pct(m.expense, budget), m.expense > budget ? 'var(--bad)' : 'var(--coral)')}<small class="muted">${pct(m.expense, budget)}% of ${money(budget, cur())} budget</small>` : '<small class="muted">Set a monthly budget in Money to track limits.</small>'}</section>`;
}

function viewTasks() {
  const today = ymd(); let list = state.tasks.slice();
  if (route.projectFilter) list = list.filter((t) => t.projectId === route.projectFilter);
  const f = route.filter;
  list = f === 'done' ? list.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0))
    : list.filter((t) => !t.done && (f === 'all' || (f === 'today' ? t.due && t.due <= today : t.due && t.due > today)))
      .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.priority - b.priority);
  const counts = { today: state.tasks.filter((t) => !t.done && t.due && t.due <= today).length, upcoming: state.tasks.filter((t) => !t.done && t.due && t.due > today).length, all: state.tasks.filter((t) => !t.done).length, done: state.tasks.filter((t) => t.done).length };
  return `<header class="page-h"><h1>Tasks</h1><p class="muted">${counts.all} open · ${counts.done} completed</p></header>
  <div class="chips">${[['today', 'Today'], ['upcoming', 'Upcoming'], ['all', 'All'], ['done', 'Done']].map(([k, l]) => `<button class="chip${f === k ? ' on' : ''}" data-a="filter" data-f="${k}">${l} <b>${counts[k]}</b></button>`).join('')}</div>
  ${state.projects.length ? `<div class="chips sm"><button class="chip${!route.projectFilter ? ' on' : ''}" data-a="pfilter" data-id="">All projects</button>${state.projects.map((p) => `<button class="chip${route.projectFilter === p.id ? ' on' : ''}" data-a="pfilter" data-id="${p.id}"><i class="dot" style="background:${p.color}"></i>${esc(p.name)}</button>`).join('')}</div>` : ''}
  <section class="card flush">${list.length ? list.map(taskRow).join('') : empty(f === 'done' ? 'Nothing completed yet' : 'No tasks here', 'Tap + to add one.')}</section>`;
}

function viewHabits() {
  const hs = state.habits.filter((h) => !h.archived); const today = ymd();
  const sc = S.dayScore(today); const todays = S.habitsToday(); const done = todays.filter((h) => h.log[today]).length;
  const avg = hs.length ? Math.round(hs.reduce((a, h) => a + S.habitStats(h).rate, 0) / hs.length) : 0;
  const best = hs.reduce((a, h) => Math.max(a, S.habitStats(h).best), 0);
  return `<header class="page-h"><h1>Habits</h1><p class="muted">${done}/${todays.length} done today</p></header>
  <section class="grid3"><div class="card mini"><small>Today</small><strong>${pct(done, todays.length)}%</strong></div><div class="card mini"><small>30-day avg</small><strong>${avg}%</strong></div><div class="card mini"><small>Best streak</small><strong>${best}d</strong></div></section>
  <section class="card flush">${hs.length ? hs.map((h) => habitRow(h)).join('') : empty('No habits yet', 'Tap + to build your first routine.')}</section>`;
}

function viewMoney() {
  const m = S.monthSummary(); const budget = state.budgets.total; const trend = S.monthlyTrend(6);
  const catSlices = Object.entries(m.cats).sort((a, b) => b[1] - a[1]).map(([k, v], i) => ({ label: k, value: v, color: S.COLORS[i % S.COLORS.length] }));
  const txs = state.transactions.slice(0, 15);
  return `<header class="page-h"><h1>Money</h1><p class="muted">${MONTHS[new Date().getMonth()]} ${new Date().getFullYear()}</p></header>
  <section class="card"><div class="trio"><div><small>Income</small><strong class="pos">${money(m.income, cur())}</strong></div><div><small>Spent</small><strong class="neg">${money(m.expense, cur())}</strong></div><div><small>Net</small><strong>${money(m.net, cur())}</strong></div></div>
    ${budget ? `${C.meter(pct(m.expense, budget), m.expense > budget ? 'var(--bad)' : 'var(--coral)')}<small class="muted">${money(Math.max(0, budget - m.expense), cur())} left of ${money(budget, cur())} · <a href="#" data-a="budget">edit</a></small>` : `<button class="btn soft wide" data-a="budget">Set monthly budget</button>`}</section>
  <section class="card"><div class="sec"><h2>Spending by category</h2></div>${catSlices.length ? `<div class="donutrow">${C.donut(catSlices, { center: money(m.expense, cur()) })}<div class="legend col">${catSlices.map((s) => {
    const cb = state.budgets.cats[s.label]; return `<span><i style="background:${s.color}"></i>${esc(s.label)} <b>${money(s.value, cur())}</b>${cb ? `<em class="${s.value > cb ? 'bad' : ''}"> / ${money(cb, cur())}</em>` : ''}</span>`; }).join('')}</div></div>` : empty('No spending this month')}</section>
  <section class="card"><div class="sec"><h2>Last 6 months</h2></div>${C.groupedBars(trend.map((t) => ({ label: t.label, a: t.income, b: t.expense })))}</section>
  <section class="card"><div class="sec"><h2>Savings goals</h2><button class="link" data-a="addsaving">+ Goal</button></div>${state.savings.length ? state.savings.map((g) => {
    const p = pct(g.saved, g.target); return `<div class="saving"><div class="sec"><strong>${esc(g.name)}</strong><button class="x sm" data-a="delsaving" data-id="${g.id}" aria-label="Delete goal">${ic('trash', 16)}</button></div>${C.meter(p, p >= 100 ? 'var(--sage)' : 'var(--lilac)')}<div class="sec"><small>${money(g.saved, cur())} of ${money(g.target, cur())} · ${p}%${g.deadline ? ' · by ' + prettyDate(g.deadline) : ''}</small><button class="link" data-a="contribute" data-id="${g.id}">+ Add</button></div></div>`; }).join('') : empty('No goals yet', 'Save towards something you care about.')}</section>
  <section class="card flush"><div class="sec pad"><h2>Transactions</h2></div>${txs.length ? txs.map((t) => `<div class="row"><div class="txic ${t.type}">${t.type === 'income' ? '↓' : '↑'}</div><div class="row-main"><strong>${esc(t.note || t.cat)}</strong><small>${esc(t.cat)} · ${prettyDate(t.date)}</small></div><b class="${t.type === 'income' ? 'pos' : 'neg'}">${t.type === 'income' ? '+' : '-'}${money(t.amount, cur())}</b><button class="x sm" data-a="deltx" data-id="${t.id}" aria-label="Delete transaction">${ic('trash', 16)}</button></div>`).join('') : empty('No transactions', 'Tap + to log income or an expense.')}</section>`;
}

function viewMore() {
  const unread = state.inbox.filter((i) => !i.read).length;
  const items = [['projects', '◆', 'Projects', `${state.projects.length} active`], ['notes', '✎', 'Notes', `${state.notes.length} notes`], ['calendar', '▦', 'Calendar', `${state.events.length} events`],
    ['achievements', '★', 'Achievements', `${Object.keys(state.achievements).length}/${S.BADGES.length}`], ['inbox', '🔔', 'Notifications', unread ? `${unread} new` : 'All read'], ['settings', '⚙', 'Settings', 'Data & alerts']];
  return `<header class="page-h"><h1>More</h1><p class="muted">Everything else in your workspace</p></header><div class="grid2 tiles">${items.map(([k, i, t, s]) => `<button class="card tile" data-a="sub" data-s="${k}"><span class="tile-i">${i}</span><strong>${t}</strong><small>${s}</small></button>`).join('')}</div>`;
}

const subHead = (t, right = '') => `<header class="page-h sub"><button class="x" data-a="back" aria-label="Back">${ic('back')}</button><h1>${t}</h1><span>${right}</span></header>`;

function viewProjects() {
  return subHead('Projects', `<button class="btn soft sm" data-a="addproject">+ New</button>`) + (state.projects.length ? state.projects.map((p) => {
    const s = S.projectStats(p.id); return `<button class="card proj" data-a="project" data-id="${p.id}"><div class="sec"><strong><i class="dot lg" style="background:${p.color}"></i>${esc(p.name)}</strong><b>${s.pct}%</b></div>${C.meter(s.pct, p.color)}<small class="muted">${s.done}/${s.total} tasks${s.overdue ? ` · <span class="bad">${s.overdue} overdue</span>` : ''}${p.desc ? ' · ' + esc(p.desc) : ''}</small></button>`; }).join('') : `<div class="card">${empty('No projects', 'Group related tasks and watch progress.')}</div>`);
}
function viewNotes() {
  const q = route.noteQ.toLowerCase(); let ns = state.notes.filter((n) => !q || (n.title + ' ' + n.body + ' ' + n.tags.join(' ')).toLowerCase().includes(q));
  ns = ns.sort((a, b) => (b.pinned - a.pinned) || b.updated - a.updated);
  return subHead('Notes', `<button class="btn soft sm" data-a="editnote" data-id="">+ New</button>`) + `<input class="search" id="noteq" type="search" placeholder="Search notes…" value="${esc(route.noteQ)}" aria-label="Search notes">` +
    (ns.length ? ns.map((n) => `<button class="card note" data-a="editnote" data-id="${n.id}"><div class="sec"><strong>${n.pinned ? '📌 ' : ''}${esc(n.title)}</strong><small>${prettyDate(ymd(new Date(n.updated)))}</small></div><p>${esc(n.body.slice(0, 110))}</p>${n.tags.length ? `<div class="tags">${n.tags.map((t) => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}</button>`).join('') : `<div class="card">${empty(q ? 'No matches' : 'No notes yet', 'Capture ideas, plans and journals.')}</div>`);
}
function viewCalendar() {
  const [Y, M] = route.calMonth.split('-').map(Number); const first = new Date(Y, M - 1, 1); const dim = new Date(Y, M, 0).getDate(); const today = ymd();
  const cells = []; for (let i = 0; i < first.getDay(); i++) cells.push('<i class="blank"></i>');
  for (let d = 1; d <= dim; d++) {
    const date = `${route.calMonth}-${String(d).padStart(2, '0')}`; const ev = state.events.some((e) => e.date === date); const tk = state.tasks.some((t) => t.due === date && !t.done);
    const hb = state.habits.some((h) => h.log[date]); const tx = state.transactions.some((t) => t.date === date);
    cells.push(`<button class="day${date === today ? ' today' : ''}${date === route.calSel ? ' sel' : ''}" data-a="calday" data-d="${date}" aria-label="${date}"><b>${d}</b><span class="dots">${ev ? '<i style="background:var(--plum)"></i>' : ''}${tk ? '<i style="background:var(--coral)"></i>' : ''}${hb ? '<i style="background:var(--sage)"></i>' : ''}${tx ? '<i style="background:var(--saffron)"></i>' : ''}</span></button>`);
  }
  const sel = route.calSel; const evs = state.events.filter((e) => e.date === sel).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const tks = state.tasks.filter((t) => t.due === sel); const hbs = state.habits.filter((h) => h.log[sel]); const txs = state.transactions.filter((t) => t.date === sel);
  return subHead('Calendar') + `<section class="card"><div class="calhead"><button class="x" data-a="calnav" data-n="-1" aria-label="Previous month">${ic('back')}</button><strong>${MONTHS[M - 1]} ${Y}</strong><button class="x" data-a="calnav" data-n="1" aria-label="Next month">${ic('chev')}</button></div>
    <div class="cal">${DAY.map((d) => `<em>${d[0]}</em>`).join('')}${cells.join('')}</div><div class="legend"><span><i style="background:var(--plum)"></i>Event</span><span><i style="background:var(--coral)"></i>Task</span><span><i style="background:var(--sage)"></i>Habit</span><span><i style="background:var(--saffron)"></i>Money</span></div></section>
    <section class="card"><div class="sec"><h2>${prettyDate(sel)}</h2><button class="link" data-a="addevent" data-d="${sel}">+ Event</button></div>
    ${evs.map((e) => `<div class="row"><div class="txic ev">▦</div><div class="row-main"><strong>${esc(e.title)}</strong><small>${e.time || 'All day'}${e.remind ? ' · 🔔' : ''}${e.notes ? ' · ' + esc(e.notes) : ''}</small></div><button class="x sm" data-a="delev" data-id="${e.id}" aria-label="Delete event">${ic('trash', 16)}</button></div>`).join('')}
    ${tks.map(taskRow).join('')}${hbs.map((h) => `<div class="row"><div class="txic hb">✓</div><div class="row-main"><strong>${esc(h.name)}</strong><small>Habit completed</small></div></div>`).join('')}
    ${txs.map((t) => `<div class="row"><div class="txic ${t.type}">${t.type === 'income' ? '↓' : '↑'}</div><div class="row-main"><strong>${esc(t.note || t.cat)}</strong><small>${esc(t.cat)}</small></div><b class="${t.type === 'income' ? 'pos' : 'neg'}">${money(t.amount, cur())}</b></div>`).join('')}
    ${!evs.length && !tks.length && !hbs.length && !txs.length ? empty('Nothing on this day') : ''}</section>`;
}
function viewAchievements() {
  const got = Object.keys(state.achievements).length;
  return subHead('Achievements') + `<section class="card ringcard"><div class="ringrow">${C.ring(pct(got, S.BADGES.length), { center: `${got}/${S.BADGES.length}`, sub: 'unlocked' })}<div class="ringtext"><strong>${S.overallStreak()}-day streak</strong><small>${state.tasks.filter((t) => t.done).length} tasks done · ${state.habits.reduce((a, h) => a + Object.keys(h.log).length, 0)} habit check-ins</small></div></div></section>
  <div class="grid2">${S.BADGES.map((b) => { const on = state.achievements[b.id]; return `<div class="card badge${on ? ' on' : ''}"><span class="bi">${b.icon}</span><strong>${b.name}</strong><small>${b.desc}</small>${on ? `<em>${prettyDate(ymd(new Date(on)))}</em>` : ''}</div>`; }).join('')}</div>`;
}
function viewInbox() {
  state.inbox.forEach((i) => (i.read = true)); S.save();
  return subHead('Notifications', state.inbox.length ? `<button class="btn soft sm" data-a="clearinbox">Clear</button>` : '') + (state.inbox.length ? `<section class="card flush">${state.inbox.map((i) => `<div class="row"><div class="txic ev">${ic('bell', 16)}</div><div class="row-main"><strong>${esc(i.title)}</strong><small>${esc(i.body)} · ${new Date(i.ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></div></div>`).join('')}</section>` : `<div class="card">${empty('No notifications', 'Reminders and achievements appear here.')}</div>`);
}
function viewSettings() {
  const s = state.settings;
  return subHead('Settings') + `<form class="card" id="settingsForm" novalidate>${field('Your name', 'name', { v: s.name, max: 40 })}${select('Currency', 'currency', [['₹', '₹ Rupee'], ['$', '$ Dollar'], ['€', '€ Euro'], ['£', '£ Pound']], s.currency)}
    <label class="switch"><input type="checkbox" name="notifications" ${s.notifications ? 'checked' : ''}><span>Reminders &amp; notifications</span></label>
    <label class="switch"><input type="checkbox" name="budgetAlerts" ${s.budgetAlerts ? 'checked' : ''}><span>Budget alerts (80% / 100%)</span></label>
    ${field('Daily summary time (blank = off)', 'dailyBrief', { type: 'time', v: s.dailyBrief })}<p class="form-err" id="serr"></p><button class="btn primary wide" type="submit">Save settings</button></form>
  <section class="card"><div class="sec"><h2>Notifications</h2></div><button class="btn soft wide" data-a="notifperm">Allow notifications</button><button class="btn soft wide" data-a="notiftest">Send test notification</button><button class="btn soft wide" data-a="exactperm">Exact-time reminders (Android 12+)</button></section>
  <section class="card"><div class="sec"><h2>Your data</h2></div><p class="muted">Everything is stored on this device in a single folder: <code>${S.APP_DIR}/</code> (app-private storage — nothing leaves your phone). Removing it, or uninstalling the app, deletes all data.</p>
    <button class="btn soft wide" data-a="export">Export backup (JSON)</button><button class="btn soft wide" data-a="importpick">Import backup (JSON)</button><input type="file" id="importFile" accept="application/json,.json" hidden><button class="btn danger wide" data-a="wipe">Delete all data</button></section><p class="muted center">DayLoop 1.1 · made with care</p>`;
}

const SUBS = { projects: viewProjects, notes: viewNotes, calendar: viewCalendar, achievements: viewAchievements, inbox: viewInbox, settings: viewSettings };
const TABS = { today: viewToday, tasks: viewTasks, habits: viewHabits, money: viewMoney, more: viewMore };
const FAB = { tasks: 'addtask', habits: 'addhabit', money: 'addtx' };

let lastKey = '';
function render() {
  const key = route.sub || route.tab; const view = $('#view'); const scroll = view.scrollTop;
  view.innerHTML = (route.sub ? SUBS[route.sub] : TABS[route.tab])();
  if (key !== lastKey) { view.scrollTop = 0; view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); } else view.scrollTop = scroll;
  lastKey = key;
  document.querySelectorAll('.tabbar button').forEach((b) => { const on = b.dataset.t === route.tab && !route.sub; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  const fab = $('#fab'); const fa = !route.sub && FAB[route.tab]; fab.hidden = !fa; if (fa) fab.dataset.a = fa;
  const badge = state.inbox.some((i) => !i.read); $('.tabbar [data-t=more]').classList.toggle('badge', badge);
  C.animateRings(view); drainBadges();
}

// ================= FORMS =================
const projOpts = () => [['', 'No project'], ...state.projects.map((p) => [p.id, p.name])];
function taskForm(preset = {}) {
  openSheet('New task', `${field('Title', 'title', { af: true, max: 120, ph: 'What needs doing?' })}${field('Notes', 'notes', { area: true, rows: 2, max: 500 })}
    <div class="two">${field('Due date', 'due', { type: 'date', v: preset.due ?? ymd() })}${field('Reminder time', 'time', { type: 'time' })}</div>
    ${select('Repeat', 'repeat', [['', 'Does not repeat'], ['daily', 'Every day'], ['weekly', 'Every week'], ['monthly', 'Every month']], '')}${select('Project', 'projectId', projOpts(), preset.projectId || '')}<div class="fld"><span>Priority</span>${seg('priority', [['1', 'P1'], ['2', 'P2'], ['3', 'P3'], ['4', 'None']], '4')}</div>`,
  { submitLabel: 'Add task', onSubmit: (f) => { const e = S.addTask(Object.fromEntries(f)); if (!e) { N.reschedule(); toast('Task added'); } return e; } });
}
function habitForm() {
  openSheet('New habit', `${field('Name', 'name', { af: true, max: 40, ph: 'e.g. Read 20 pages' })}<div class="two">${field('Icon', 'icon', { v: '✦', max: 2 })}${field('Reminder', 'reminder', { type: 'time' })}</div>
    <div class="fld"><span>Repeat on</span><div class="daychips">${DAY.map((d, i) => `<label><input type="checkbox" name="d" value="${i}" checked><span>${d[0]}</span></label>`).join('')}</div></div>
    <div class="fld"><span>Colour</span><div class="swatches">${S.COLORS.map((c, i) => `<label><input type="radio" name="color" value="${c}" ${i === 0 ? 'checked' : ''}><i style="background:${c}"></i></label>`).join('')}</div></div>`,
  { submitLabel: 'Create habit', onSubmit: (f) => { const days = f.getAll('d'); if (!days.length) return 'Choose at least one day'; const e = S.addHabit({ name: f.get('name'), icon: f.get('icon') || '✦', color: f.get('color'), days, reminder: f.get('reminder') }); if (!e) { N.reschedule(); toast('Habit created'); } return e; } });
}
function txForm() {
  const draw = (type) => `${field('Amount', 'amount', { type: 'number', step: '0.01', min: 0, inputmode: 'decimal', af: true, ph: '0.00' })}${select('Category', 'cat', (type === 'income' ? S.INCOME_CATS : S.EXPENSE_CATS).map((c) => [c, c]))}${field('Note', 'note', { max: 80 })}${field('Date', 'date', { type: 'date', v: ymd() })}`;
  openSheet('Add transaction', `<div class="fld">${seg('type', [['expense', 'Expense'], ['income', 'Income']], 'expense')}</div><div id="txbody">${draw('expense')}</div>`, { submitLabel: 'Save',
    onSubmit: (f) => { const e = S.addTransaction(Object.fromEntries(f)); if (!e) { N.checkBudget(); toast('Saved'); } return e; } });
  $('#sheet').querySelectorAll('[name=type]').forEach((r) => r.addEventListener('change', () => { const keep = { date: $('#sheet [name=date]').value }; $('#txbody').innerHTML = draw(r.value); $('#sheet [name=date]').value = keep.date; }));
}
function budgetForm() {
  openSheet('Monthly budget', `${field('Total monthly budget', 'total', { type: 'number', min: 0, step: '1', v: state.budgets.total || '', af: true })}<p class="muted">Optional category limits:</p>${S.EXPENSE_CATS.map((c) => field(c, 'c_' + c, { type: 'number', min: 0, v: state.budgets.cats[c] || '' })).join('')}`,
    { onSubmit: (f) => { const cats = {}; S.EXPENSE_CATS.forEach((c) => (cats[c] = f.get('c_' + c))); const e = S.setBudget(f.get('total') || 0, cats); if (!e) N.checkBudget(); return e; } });
}
function savingForm() { openSheet('New savings goal', `${field('Goal', 'name', { af: true, max: 40 })}${field('Target amount', 'target', { type: 'number', min: 0, step: '1' })}${field('Already saved', 'saved', { type: 'number', min: 0, step: '1' })}${field('Target date', 'deadline', { type: 'date' })}`, { onSubmit: (f) => S.addSaving(Object.fromEntries(f)) }); }
function projectForm() { openSheet('New project', `${field('Name', 'name', { af: true, max: 40 })}${field('Description', 'desc', { max: 200 })}<div class="fld"><span>Colour</span><div class="swatches">${S.COLORS.map((c, i) => `<label><input type="radio" name="color" value="${c}" ${i === 0 ? 'checked' : ''}><i style="background:${c}"></i></label>`).join('')}</div></div>`, { onSubmit: (f) => S.addProject(Object.fromEntries(f)) }); }
function eventForm(date) { openSheet('New event', `${field('Title', 'title', { af: true, max: 80 })}<div class="two">${field('Date', 'date', { type: 'date', v: date })}${field('Time', 'time', { type: 'time' })}</div>${field('Notes', 'notes', { max: 300 })}<label class="switch"><input type="checkbox" name="remind"><span>Remind me (needs a time)</span></label>`, { onSubmit: (f) => { const e = S.addEvent({ ...Object.fromEntries(f), remind: f.get('remind') === 'on' }); if (!e) N.reschedule(); return e; } }); }
function noteForm(id) {
  const n = state.notes.find((x) => x.id === id) || { title: '', body: '', tags: [] };
  openSheet(id ? 'Edit note' : 'New note', `${field('Title', 'title', { v: n.title, max: 80, af: !id })}${field('Write something…', 'body', { area: true, rows: 10, max: 20000, v: n.body })}${field('Tags (comma separated)', 'tags', { v: n.tags.join(', ') })}
    ${id ? `<div class="two"><button type="button" class="btn soft" data-a="pinnote" data-id="${id}">${n.pinned ? 'Unpin' : 'Pin'}</button><button type="button" class="btn danger" data-a="delnote" data-id="${id}">Delete</button></div>` : ''}`,
  { full: true, onSubmit: (f) => S.saveNote({ id, ...Object.fromEntries(f) }) });
}
function taskDetail(id) {
  const t = state.tasks.find((x) => x.id === id); if (!t) return;
  const p = state.projects.find((x) => x.id === t.projectId);
  openSheet(t.title, `<p class="muted">${p ? esc(p.name) + ' · ' : ''}${t.due ? prettyDate(t.due) + (t.time ? ' ' + t.time : '') : 'No date'} · ${PRI[t.priority][0] || 'No priority'}</p>${t.notes ? `<p>${esc(t.notes)}</p>` : ''}
    <div class="sec"><h3>Subtasks</h3></div>${t.subtasks.map((s) => `<label class="sub"><input type="checkbox" data-a="ts" data-id="${t.id}" data-sid="${s.id}" ${s.done ? 'checked' : ''}><span class="${s.done ? 'strike' : ''}">${esc(s.title)}</span></label>`).join('') || '<p class="muted">None yet</p>'}
    <div class="inline"><input id="subin" maxlength="80" placeholder="Add a subtask" aria-label="Subtask title"><button type="button" class="btn soft sm" data-a="addsub" data-id="${t.id}">Add</button></div>
    <button type="button" class="btn danger wide" data-a="deltask" data-id="${t.id}">Delete task</button>`, { hideSubmit: true });
}
function habitDetail(id) {
  const h = state.habits.find((x) => x.id === id); if (!h) return; const st = S.habitStats(h); const today = ymd();
  const start = addDays(today, -(12 * 7 - 1) - parseYmd(today).getDay() + 6); // end on Saturday of this week
  const cells = []; for (let i = 0; i < 84; i++) { const d = addDays(addDays(today, 6 - parseYmd(today).getDay()), -83 + i); if (d <= today) cells.push({ date: d, on: !!h.log[d], scheduled: S.habitScheduled(h, d) }); else cells.push({ date: d, on: false, scheduled: false }); }
  const month = []; for (let i = 5; i >= 0; i--) { const d = new Date(); d.setMonth(d.getMonth() - i, 1); const mk = ymd(d).slice(0, 7); month.push({ label: MONTHS[d.getMonth()].slice(0, 3), value: Object.keys(h.log).filter((k) => k.startsWith(mk)).length }); }
  openSheet(`${h.icon} ${h.name}`, `<div class="trio"><div><small>Current</small><strong>${st.current}d</strong></div><div><small>Best</small><strong>${st.best}d</strong></div><div><small>30-day rate</small><strong>${st.rate}%</strong></div></div>
    <div class="sec"><h3>Last 12 weeks</h3></div>${C.heatmap(cells, h.color)}<div class="sec"><h3>Check-ins per month</h3></div>${C.area(month, { color: h.color })}
    <p class="muted">Repeats: ${h.days.map((d) => DAY[d]).join(', ')}${h.reminder ? ' · ⏰ ' + h.reminder : ''} · ${st.total} total check-ins</p>
    <button type="button" class="btn danger wide" data-a="delhabit" data-id="${h.id}">Delete habit</button>`, { hideSubmit: true });
}
function projectDetail(id) {
  const p = state.projects.find((x) => x.id === id); if (!p) return; const s = S.projectStats(id); const ts = state.tasks.filter((t) => t.projectId === id);
  openSheet(p.name, `${C.meter(s.pct, p.color)}<p class="muted">${s.done}/${s.total} done · ${s.open} open${s.overdue ? ` · ${s.overdue} overdue` : ''}</p>${ts.length ? ts.map(taskRow).join('') : '<p class="muted">No tasks yet.</p>'}
    <button type="button" class="btn soft wide" data-a="addtaskproj" data-id="${id}">+ Add task to project</button><button type="button" class="btn danger wide" data-a="delproject" data-id="${id}">Delete project</button>`, { hideSubmit: true });
}
function confirmSheet(title, msg, label, fn) {
  openSheet(title, `<p>${esc(msg)}</p>`, { submitLabel: label, onSubmit: () => { fn(); return ''; } });
  $('#sheet .btn.primary').classList.add('danger');
}

// ================= EVENTS =================
const act = {
  tab: (d) => { route.tab = d.t; route.sub = null; history.replaceState(null, ''); render(); },
  sub: (d) => { route.sub = d.s; history.pushState({ sub: d.s }, ''); render(); },
  back: () => history.back(),
  close: closeSheet,
  filter: (d) => { route.filter = d.f; render(); }, pfilter: (d) => { route.projectFilter = d.id; render(); },
  tt: (d, el) => { const t = state.tasks.find((x) => x.id === d.id); if (t && !t.done) el.classList.add('pop'); setTimeout(() => { S.toggleTask(d.id); N.reschedule(); }, t && !t.done ? 220 : 0); },
  th: (d, el) => { const e = S.toggleHabit(d.id); if (e) toast(e, 'err'); else { el.classList.add('pop'); } },
  task: (d) => taskDetail(d.id), habit: (d) => habitDetail(d.id), project: (d) => projectDetail(d.id),
  addtask: () => taskForm(), addhabit: habitForm, addtx: txForm, budget: budgetForm, addsaving: savingForm, addproject: projectForm,
  addtaskproj: (d) => { closeSheetThen(() => taskForm({ projectId: d.id })); },
  addevent: (d) => eventForm(d.d), editnote: (d) => noteForm(d.id),
  pinnote: (d) => { S.toggleNotePin(d.id); closeSheet(); }, delnote: (d) => { S.deleteNote(d.id); closeSheet(); toast('Note deleted'); },
  ts: (d) => { S.toggleSubtask(d.id, d.sid); taskDetail(d.id); },
  addsub: (d) => { const i = $('#subin'); const e = S.addSubtask(d.id, i.value); if (e) $('#ferr').textContent = e; else taskDetail(d.id); },
  deltask: (d) => { S.deleteTask(d.id); N.reschedule(); closeSheet(); toast('Task deleted'); },
  delhabit: (d) => confirmSheet('Delete habit?', 'All its history will be removed.', 'Delete', () => { S.deleteHabit(d.id); N.reschedule(); }),
  delproject: (d) => confirmSheet('Delete project?', 'Its tasks stay, but become unassigned.', 'Delete', () => S.deleteProject(d.id)),
  deltx: (d) => { S.deleteTransaction(d.id); toast('Transaction deleted'); }, delsaving: (d) => { S.deleteSaving(d.id); },
  contribute: (d) => openSheet('Add to goal', field('Amount', 'amt', { type: 'number', min: 0, step: '0.01', af: true }), { onSubmit: (f) => { const e = S.contribute(d.id, f.get('amt')); if (!e) toast('Nice — saved!'); return e; } }),
  delev: (d) => { S.deleteEvent(d.id); N.reschedule(); },
  calday: (d) => { route.calSel = d.d; render(); },
  calnav: (d) => { const [y, m] = route.calMonth.split('-').map(Number); const n = new Date(y, m - 1 + Number(d.n), 1); route.calMonth = ymd(n).slice(0, 7); route.calSel = ymd(n); render(); },
  clearinbox: () => { state.inbox = []; S.commit(); },
  notifperm: async () => toast((await N.permission(true)) ? 'Notifications allowed' : 'Permission not granted', ''),
  notiftest: async () => { if (!(await N.permission(true))) return toast('Allow notifications first', 'err'); N.alertNow('DayLoop test', 'Notifications are working.'); toast('Test sent'); },
  export: async () => { const json = JSON.stringify(state, null, 2); const name = `dayloop-backup-${ymd()}.json`; try { const where = await S.writeExport(name, json); toast('Saved: ' + where); } catch { toast('Could not write backup', 'err'); } },
  exactperm: async () => { const r = await N.exactAlarm(true); toast(r === 'granted' ? 'Reminders will fire on time' : 'Not allowed: reminders may be a few minutes late', r === 'granted' ? '' : 'err'); },
  importpick: () => $('#importFile').click(),
  wipe: () => confirmSheet('Delete ALL data?', `This permanently erases every task, habit, note and transaction stored in the ${S.APP_DIR} folder on this device.`, 'Delete everything', async () => { await S.wipeStorage(); S.replaceState({}); await N.reschedule(); route.tab = 'today'; route.sub = null; toast('All data deleted'); setTimeout(onboard, 400); }),
};
function closeSheetThen(fn) { const un = () => { window.removeEventListener('popstate', un); setTimeout(fn, 30); }; window.addEventListener('popstate', un); closeSheet(); }

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]'); if (!el) return; if (el.tagName === 'A') e.preventDefault();
  const fn = act[el.dataset.a]; if (fn) fn(el.dataset, el);
});
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'settingsForm') return; e.preventDefault(); const f = new FormData(e.target); const name = String(f.get('name') || '').trim();
  const bt = f.get('dailyBrief') || '';
  if (name.length > 40) return void ($('#serr').textContent = 'Name is too long');
  Object.assign(state.settings, { name, currency: f.get('currency'), notifications: f.get('notifications') === 'on', budgetAlerts: f.get('budgetAlerts') === 'on', dailyBrief: bt });
  S.commit(); N.reschedule(); toast('Settings saved'); if (state.settings.notifications) N.permission(true);
});
document.addEventListener('change', async (e) => {
  if (e.target.id !== 'importFile') return; const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
  if (file.size > S.MAX_IMPORT_BYTES) return toast('File is too large (5 MB max)', 'err');
  const r = S.validateBackup(await file.text()); if (r.error) return toast(r.error, 'err');
  const c = r.counts;
  confirmSheet('Replace data with this backup?', `It contains ${c.tasks} tasks, ${c.habits} habits, ${c.transactions} transactions, ${c.notes} notes and ${c.events} events. Your current data will be replaced (a safety copy is kept in ${S.APP_DIR}/exports).`, 'Import backup',
    async () => { await S.applyImport(r.data); await N.reschedule(); toast('Backup imported'); });
});
document.addEventListener('input', (e) => { if (e.target.id === 'noteq') { route.noteQ = e.target.value; const pos = e.target.selectionStart; render(); const n = $('#noteq'); n.focus(); n.setSelectionRange(pos, pos); } });
window.addEventListener('popstate', (e) => {
  if (sheetOpen) { hideSheetDom(); return; }
  route.sub = e.state?.sub || null; render();
});

function onboard() {
  openSheet('Welcome to DayLoop', `<p class="muted">Tasks, habits, money, notes and a calendar — all stored privately on this phone.</p>${field('What should we call you?', 'name', { af: true, max: 40 })}`, { submitLabel: 'Get started',
    onSubmit: (f) => { state.settings.name = String(f.get('name') || '').trim(); state.settings.onboarded = true; S.commit(); N.permission(true).then(N.reschedule); return ''; } });
}

// ================= BOOT =================
export async function boot() {
  await S.load();
  $('#tabbar').addEventListener('click', (e) => { const b = e.target.closest('button[data-t]'); if (b) act.tab(b.dataset); });
  S.subscribe(() => { render(); });
  history.replaceState(null, '');
  render();
  if (!state.settings.onboarded) onboard();
  N.reschedule(); N.checkBudget();
  const seen = new Set();
  setInterval(() => N.dueNow().forEach((n) => { if (!seen.has(n.k)) { seen.add(n.k); toast(`${n.title}: ${n.body}`, 'gold'); S.pushInbox(n.title, n.body); } }), 20000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) S.flush(); else render(); });
  window.addEventListener('pagehide', S.flush);
  setTimeout(() => $('#splash')?.remove(), 350);
}
