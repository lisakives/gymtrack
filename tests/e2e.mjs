// Selaintestit (Playwright). Käynnistä ensin:
//   python3 -m http.server 8000            (repositorion juuressa)
//   npx wrangler dev --port 8787           (push-server-kansiossa, valinnainen)
// ja aja: node tests/e2e.mjs
// Testi käyttää vanhan version (v1) tallennusta, jotta nähdään, ettei päivitys riko vanhoja tietoja.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:8000/';
const PUSH = process.env.PUSH || 'http://localhost:8787';
const SHOTS = process.env.SHOTS || null;
let failures = 0, passes = 0;
const ok = (cond, msg) => { if (cond) { passes++; console.log('  ✓', msg); } else { failures++; console.log('  ✗', msg); } };

const oldState = {
  schema: 1, createdAt: '2026-10-01T08:00:00.000Z',
  settings: { restSeconds: 90, autoRest: true, sound: true },
  workouts: [{ id: 'w_pull', name: 'PULL', subtitle: 'Selkä + hauis', exercises: [{ id: 'ex_row', name: 'Alataljasoutu', sets: 3, repMin: 8, repMax: 12 }] }],
  sessions: [{ id: 's_old', workoutId: 'w_pull', workoutName: 'PULL', startedAt: '2026-11-10T15:00:00.000Z', endedAt: '2026-11-10T16:00:00.000Z', notes: 'vanha', prs: [],
    exercises: [{ exerciseId: 'ex_row', name: 'Alataljasoutu', target: { sets: 3, repMin: 8, repMax: 12 }, sets: [{ weight: '60', reps: '10', done: true }] }] }],
  activeSessionId: null,
  measurements: [
    { id: 'm1', type: 'weight', date: '2026-10-05', value: 84.0 }, { id: 'm2', type: 'weight', date: '2026-10-12', value: 83.4 },
    { id: 'm3', type: 'weight', date: '2026-11-02', value: 82.6 }, { id: 'm4', type: 'weight', date: '2026-11-09', value: 82.1 },
    { id: 'm5', type: 'waist', date: '2026-11-09', value: 88 }],
  rest: null, plan: { goal: 'Lihasmassa', guidelines: ['Lämmittele'], schedule: ['w_pull', null, null, null, null, null, null] }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], permissions: ['notifications'], serviceWorkers: 'allow' });
await ctx.addInitScript(([st, push]) => {
  if (!localStorage.getItem('gymtrack.v1')) localStorage.setItem('gymtrack.v1', JSON.stringify(st));
  // Push-palvelun (Apple/FCM) korvike testiä varten: palauttaa tilauksen, jonka avaimet ovat oikeaa muotoa.
  if (window.PushManager) {
    PushManager.prototype.getSubscription = async function () { return window.__sub || null; };
    PushManager.prototype.subscribe = async function (opts) {
      window.__subOpts = opts;
      const ep = 'https://web.push.apple.com/QTEST' + Math.random().toString(36).slice(2);
      window.__sub = { endpoint: ep, options: { applicationServerKey: opts.applicationServerKey.buffer || opts.applicationServerKey }, unsubscribe: async () => { window.__sub = null; return true; },
        toJSON: () => ({ endpoint: ep, keys: { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' } }) };
      return window.__sub;
    };
  }
  window.__push = push;
}, [oldState, PUSH]);
const page = await ctx.newPage();
// Ulkoiset ruokatietopyynnöt estetään testeissä, jotta tulokset ovat toistettavia (oikea haku testataan erikseen mockilla).
await page.route('https://world.openfoodfacts.org/**', route => route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ count: 0, products: [], status: 0 }) }));
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|fonts\.googleapis|ERR_/.test(m.text())) errors.push(m.text()); });

const shot = async name => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };
const state = () => page.evaluate(() => GT.Store.get());
const go = async hash => { await page.evaluate(h => { location.hash = h; }, hash); await page.waitForTimeout(250); };
const closeSheets = async () => { await page.evaluate(() => document.querySelectorAll('.sheet-wrap').forEach(x => x.remove())); };

await page.goto(BASE);
await page.waitForSelector('.today-top');

console.log('Päivitys ja vanhat tiedot');
let st = await state();
ok(st.workouts.length === 1 && st.sessions.length === 1 && st.measurements.length === 5, 'vanhat treenit ja mittaukset säilyivät');
ok(st.food && st.reminders.length === 7 && st.tasks, 'uudet osat lisättiin vanhaan tallennukseen');
ok((await page.evaluate(() => location.hash)) === '#/today', 'oletusnäkymä on Tänään');

