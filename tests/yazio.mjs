// Yazio-tuonnin selaintesti (Apple Health -silta korvataan mockilla). Ei vaadi palvelinta: node tests/yazio.mjs
import { createRequire } from 'module';
import fs from 'fs'; import path from 'path';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let fails = 0; const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fails++; };
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const today = new Date(); const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const T = iso(today), Y = iso(new Date(Date.now() - 864e5));
await ctx.addInitScript(([T, Y]) => {
  localStorage.setItem('gymtrack.v1', JSON.stringify({ schema: 1, createdAt: '2026-10-01T08:00:00.000Z', settings: { restSeconds: 90, authSkipped: true }, workouts: [], sessions: [], measurements: [], activeSessionId: null, rest: null,
    food: { entries: [{ id: 'own1', date: T, meal: 'm1', name: 'Rahka', amount: 200, unit: 'g', kcal: 120, p: 20, c: 6, f: 0.4 }], favorites: [], goals: { kcal: 2400, protein: 160, carbs: 250, fat: 80 } } }));
  window.__healthEntries = [
    { key: 'com.yazio.app|1|HKFoodTypeBreakfast', date: T, time: '08:10', foodType: 'Breakfast', source: 'YAZIO', bundle: 'com.yazio.app', kcal: 512.4, p: 31.26, c: 55.1, f: 14.9 },
    { key: 'com.yazio.app|2|Lunch', date: T, time: '12:30', foodType: 'Lunch', source: 'YAZIO', bundle: 'com.yazio.app', kcal: 700, p: 45, c: 70, f: 20 },
    { key: 'com.yazio.app|3|', date: Y, time: '20:00', foodType: '', source: 'YAZIO', bundle: 'com.yazio.app', kcal: 600, p: 40, c: 50, f: 22 },
    { key: 'com.other|4|', date: T, time: '10:00', foodType: '', source: 'Other', bundle: 'com.other', kcal: 300, p: 1, c: 1, f: 1 }
  ];
  window.__calls = [];
  window.GT_NATIVE = { platform: 'ios', version: 'test', widgets: true };
  const reply = (id, v) => setTimeout(() => window.GT.native._reply(id, v), 5);
  window.webkit = { messageHandlers: { gymtrack: { postMessage(m) {
    window.__calls.push(m.type);
    if (m.type === 'healthAuthorize') reply(m.id, { ok: true, available: true });
    else if (m.type === 'healthNutrition') reply(m.id, { ok: true, from: m.days === 14 ? '2000-01-01' : '2000-01-01', to: '2099-12-31', entries: window.__healthEntries, sources: [{ bundle: 'com.yazio.app', name: 'YAZIO', count: 3 }, { bundle: 'com.other', name: 'Other', count: 1 }] });
    else if (m.type === 'ready' || m.type === 'drain') reply(m.id, { actions: [] });
    else if (m.type === 'notifStatus') reply(m.id, { permission: 'default' });
    else reply(m.id, { ok: true });
  } } } };
}, [T, Y]);
await ctx.route('http://app.test/**', route => {
  let p = new URL(route.request().url()).pathname; if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
  const type = p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : p.endsWith('.html') ? 'text/html' : p.endsWith('.png') ? 'image/png' : 'application/octet-stream';
  route.fulfill({ body: fs.readFileSync(f), contentType: type });
});
await ctx.route(/^https?:\/\/(?!app\.test)/, r => r.abort());
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message + ' ' + e.stack));
await page.goto('http://app.test/');
await page.waitForTimeout(2500);
const st = () => page.evaluate(() => GT.Store.get());
const go = async h => { await page.evaluate(h => { location.hash = h; }, h); await page.waitForTimeout(300); };
await go('#/food-yazio');
ok(await page.isVisible('[data-action="yazio-enable"]'), 'Yazio-näkymässä käyttöönotto-painike');

await page.click('[data-action="yazio-enable"]');
await page.waitForTimeout(800);
let s = await st();
const yz = s.food.entries.filter(e => e.src === 'yazio');
ok(s.food.yazio.on === true, 'tuonti päällä');
ok(yz.length === 3, `3 Yazio-ateriaa tuotu (oli ${yz.length}), muu lähde ohitettu`);
const bf = yz.find(e => e.name === 'Yazio · Aamiainen');
ok(bf && bf.meal === 'm1' && bf.kcal === 512 && bf.p === 31.3, 'aamiainen → 1. ateria, pyöristys');
ok(yz.find(e => e.name === 'Yazio · Lounas').meal === 'm2', 'lounas → 2. ateria');
ok(yz.find(e => e.date === Y).meal === 'm3', 'klo 20 ilman tyyppiä → 3. ateria');
ok(s.food.entries.some(e => e.id === 'own1'), 'oma merkintä säilyy');

// uudelleenhaku ei tuplaa eikä muuta
const before = s.updatedAt;
await page.evaluate(() => GT.native.healthImport({ force: true }));
await page.waitForTimeout(600);
s = await st();
ok(s.food.entries.filter(e => e.src === 'yazio').length === 3, 'uudelleenhaku ei tuplaa');
// Yaziossa muutettu ateria päivittyy
await page.evaluate(() => { window.__healthEntries[1].kcal = 750; });
await page.evaluate(() => GT.native.healthImport({ force: true }));
await page.waitForTimeout(600);
s = await st();
ok(s.food.entries.find(e => e.name === 'Yazio · Lounas').kcal === 750, 'muutos Yaziossa päivittyy');
// poisto ei palaa
await go('#/food');

ok(await page.isVisible('.yazio-bar'), 'Ruoka-näkymässä Yazio-tilarivi');
const lid = s.food.entries.find(e => e.name === 'Yazio · Lounas').id;
await page.click(`[data-action="food-entry"][data-id="${lid}"]`); await page.waitForTimeout(400);
await page.click('[data-sheet="delete"]'); await page.waitForTimeout(400);
await page.evaluate(() => GT.native.healthImport({ force: true })); await page.waitForTimeout(600);
s = await st();
ok(!s.food.entries.some(e => e.name === 'Yazio · Lounas'), 'poistettu ateria ei palaa');
// siirto säilyy
const bid = s.food.entries.find(e => e.name === 'Yazio · Aamiainen').id;
await page.click(`[data-action="food-entry"][data-id="${bid}"]`); await page.waitForTimeout(400);
await page.click('[data-sheet="move:snack"]'); await page.waitForTimeout(400);
await page.evaluate(() => GT.native.healthImport({ force: true })); await page.waitForTimeout(600);
s = await st();
ok(s.food.entries.find(e => e.id === bid).meal === 'snack', 'siirretty ateria pysyy siirrettynä');
const tot = await page.evaluate(() => GT.life.dayTotals(GT.Store.get(), GT.life.today()));
ok(tot.kcal === 120 + 512, `päivän kalorit ${tot.kcal}`);
ok(errors.length === 0, 'ei JS-virheitä ' + errors.join(' | '));
await browser.close();
console.log(fails ? `${fails} FAIL` : 'ALL OK'); process.exit(fails ? 1 : 0);
