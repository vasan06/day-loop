// Drives the real UI in headless Chromium at phone size. Usage: node tests/e2e.mjs [outDir]
import { createRequire } from 'node:module'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const require = createRequire('/opt/node22/lib/node_modules/'); const { chromium } = require('playwright');
const root = path.resolve('www'); const out = process.argv[2] || '/tmp/shots'; fs.mkdirSync(out, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const srv = http.createServer((q, r) => { const f = path.join(root, q.url === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'text/plain' }); r.end(d); } }); }).listen(0);
const url = `http://127.0.0.1:${srv.address().port}/`;
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
let pass = 0; const ok = (c, m) => { if (!c) { console.log('✗ FAIL', m); process.exitCode = 1; } else { pass++; console.log('✓', m); } };
const shot = async (n) => { await page.waitForTimeout(1200); await page.screenshot({ path: `${out}/${n}.png` }); };
const tap = (s) => page.click(s); const fill = (s, v) => page.fill(s, v);
const sheetErr = async () => (await page.textContent('#ferr')).trim();
const today = new Date(); const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

await page.goto(url); await page.waitForTimeout(700);
ok(await page.isVisible('#sheet.open'), 'onboarding sheet appears on first run');
await fill('[name=name]', 'Keerthi'); await tap('.sheet-card button[type=submit]'); await page.waitForTimeout(450);
ok((await page.textContent('.hero h1')).includes('Keerthi'), 'greeting uses name');

// tasks
await tap('.tabbar [data-t=tasks]'); await tap('#fab'); await page.waitForTimeout(350);
await tap('.sheet-card button[type=submit]'); ok(/required/.test(await sheetErr()), 'empty task title rejected');
await fill('[name=title]', 'Finish report <b>x</b>'); await page.evaluate(() => (document.querySelector('[name=time]').value = '09:00')); await page.check('[name=priority][value="1"]', { force: true });
await tap('.sheet-card button[type=submit]'); await page.waitForTimeout(450);
ok((await page.textContent('#view')).includes('Finish report <b>x</b>') && !(await page.$('#view b:text("x")')), 'task added and HTML escaped (no injection)');
await tap('.chk >> nth=0'); await page.waitForTimeout(500);
ok((await page.textContent('.chips .chip.on')).includes('0'), 'completing task moves it out of Today');
await tap('.chip:has-text("Done")'); ok(await page.isVisible('.row.task.done'), 'task appears in Done');
await tap('.row-main'); await page.waitForTimeout(350); await fill('#subin', 'sub one'); await tap('[data-a=addsub]'); await page.waitForTimeout(200);
ok(await page.isVisible('.sub'), 'subtask added'); await tap('[data-a=close] >> nth=1'); await page.waitForTimeout(350);

// habits
await tap('.tabbar [data-t=habits]'); await tap('#fab'); await page.waitForTimeout(350);
await fill('[name=name]', 'Read 20 pages'); await tap('.sheet-card button[type=submit]'); await page.waitForTimeout(400);
ok(await page.isVisible('.row.habit'), 'habit created');
await tap('.row.habit .chk'); await page.waitForTimeout(300); ok(await page.isVisible('.row.habit.done'), 'habit checked in'); ok((await page.textContent('.row.habit small')).includes('1 day streak'), 'streak = 1');
await tap('.row.habit .row-main'); await page.waitForTimeout(400); ok(await page.isVisible('.heat'), 'habit detail shows heatmap'); await shot('habit-detail'); await tap('[data-a=close] >> nth=1'); await page.waitForTimeout(350);
await fill('', '').catch(() => {});