console.log('Päivän hallintapaneeli');
const tasks = await page.$$('.task-list li');
ok(tasks.length >= 6, `päivän tehtävät näkyvät (${tasks.length})`);
ok(await page.isVisible('.next-rem') || await page.isVisible('text=Ei tulevia muistutuksia'), 'seuraava muistutus näkyy');
await page.click('.task-list li:first-child .task-check');
await page.waitForTimeout(200);
const pct = await page.textContent('.tt-ring .ring-num b');
ok(+pct > 0, `suoritusprosentti päivittyi (${pct} %)`);
await shot('01-tanaan');

console.log('Ruokaseuranta');
await page.click('button[data-action="food-add"]');
await page.waitForSelector('.food-sheet');
await page.click('.meal-pick button[data-meal="m1"]');
await page.fill('.food-sheet .search', 'kanarinta');
await page.waitForTimeout(150);
await page.click('.fr-list .fr-main');
await page.fill('.amt', '200');
await page.waitForTimeout(100);
const prev = await page.textContent('.amt-preview b');
ok(prev.includes('300'), `määrän esikatselu laskee kalorit (200 g → ${prev})`);
await page.click('[data-confirm]');
await page.waitForTimeout(150);
await page.fill('.food-sheet .search', 'rahka');
await page.click('.fr-list .fr-add'); // pikalisäys oletusannoksella
await page.waitForTimeout(150);
await shot('02-ruoka-haku');
await page.click('.food-sheet [data-sheet="done"]');
await page.waitForTimeout(400);
st = await state();
const today = await page.evaluate(() => GT.life.today());
const todays = st.food.entries.filter(e => e.date === today);
ok(todays.length === 2, 'kaksi ruokaa lisättiin');
ok(todays[0].kcal === 300 && todays[0].p === 60, 'kanan ravintoarvot oikein (300 kcal, 60 g proteiinia)');
ok(!!st.tasks.done[today].r_meal1, '1. aterian kirjaus merkitsi ateriamuistutuksen tehdyksi');

await go('#/food');
await page.waitForTimeout(900); // lukujen laskuri-animaatio
ok((await page.textContent('.food-total .big')).includes('463'), 'päivän kalorit yhteensä (300 + 163 = 463)');
// suosikiksi
await page.click('.food-list li:first-child');
await page.click('[data-sheet="fav"]');
await page.waitForTimeout(400);
st = await state();
ok(st.food.favorites.length === 1, 'ruoka tallennettiin suosikiksi');
await page.click('.fav-chip');
await page.waitForTimeout(300);
st = await state();
ok(st.food.entries.filter(e => e.date === today).length === 3, 'suosikki lisättiin yhdellä napautuksella');
// koko ateria suosikiksi
await page.click('button[data-action="meal-menu"][data-meal="m1"]');
await page.click('[data-sheet="fav"]');
await page.waitForSelector('.sheet-form');
await page.click('.sheet-form button[type="submit"]');
await page.waitForTimeout(400);
st = await state();
ok(st.food.favorites.length === 2 && st.food.favorites[1].items.length >= 2, 'koko ateria tallennettiin suosikiksi');
// oma ruoka
console.log('Open Food Facts');
const offNut = { 'energy-kcal_100g': 370, proteins_100g: 12, carbohydrates_100g: 60, fat_100g: 7 };
await page.route('**/api/v2/search**', route => route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ products: [
  { code: '6411100001234', product_name: 'Kaurapuuro', brands: 'Testi', nutriments: offNut },
  { code: '1', product_name: 'Ei ravintoarvoja' }
] }) }));
await page.route('**/api/v2/product/**', route => route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ status: 1, product: { code: '6411100001234', product_name: 'Kaurapuuro', brands: 'Testi', nutriments: offNut } }) }));
await page.evaluate(() => { location.hash = '#/food'; });
await page.waitForSelector('button[data-action="food-add"]');
await page.click('button[data-action="food-add"]');
await page.waitForSelector('.food-sheet');
await page.fill('.food-sheet .search', 'kaura');
await page.waitForSelector('.fr-list .fr-main:has-text("Kaurapuuro")', { timeout: 5000 });
ok(await page.locator('.fr-list .fr-main', { hasText: 'Ei ravintoarvoja' }).count() === 0, 'tuotteet ilman ravintoarvoja jätetään pois');
ok((await page.textContent('.food-sheet')).includes('Open Food Facts'), 'verkkohaun tulokset ja lähde näkyvät');
await page.fill('.barcode-row .code', '6411100001234');
await page.click('[data-code]');
await page.waitForSelector('.amount-view', { timeout: 5000 });
ok((await page.textContent('.amount-view')).includes('Kaurapuuro (Testi)'), 'viivakoodihaku avaa tuotteen määräsivulle');
await page.click('[data-back]');
await page.click('[data-sheet="done"]');
await page.unroute('**/api/v2/search**');
await page.unroute('**/api/v2/product/**');

