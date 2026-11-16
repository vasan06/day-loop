import { boot } from './app.js';
boot().catch((e) => { console.error(e); document.getElementById('view').textContent = 'Something went wrong starting DayLoop.'; });