// money
await tap('.tabbar [data-t=money]'); await tap('#fab'); await page.waitForTimeout(350);
await fill('[name=amount]', '-4'); await tap('.sheet-card button[type=submit]'); ok(/greater than 0/.test(await sheetErr()), 'negative amount rejected');
await fill('[name=amount]', '300'); await page.selectOption('[name=cat]', 'Food'); await fill('[name=note]', 'Lunch'); await tap('.sheet-card button[type=submit]'); await page.waitForTimeout(400);
await tap('#fab'); await page.waitForTimeout(350); await page.check('[name=type][value=income]', { force: true }); await fill('[name=amount]', '5000'); await tap('.sheet-card button[type=submit]'); await page.waitForTimeout(400);
ok((await page.textContent('.trio')).includes('₹5,000'), 'income summary'); ok(await page.isVisible('.donut'), 'category donut rendered');
await tap('[data-a=budget]'); await page.waitForTimeout(350); await fill('[name=total]', '350'); await tap('.sheet-card button[type=submit]'); await page.waitForTimeout(400);
ok((await page.textContent('#view')).includes('left of'), 'budget meter shown');
await tap('#fab'); await page.waitForTimeout(350); await fill('[name=amount]', '100'); await tap('.sheet-card button[type=submit]'); await page.waitForTimeout(500);
await tap('.tabbar [data-t=more]'); await tap('[data-s=inbox]'); await page.waitForTimeout(300);
ok((await page.textContent('#view')).includes('Budget exceeded'), 'budget alert lands in notification inbox'); await page.goBack(); await page.waitForTimeout(200);
await tap('.tabbar [data-t=money]'); await shot('money');
await tap('[data-a=addsaving]'); await page.waitForTimeout(350); await fill('[name=name]', 'New phone'); await fill('[name=target]', '1000'); await tap('.sheet-card button[type=submit]'); await page.waitForTimeout(400);
ok(await page.isVisible('.saving'), 'savings goal created');

// notes, calendar, projects, achievements
await tap('.tabbar [data-t=more]'); await tap('[data-s=notes]'); await tap('[data-a=editnote]:has-text("New")'); await page.waitForTimeout(350);
await fill('[name=title]', 'Ideas'); await fill('[name=body]', 'ship the apk'); await fill('[name=tags]', 'work'); await tap('.sheet-card button[type=submit]'); await page.waitForTimeout(400);
await fill('#noteq', 'apk'); ok(await page.isVisible('.note'), 'note saved + searchable'); await fill('#noteq', 'zzz'); ok(!(await page.$('.note')), 'search filters notes'); await page.goBack(); await page.waitForTimeout(200);
await tap('[data-s=calendar]'); await page.waitForTimeout(300); await tap('[data-a=addevent]'); await page.waitForTimeout(350); await fill('[name=title]', 'Demo day'); await page.evaluate(() => (document.querySelector('[name=time]').value = '15:00'));
await page.check('[name=remind]', { force: true }); await tap('.sheet-card button[type=submit]'); await page.waitForTimeout(400); ok(await page.isVisible('.row .txic.ev'), 'calendar event on selected day'); ok((await page.$$('.day .dots i')).length >= 3, 'calendar shows activity dots'); await shot('calendar'); await page.goBack(); await page.waitForTimeout(200);
await tap('[data-s=projects]'); await tap('[data-a=addproject]'); await page.waitForTimeout(350); await fill('[name=name]', 'Launch'); await tap('.sheet-card button[type=submit]'); await page.waitForTimeout(400); ok(await page.isVisible('.proj'), 'project created');
await tap('.proj'); await page.waitForTimeout(350); await tap('[data-a=addtaskproj]'); await page.waitForTimeout(500); ok(await page.isVisible('.sheet-card [name=projectId]'), 'task form opens from project'); await page.goBack(); await page.waitForTimeout(300); await page.goBack(); await page.waitForTimeout(200);
await tap('[data-s=achievements]'); await page.waitForTimeout(300); ok(await page.isVisible('.badge.on'), 'achievement unlocked'); await shot('achievements'); await page.goBack(); await page.waitForTimeout(200);

// Android back button closes sheet before leaving screen
await tap('.tabbar [data-t=tasks]'); await tap('#fab'); await page.waitForTimeout(350); await page.goBack(); await page.waitForTimeout(350); ok(!(await page.isVisible('#sheet.open')), 'back button closes sheet');

// persistence: reload keeps everything, stored under DayLoop/ only
await page.waitForTimeout(500); await page.reload(); await page.waitForTimeout(700);
const keys = await page.evaluate(() => Object.keys(localStorage)); ok(keys.length && keys.every((k) => k.startsWith('DayLoop/')), `all data in one dir: ${keys.join(', ')}`);
ok(!(await page.isVisible('#sheet.open')), 'no onboarding after reload'); await shot('today');
await tap('.tabbar [data-t=habits]'); ok(await page.isVisible('.row.habit.done'), 'habit persisted after reload');

// delete all
await tap('.tabbar [data-t=more]'); await tap('[data-s=settings]'); await page.waitForTimeout(300); await tap('[data-a=wipe]'); await page.waitForTimeout(350); await tap('.sheet-card button[type=submit]'); await page.waitForTimeout(800);
ok((await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('DayLoop/')).length)) <= 1, 'delete-all wipes DayLoop dir');
ok(errs.length === 0, 'no console/page errors ' + errs.join(' | '));
console.log(`\n${pass} checks passed`); await b.close(); srv.close();