await page.click('button[data-action="food-add"][data-meal="snack"]');
await page.waitForSelector('.food-sheet');
await page.click('[data-x="custom"]');
await page.waitForSelector('#f_name');
await page.fill('#f_name', 'Proteiinipatukka X'); await page.fill('#f_amount', '1'); await page.fill('#f_unit', 'kpl');
await page.fill('#f_kcal', '210'); await page.fill('#f_p', '20'); await page.fill('#f_c', '15,5'); await page.fill('#f_f', '7');
await page.click('.sheet-form button[type="submit"]');
await page.waitForTimeout(400);
st = await state();
const bar = st.food.entries.find(e => e.name === 'Proteiinipatukka X');
ok(bar && bar.kcal === 210 && bar.c === 15.5 && bar.meal === 'snack', 'oma ruoka tallentui oikein (desimaalipilkku toimii)');
// poisto
const before = st.food.entries.length;
await page.click(`.food-list li[data-id="${bar.id}"]`);
await page.click('[data-sheet="delete"]');
await page.waitForTimeout(300);
ok((await state()).food.entries.length === before - 1, 'ruoan poisto toimii');
// tavoitteet
await page.click('button[data-action="food-menu"]'); await page.click('.pop-menu button[data-action="food-goals"]');
await page.fill('#f_kcal', '2600'); await page.fill('#f_protein', '170');
await page.click('.sheet-form button[type="submit"]');
await page.waitForTimeout(300);
st = await state();
ok(st.food.goals.kcal === 2600 && st.food.goals.protein === 170, 'henkilökohtaiset tavoitteet tallentuivat');
await shot('03-ruoka-paiva');
// eilisen toisto
await page.evaluate(() => { GT.Store.update(s => s.food.entries.push({ id: 'y1', date: GT.life.addDays(GT.life.today(), -1), meal: 'm3', name: 'Lohi, kypsä', amount: 150, unit: 'g', kcal: 315, p: 33, c: 0, f: 20, createdAt: new Date(Date.now() - 86400000).toISOString() })); GT.render(); });
await page.click('button[data-action="meal-copy"][data-meal="m3"]');
await page.waitForTimeout(300);
st = await state();
ok(st.food.entries.some(e => e.date === today && e.name === 'Lohi, kypsä'), 'edellisen päivän ateria kopioitiin');
// raportit
await go('#/food-report/week');
ok((await page.$$('.chart.bars rect')).length === 14, 'viikkoraportin pylväät (kalorit + proteiini)');
await shot('04-ruoka-viikko');
await go('#/food-report/month');
ok((await page.$$('.chart.bars rect')).length >= 56, 'kuukausiraportin pylväät');
await page.click('button[data-action="report-shift"]');
ok((await page.textContent('.date-nav b')).toLowerCase().includes('lokakuu'), 'edellinen kuukausi aukeaa');

