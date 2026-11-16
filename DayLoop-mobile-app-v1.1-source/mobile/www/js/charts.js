// Lightweight SVG charts (no libraries). All return HTML strings.
import { esc, clamp } from './util.js';

export function ring(pctVal, { size = 92, stroke = 9, color = 'var(--coral)', center = '', sub = '' } = {}) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r; const off = c * (1 - clamp(pctVal, 0, 100) / 100);
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${stroke}"/>
    <circle class="ring-arc" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c}" data-to="${off}"/></svg>
    <div class="ring-center"><strong>${esc(center)}</strong><span>${esc(sub)}</span></div></div>`;
}

export function bars(data, { height = 120, color = '#d9c9d9', hi = 'var(--coral)' } = {}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return `<div class="bars" style="height:${height}px">${data.map((d) => `
    <div class="bar-col"><span class="bar-val">${d.value ? esc(d.text ?? d.value) : ''}</span>
    <div class="bar-track"><div class="bar-fill" style="height:${Math.max(d.value ? 6 : 0, (d.value / max) * 100)}%;background:${d.highlight ? hi : (d.color || color)}"></div></div>
    <span class="bar-label${d.highlight ? ' hi' : ''}">${esc(d.label)}</span></div>`).join('')}</div>`;
}

export function groupedBars(data, { height = 140 } = {}) {
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  return `<div class="bars grouped" style="height:${height}px">${data.map((d) => `
    <div class="bar-col"><div class="bar-track pair">
      <div class="bar-fill" style="height:${(d.a / max) * 100}%;background:var(--sage)" title="Income"></div>
      <div class="bar-fill" style="height:${(d.b / max) * 100}%;background:var(--coral)" title="Expense"></div></div>
      <span class="bar-label">${esc(d.label)}</span></div>`).join('')}</div>
    <div class="legend"><span><i style="background:var(--sage)"></i>Income</span><span><i style="background:var(--coral)"></i>Expense</span></div>`;
}

export function donut(slices, { size = 140, center = '' } = {}) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  const r = 52; const c = 2 * Math.PI * r; let acc = 0;
  const arcs = total ? slices.map((s) => {
    const len = (s.value / total) * c; const el = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${s.color}" stroke-width="18"
      stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-acc}" transform="rotate(-90 70 70)"/>`; acc += len; return el;
  }).join('') : `<circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--track)" stroke-width="18"/>`;
  return `<div class="donut" style="width:${size}px;height:${size}px"><svg viewBox="0 0 140 140">${arcs}</svg><div class="ring-center"><strong>${esc(center)}</strong></div></div>`;
}

// 12-week habit heatmap. cells: [{date, on, scheduled}] oldest->newest, length multiple of 7 (Sun..Sat columns)
export function heatmap(cells, color = 'var(--coral)') {
  return `<div class="heat">${cells.map((c) => `<i class="${c.scheduled ? '' : 'off'}${c.on ? ' on' : ''}" style="${c.on ? `background:${color}` : ''}" title="${esc(c.date)}"></i>`).join('')}</div>`;
}

export function area(points, { height = 110, color = 'var(--plum)' } = {}) {
  if (points.length < 2) return '<div class="empty">Not enough data yet</div>';
  const w = 300; const h = height; const max = Math.max(1, ...points.map((p) => p.value));
  const x = (i) => (i / (points.length - 1)) * (w - 16) + 8; const y = (v) => h - 18 - (v / max) * (h - 34);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  return `<svg class="area" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${line} L${x(points.length - 1)},${h - 18} L${x(0)},${h - 18}Z" fill="${color}" opacity=".12"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    ${points.map((p, i) => `<text x="${x(i)}" y="${h - 3}" text-anchor="middle" font-size="9" fill="var(--muted)">${esc(p.label)}</text>`).join('')}</svg>`;
}

export function meter(pctVal, color = 'var(--coral)') {
  return `<div class="meter"><i style="width:${clamp(pctVal, 0, 100)}%;background:${color}"></i></div>`;
}

// animate ring arcs after render
export function animateRings(root = document) {
  requestAnimationFrame(() => requestAnimationFrame(() => root.querySelectorAll('.ring-arc').forEach((a) => { a.style.strokeDashoffset = a.dataset.to; })));
}
