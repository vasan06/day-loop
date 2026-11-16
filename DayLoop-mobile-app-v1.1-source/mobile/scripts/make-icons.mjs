// Renders resources/icon.png + splash.png (used by @capacitor/assets to create every Android density).
import { createRequire } from 'node:module'; const { chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright');
const mark = (s) => `<div style="width:${s}px;height:${s}px;border-radius:${s * .26}px;background:#69465f;display:flex;align-items:flex-end;justify-content:center;gap:${s * .09}px;padding:${s * .24}px ${s * .2}px;transform:rotate(-7deg);box-sizing:border-box">
 <i style="width:${s * .13}px;height:${s * .26}px;border-radius:99px;background:#f8d8b7"></i><i style="width:${s * .13}px;height:${s * .5}px;border-radius:99px;background:#f8d8b7"></i><i style="width:${s * .13}px;height:${s * .36}px;border-radius:99px;background:#df785f"></i></div>`;
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1024, height: 1024 } });
await pg.setContent(`<body style="margin:0;background:#f4eee5;display:grid;place-items:center;height:100vh">${mark(640)}</body>`); await pg.screenshot({ path: 'resources/icon.png' });
await pg.setViewportSize({ width: 2732, height: 2732 }); await pg.setContent(`<body style="margin:0;background:#f4eee5;display:grid;place-items:center;height:100vh">${mark(600)}</body>`); await pg.screenshot({ path: 'resources/splash.png' });
await b.close();