console.log('Muistutukset');
await go('#/reminders');
ok((await page.$$('.rem-list .list-row')).length === 7, 'oletusmuistutukset (6 + viikkoraportti)');
const times = await page.$$eval('.rem-time', els => els.map(e => e.textContent.trim().slice(0, 5)));
ok(['09.00', '12.00', '15.30', '19.30', '20.00', '21.00'].every(t => times.some(x => x.startsWith(t))), 'kellonajat vastaavat suunnitelmaa');
await page.click('button[data-action="rem-menu"]'); await page.click('.pop-menu button[data-action="rem-new"]');
await page.waitForSelector('.rem-form');
await page.fill('.rem-form input[name="time"]', '10:15');
await page.fill('.rem-form input[name="title"]', 'Juo vettä');
await page.click('.day-pick button[data-d="5"]'); await page.click('.day-pick button[data-d="6"]'); // pois la+su → arkisin
await page.click('.rem-form button[type="submit"]');
await page.waitForTimeout(400);
st = await state();
let own = st.reminders.find(r => r.title === 'Juo vettä');
ok(own && own.time === '10:15' && own.days.join() === '0,1,2,3,4', 'oma muistutus lisättiin (arkisin 10.15)');
await page.click(`[data-action="rem-edit"][data-id="${own.id}"]`);
await page.waitForSelector('.rem-form');
await page.fill('.rem-form input[name="time"]', '10:45');
await page.click('.rem-form button[type="submit"]');
await page.waitForTimeout(400);
ok((await state()).reminders.find(r => r.id === own.id).time === '10:45', 'kellonajan muutos tallentui');
await page.click(`input[data-bind="rem-enabled"][data-id="r_prep"] + i`);
await page.waitForTimeout(200);
ok((await state()).reminders.find(r => r.id === 'r_prep').enabled === false, 'muistutuksen voi kytkeä pois');
await page.click(`[data-action="rem-edit"][data-id="${own.id}"]`);
await page.click('[data-sheet="delete"]');
await page.click('[data-sheet="ok"]');
await page.waitForTimeout(400);
ok(!(await state()).reminders.some(r => r.id === own.id), 'muistutuksen poisto toimii');
// Olen töissä: työpäivinä ateriamuistutus saa työpäivän tekstin
await page.evaluate(() => { const t = GT.life.today(); GT.Store.update(s => { s.trip = { from: t, to: GT.life.addDays(t, 2) }; }); GT.render(); });
await go('#/reminders'); await page.waitForTimeout(200);
ok(await page.isVisible('.trip-card.on'), 'Olen töissä -kortti näkyy työjakson aikana');
const tripPayload = await page.evaluate(() => GT.life.serverState(GT.Store.get()));
ok(tripPayload.trip && tripPayload.reminders.find(r => r.id === 'r_meal1').tripBody.startsWith('Työpäivä'), 'työjakso synkronoidaan palvelimelle työpäivän tekstin kanssa');
await page.evaluate(() => { GT.Store.update(s => { s.trip = null; }); GT.render(); });
ok(await page.isVisible('.trip-card .chip'), 'työjakson voi lopettaa');
await shot('05-muistutukset');

console.log('Torkku ja ilmoituksesta avaus');
await go('#/today?r=r_meal2');
await page.waitForSelector('.sheet-title:has-text("Seuraava ateria")');
ok(true, 'ilmoituksen linkki avaa muistutuksen (Tehty / Torkuta)');
ok((await page.evaluate(() => location.hash)) === '#/today', 'osoite siistitään avauksen jälkeen');
await page.click('[data-sheet="snz:30"]');
await page.waitForTimeout(400);
st = await state();
ok(st.snoozed.r_meal2 > Date.now() + 29 * 60000, 'torkku 30 min tallentui');
ok((await page.textContent('.next-rem')).includes('Seuraava ateria'), 'seuraava muistutus näyttää torkun');
await page.click('[data-action="task-menu"][data-id="r_meal2"]');
await page.click('[data-sheet="toggle"]');
await page.waitForTimeout(300);
st = await state();
ok(st.tasks.done[today].r_meal2 && !st.snoozed.r_meal2, 'tehdyksi merkintä poistaa torkun');

console.log('Push-ilmoitukset (palvelin: ' + PUSH + ')');
let pushUp = false;
try { pushUp = (await (await fetch(PUSH + '/api/health')).json()).ok; } catch (e) { /* */ }
await go('#/notifications');
await page.waitForTimeout(400);
ok(await page.isVisible('text=Ilmoituspalvelin'), 'ilmoitusten asennusvaiheet näkyvät');
ok(await page.isDisabled('button[data-action="push-enable"]') && await page.isVisible('text=Lisää Koti-valikkoon'), 'iPhonen Safarissa (ei asennettu) neuvotaan lisäämään Koti-valikkoon');
// Simuloidaan kotinäytöltä avattua sovellusta
await page.evaluate(() => { Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }); GT.viewState.pushStatus = null; GT.render(); });
await page.waitForTimeout(300);
ok(await page.isVisible('text=Ilmoituspalvelin') && !(await page.isVisible('text=Lisää Koti-valikkoon</b>')), 'kotinäytöltä avattuna asennusvaihe on kunnossa');
if (pushUp) {
  await page.fill('input[data-bind="push-server"]', PUSH);
  await page.waitForTimeout(300);
  await go('#/notifications'); await page.waitForTimeout(400);
  await page.click('button[data-action="push-enable"]');
  await page.waitForTimeout(1500);
  st = await state();
  ok(st.push.subscribed === true && !!st.push.userId, 'tilaus tallentui palvelimelle');
  const ak = await page.evaluate(() => window.__subOpts && window.__subOpts.applicationServerKey.length);
  ok(ak === 65, 'VAPID-julkinen avain haettiin palvelimelta (65 tavua)');
  const srv = await (await fetch(PUSH + '/api/status', { method: 'POST', body: JSON.stringify({ userId: st.push.userId, secret: st.push.secret }) })).json();
  ok(srv.subscriptions.length === 1, 'palvelimella on laitteen tilaus');
  // muutokset synkronoituvat palvelimelle
  await page.evaluate(() => { GT.Store.update(s => { s.reminders.find(r => r.id === 'r_start').time = '08:30'; }); GT.push.syncNow(true); });
  await page.waitForTimeout(800);
  await shot('06-ilmoitukset');
  await page.click('button[data-action="push-status"]');
  await page.waitForTimeout(600);
  ok(await page.isVisible('.server-log'), 'palvelimen tila näkyy sovelluksessa');
  await page.click('button[data-action="push-test"][data-v="60"]');
  await page.waitForTimeout(500);
  const srv2 = await (await fetch(PUSH + '/api/status', { method: 'POST', body: JSON.stringify({ userId: st.push.userId, secret: st.push.secret }) })).json();
  ok(srv2.pending.length === 1, 'ajastettu testi-ilmoitus odottaa palvelimella');
} else console.log('  (push-palvelin ei käynnissä, osa ohitettu)');

console.log('Kehitys ja viikkoraportti');
await go('#/body/weight');
await page.click('button[data-action="body-group"][data-v="week"]');
await page.waitForTimeout(200);
ok((await page.textContent('.content')).includes('Viikkokeskiarvot'), 'painon viikkonäkymä');
await page.click('button[data-action="body-group"][data-v="month"]');
await page.waitForTimeout(200);
ok((await page.$$('.list.card')).length >= 2 && (await page.textContent('.content')).includes('Kuukausikeskiarvot'), 'painon kuukausinäkymä');
await shot('07-paino-kk');
await go('#/report');
ok(await page.isVisible('.tips'), 'viikkoraportti ja parannusehdotukset');
await shot('08-viikkoraportti');
await go('#/report/' + (await page.evaluate(() => GT.life.weekStartISO())));
const rep = await page.evaluate(() => GT.life.weeklyReport(GT.Store.get(), GT.life.weekStartISO()));
ok(rep.logged >= 1 && rep.avgKcal > 0 && rep.tasksDone >= 3, `kuluvan viikon raportti laskee tiedot (kirjattu ${rep.logged} pv, ka ${rep.avgKcal} kcal, tehtäviä ${rep.tasksDone})`);

console.log('Vanhat treeniominaisuudet');
await go('#/home');
await page.click('button[data-action="start-workout"]');
await page.waitForTimeout(300);
ok((await page.evaluate(() => location.hash)) === '#/session', 'treenin aloitus');
await page.click('a[href="#/session/0"]');
await page.fill('.set-input[data-field="weight"][data-i="0"]', '62,5');
await page.fill('.set-input[data-field="reps"][data-i="0"]', '10');
await page.click('.set-check[data-i="0"]');
await page.waitForTimeout(200);
await page.click('button[data-action="rest-stop"]').catch(() => {});
await go('#/session');
await page.click('button[data-action="finish-session"]');
await page.click('[data-sheet="ok"]');
await page.waitForTimeout(400);
st = await state();
ok(st.sessions.filter(s => s.endedAt).length === 2, 'treeni tallentui historiaan');
ok(st.sessions.some(s => s.prs && s.prs.length), 'ennätys tunnistettiin (62,5 kg > 60 kg)');
await go('#/history');
ok((await page.$$('.hist-card')).length === 2, 'historia näyttää molemmat treenit');
await go('#/progress');
ok(await page.isVisible('text=Alataljasoutu'), 'liikkeiden kehitys toimii');
await go('#/settings');
await page.click('button[data-action="export"]').catch(() => {});
const exp = await page.evaluate(() => JSON.parse(GT.Store.exportJSON()));
ok(exp.data.food.entries.length > 0 && exp.data.reminders.length > 0, 'varmuuskopio sisältää ruoat ja muistutukset');

console.log('Käyttäjätili ja salattu pilvivarmuuskopio');
if (!pushUp) {
  console.log('  (ohitettu: palvelin ei vastaa – käynnistä node tests/dev-server.mjs)');
} else {
  const uname = 'testi' + Date.now().toString(36);
  await page.evaluate(p => GT.Store.update(s => { s.push.server = p; }), PUSH);
  await go('#/today');
  ok(await page.isVisible('.cloud-banner'), 'Tänään-näkymä ehdottaa tilin luontia');
  await go('#/settings');
  ok(await page.isVisible('text=Tallenna tiedot pilveen automaattisesti'), 'asetuksissa on tilin luonti');
  await page.click('button[data-action="acc-register"]');
  await page.waitForSelector('.sheet input[name="password2"]');
  await page.fill('.sheet input[name="username"]', uname);
  await page.fill('.sheet input[name="password"]', 'Salasana-1');
  await page.fill('.sheet input[name="password2"]', 'eri');
  await page.click('.sheet button[type="submit"]');
  await page.waitForTimeout(300);
  ok(await page.isVisible('text=Salasanat eivät täsmää'), 'eri salasanat huomataan');
  await page.click('button[data-action="acc-register"]');
  await page.waitForSelector('.sheet input[name="password2"]');
  await page.fill('.sheet input[name="username"]', uname);
  await page.fill('.sheet input[name="password"]', 'Salasana-1');
  await page.fill('.sheet input[name="password2"]', 'Salasana-1');
  await page.click('.sheet button[type="submit"]');
  await page.waitForSelector('.recovery-code', { timeout: 15000 });
  const code = (await page.textContent('.recovery-code')).trim();
  ok(/^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/.test(code), 'palautuskoodi näytetään (' + code + ')');
  await shot('cloud-recovery-code');
  await page.click('[data-sheet="ok"]');
  await page.waitForTimeout(800);
  let cs = await page.evaluate(() => GT.cloud.status());
  ok(cs.loggedIn && cs.username === uname && cs.lastOkAt, 'tili luotu ja ensimmäinen varmuuskopio lähetetty');
  await go('#/settings');
  ok(await page.isVisible('text=Automaattinen varmuuskopio päällä'), 'asetuksissa näkyy kirjautunut tila');
  await shot('cloud-settings');
  st = await state();
  const idA = { userId: st.push.userId, secret: st.push.secret };
  const raw = await (await fetch(PUSH + '/api/backup/get', { method: 'POST', body: JSON.stringify(idA) })).json();
  ok(raw.data && !raw.data.includes('Alataljasoutu') && !Buffer.from(raw.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('latin1').includes('Alataljasoutu'), 'palvelimella on vain salattua dataa');
  ok(!JSON.stringify(st).includes(code.replace(/-/g, '')) && !JSON.stringify(st).includes('Salasana-1'), 'salasanaa ja palautuskoodia ei tallenneta laitteelle');

  // Automaattinen lähetys muutoksesta
  await page.evaluate(() => GT.Store.update(s => { s.measurements.push({ id: 'm_cloud', type: 'weight', date: GT.fmt.todayISO(), value: 81.5 }); }));
  await page.waitForTimeout(6500);
  const head1 = await (await fetch(PUSH + '/api/backup/head', { method: 'POST', body: JSON.stringify(idA) })).json();
  ok(head1.latest && head1.latest.hash === (await page.evaluate(() => JSON.parse(localStorage.getItem('gymtrack.cloud')).uploadedHash)), 'muutos lähetettiin automaattisesti');

  // Uusi puhelin: kirjautuminen palauttaa tiedot
  const ctxB = await browser.newContext({ ...devices['iPhone 13'] });
  const pageB = await ctxB.newPage();
  pageB.on('pageerror', e => errors.push('B: ' + e.message));
  await pageB.goto(BASE);
  await pageB.waitForSelector('.today-top');
  await pageB.evaluate(p => GT.Store.update(s => { s.push.server = p; }), PUSH);
  await pageB.evaluate(() => { location.hash = '#/settings'; });
  await pageB.waitForTimeout(300);
  await pageB.click('button[data-action="acc-login"]');
  await pageB.waitForSelector('.sheet input[name="password"]');
  await pageB.fill('.sheet input[name="username"]', uname.toUpperCase());
  await pageB.fill('.sheet input[name="password"]', 'väärä-salasana');
  await pageB.click('.sheet button[type="submit"]');
  await pageB.waitForTimeout(1500);
  ok(await pageB.isVisible('text=Väärä käyttäjänimi tai salasana'), 'väärä salasana hylätään');
  await pageB.click('button[data-action="acc-login"]');
  await pageB.waitForSelector('.sheet input[name="password"]');
  await pageB.fill('.sheet input[name="username"]', uname);
  await pageB.fill('.sheet input[name="password"]', 'Salasana-1');
  await pageB.click('.sheet button[type="submit"]');
  await pageB.waitForFunction(() => GT.Store.get().measurements.some(m => m.id === 'm_cloud'), null, { timeout: 15000 }).catch(() => {});
  let stB = await pageB.evaluate(() => GT.Store.get());
  ok(stB.sessions.length === (await state()).sessions.length && stB.measurements.some(m => m.id === 'm_cloud') && stB.food.entries.length === (await state()).food.entries.length, 'uusi puhelin sai kaikki tiedot kirjautumalla');

  // Muutos puhelimella B näkyy puhelimella A
  await pageB.evaluate(() => GT.Store.update(s => { s.measurements.push({ id: 'm_fromB', type: 'waist', date: GT.fmt.todayISO(), value: 87 }); }));
  await pageB.evaluate(() => GT.cloud.upload());
  await page.evaluate(() => GT.cloud.check());
  ok((await state()).measurements.some(m => m.id === 'm_fromB'), 'toisen puhelimen muutos haettiin automaattisesti');
  ok((await state()).push.endpoint === st.push.endpoint, 'pilvestä haku ei koske laitteen ilmoitusasetuksiin');

  // Versiot
  const vers = await page.evaluate(() => GT.cloud.list());
  ok(vers.length === 1 && vers[0].day, 'päiväkohtainen versio löytyy');

  // Unohtunut salasana puhelimella B
  await pageB.evaluate(() => GT.cloud.logout());
  await pageB.evaluate(() => { location.hash = '#/settings'; });
  await pageB.waitForTimeout(300);
  ok(await pageB.isVisible('button[data-action="acc-login"]'), 'uloskirjautuminen palauttaa kirjautumisnäkymän');
  await pageB.click('button[data-action="acc-forgot"]');
  await pageB.waitForSelector('.sheet input[name="code"]');
  await pageB.fill('.sheet input[name="username"]', uname);
  await pageB.fill('.sheet input[name="code"]', code.toLowerCase().replace(/-/g, ' '));
  await pageB.fill('.sheet input[name="password"]', 'Uusi-salasana-2');
  await pageB.fill('.sheet input[name="password2"]', 'Uusi-salasana-2');
  await pageB.click('.sheet button[type="submit"]');
  await pageB.waitForFunction(() => GT.cloud.status().loggedIn, null, { timeout: 15000 }).catch(() => {});
  await pageB.waitForTimeout(500);
  stB = await pageB.evaluate(() => GT.Store.get());
  ok((await pageB.evaluate(() => GT.cloud.status().loggedIn)) && stB.measurements.some(m => m.id === 'm_fromB'), 'salasana vaihdettu palautuskoodilla, tiedot tallessa');
  await pageB.evaluate(() => GT.cloud.upload(true));
  await page.evaluate(() => GT.cloud.check());
  ok((await page.evaluate(() => GT.cloud.status())).needsLogin, 'vanha puhelin pyytää kirjautumaan uudelleen salasanan vaihdon jälkeen');
  await go('#/settings');
  ok(await page.isVisible('button[data-action="acc-relogin"]'), 'kirjaudu uudelleen -painike näkyy');
  await ctxB.close();
}

console.log('Uudelleenlataus');
await page.reload();
await page.waitForSelector('.top');
st = await state();
ok(st.food.entries.filter(e => e.date === today).length >= 4 && st.sessions.length === 2, 'tiedot säilyvät uudelleenlatauksen jälkeen');
const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return r && r.active ? r.active.scriptURL : null; });
ok(sw && sw.endsWith('sw.js'), 'service worker on aktiivinen');

ok(errors.length === 0, 'ei JavaScript-virheitä' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
console.log(`\n${passes} läpi, ${failures} epäonnistui`);
process.exit(failures ? 1 : 0);
