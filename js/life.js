/* GymTrack – elämäntapatoiminnot: ruokaseuranta, muistutukset, tehtävät, viikkoraportti (tietomalli) */
(function () {
  'use strict';

  const M = GT.model;
  const num = M.num;

  /* ---------- Päivämäärät ---------- */
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
  const today = () => iso(new Date());
  const weekday = s => (parseISO(s).getDay() + 6) % 7; // ma = 0
  const weekStartISO = (s = today()) => addDays(s, -weekday(s));
  const hm = (d = new Date()) => pad(d.getHours()) + ':' + pad(d.getMinutes());
  const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  /* ---------- Ateriat ---------- */
  const MEALS = [
    { key: 'm1', label: '1. ateria' },
    { key: 'm2', label: '2. ateria' },
    { key: 'm3', label: '3. ateria' },
    { key: 'snack', label: 'Välipalat' }
  ];
  const mealLabel = k => (MEALS.find(m => m.key === k) || MEALS[3]).label;
  /** Oletusateria kellonajan mukaan (muistutusajat 12.00 / 15.30 / 19.30). */
  function defaultMeal(d = new Date()) {
    const m = d.getHours() * 60 + d.getMinutes();
    if (m < 14 * 60 + 30) return 'm1';
    if (m < 18 * 60 + 30) return 'm2';
    return 'm3';
  }

  /* ---------- Oletusmuistutukset ---------- */
  const TRIP_MEAL = 'Työpäivä: syö proteiinia ja juo vettä. Ota ateriatauko ja kirjaa ateria.';

  function defaultReminders() {
    const r = (id, time, title, body, extra = {}) => ({ id, time, title, body, days: [], enabled: true, notify: true, ...extra });
    return [
      r('r_start', '09:00', 'Päivän käynnistys', 'Katso päivän tehtävät ja aloita päivä suunnitellusti.'),
      r('r_meal1', '12:00', 'Ensimmäinen ateria', 'Aika syödä päivän ensimmäinen ateria. Kirjaa se sovellukseen.', { kind: 'meal', meal: 'm1', tripBody: TRIP_MEAL }),
      r('r_meal2', '15:30', 'Seuraava ateria', 'Aika seuraavalle aterialle. Muista proteiini.', { kind: 'meal', meal: 'm2', tripBody: TRIP_MEAL }),
      r('r_meal3', '19:30', 'Viimeinen ateria', 'Päivän viimeinen ateria. Kirjaa se heti.', { kind: 'meal', meal: 'm3', tripBody: TRIP_MEAL }),
      r('r_summary', '20:00', 'Päivän ruokailujen yhteenveto', 'Tarkista, että kaikki päivän ateriat on kirjattu.', { kind: 'summary' }),
      r('r_prep', '21:00', 'Huomiseen valmistautuminen', 'Valmistele huomisen ateriat ja katso huomisen tehtävät.'),
      r('r_week', '18:00', 'Viikkoraportti', 'Viikon yhteenveto on valmis. Katso, mitä parannat ensi viikolla.', { days: [6], kind: 'report' })
    ];
  }

  function defaultLife() {
    return {
      food: { entries: [], favorites: [], goals: { kcal: 2400, protein: 160, carbs: 250, fat: 80, weight: null } },
      reminders: defaultReminders(),
      tasks: { done: {}, since: today() },
      trip: null,
      push: { userId: null, secret: null, server: '', subscribed: false, endpoint: null, lastSync: null, lastError: null },
      snoozed: {}
    };
  }

  /** Lisää uudet osat vanhaan tallennukseen ilman, että mitään olemassa olevaa muutetaan. */
  function ensureLife(st) {
    if (!st) return false;
    let changed = false;
    const def = defaultLife();
    Object.keys(def).forEach(k => { if (!st[k]) { st[k] = def[k]; changed = true; } });
    if (!st.food.entries) { st.food.entries = []; changed = true; }
    if (!st.food.favorites) { st.food.favorites = []; changed = true; }
    if (!st.food.goals) { st.food.goals = def.food.goals; changed = true; }
    if (!st.tasks.done) { st.tasks.done = {}; changed = true; }
    if (!Array.isArray(st.reminders)) { st.reminders = def.reminders; changed = true; }
    if (st.trip === undefined) { st.trip = null; changed = true; }
    // Vanhoihin ateriamuistutuksiin lisätään matkateksti
    st.reminders.forEach(r => { if (r.kind === 'meal' && !r.tripBody) { r.tripBody = TRIP_MEAL; changed = true; } });
    // Päivä, josta lähtien tehtäviä seurataan (ei lasketa aiempia päiviä tekemättömiksi)
    if (!st.tasks.since) { st.tasks.since = today(); changed = true; }
    return changed;
  }

  // Uusi asennus saa heti myös elämäntapaosat
  const baseCreate = M.createDefault;
  M.createDefault = function () { const st = baseCreate(); Object.assign(st, defaultLife()); return st; };

  /* ---------- Ruoka ---------- */
  const r1 = v => Math.round((+v || 0) * 10) / 10;
  function entriesOn(st, date) { return st.food.entries.filter(e => e.date === date); }
  function totals(list) {
    const t = { kcal: 0, p: 0, c: 0, f: 0, n: list.length };
    list.forEach(e => { t.kcal += +e.kcal || 0; t.p += +e.p || 0; t.c += +e.c || 0; t.f += +e.f || 0; });
    t.kcal = Math.round(t.kcal); t.p = r1(t.p); t.c = r1(t.c); t.f = r1(t.f);
    return t;
  }
  const dayTotals = (st, date) => totals(entriesOn(st, date));

  /** Skaalaa ruoan uuteen määrään. per100 = arvot 100 g/ml kohden; muuten suhteessa alkuperäiseen määrään. */
  function scaleItem(item, amount) {
    amount = num(amount);
    if (amount === null || amount <= 0) return null;
    let k;
    if (item.per100) k = { kcal: item.per100.kcal * amount / 100, p: item.per100.p * amount / 100, c: item.per100.c * amount / 100, f: item.per100.f * amount / 100 };
    else {
      const base = num(item.amount) || 1;
      const ratio = amount / base;
      k = { kcal: (+item.kcal || 0) * ratio, p: (+item.p || 0) * ratio, c: (+item.c || 0) * ratio, f: (+item.f || 0) * ratio };
    }
    return { name: item.name, amount, unit: item.unit || 'g', per100: item.per100 || null, kcal: Math.round(k.kcal), p: r1(k.p), c: r1(k.c), f: r1(k.f) };
  }

  /** Viimeksi käytetyt ruoat (eri nimet), uusin ensin. */
  function recentFoods(st, limit = 12) {
    const seen = new Set(), out = [];
    const list = st.food.entries.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    for (const e of list) {
      const k = e.name.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k); out.push(e);
      if (out.length >= limit) break;
    }
    return out;
  }

  function searchFoods(st, q) {
    q = (q || '').trim().toLowerCase();
    const recent = recentFoods(st, 40);
    const db = (GT.FOODS || []).map(f => ({ name: f.n, amount: f.por ? f.por[1] : 100, unit: f.unit, per100: { kcal: f.kcal, p: f.p, c: f.c, f: f.f }, por: f.por, db: true }));
    const favs = st.food.favorites;
    if (!q) return { favs, recent: recent.slice(0, 12), db: [] };
    // Osuma: kaikki hakusanat löytyvät nimestä; muuten kirjaimet oikeassa järjestössä (kirjoitusvirheet, yhdyssanat)
    const words = q.split(/\s+/).filter(Boolean);
    const score = s => {
      s = s.toLowerCase();
      if (words.every(w => s.includes(w))) return s.startsWith(words[0]) ? 3 : 2;
      if (q.length >= 4) { let i = 0; for (const ch of s) if (ch === q[i]) i++; if (i >= q.length) return 1; }
      return 0;
    };
    const rank = (arr, f) => arr.map(x => ({ x, s: f(x) })).filter(o => o.s > 0).sort((a, b) => b.s - a.s).map(o => o.x);
    const recentNames = new Set(recent.map(r => r.name.toLowerCase()));
    return {
      favs: rank(favs, f => Math.max(score(f.name), ...f.items.map(i => score(i.name)))),
      recent: rank(recent, r => score(r.name)),
      db: rank(db.filter(d => !recentNames.has(d.name.toLowerCase())), d => score(d.name))
    };
  }

  /* ---------- Tehtävät ja muistutukset ---------- */
  const activeOn = (r, date) => r.enabled !== false && (!r.days || !r.days.length || r.days.includes(weekday(date)));
  function tasksOn(st, date) {
    const done = st.tasks.done[date] || {};
    return st.reminders.filter(r => activeOn(r, date)).sort((a, b) => a.time.localeCompare(b.time))
      .map(r => ({ r, done: !!done[r.id], doneAt: done[r.id] || null }));
  }
  function taskProgress(st, date) {
    const list = tasksOn(st, date);
    const d = list.filter(x => x.done).length;
    return { done: d, total: list.length, pct: list.length ? Math.round(d / list.length * 100) : 0, list };
  }
  function setDone(st, rid, date, on) {
    const day = st.tasks.done[date] = st.tasks.done[date] || {};
    if (on) day[rid] = new Date().toISOString(); else delete day[rid];
    if (on && st.snoozed) delete st.snoozed[rid];
    // vanhat merkinnät säilyvät raportteja varten (ei siivota)
  }

  /** Seuraava ilmoitus: { r, at: Date, snoozed } */
  /** Onko päivä matkalla ("Olen ajo keikalla"). */
  function onTrip(st, date) {
    const t = st.trip;
    return !!(t && t.from && t.to && date >= t.from && date <= t.to);
  }

  function nextReminder(st, now = new Date()) {
    const out = [];
    const tISO = iso(now);
    const doneT = st.tasks.done[tISO] || {};
    Object.entries(st.snoozed || {}).forEach(([rid, until]) => {
      const r = st.reminders.find(x => x.id === rid);
      if (r && until > +now && !doneT[rid]) out.push({ r, at: new Date(until), snoozed: true });
    });
    for (let i = 0; i < 8; i++) {
      const date = addDays(tISO, i);
      const done = st.tasks.done[date] || {};
      st.reminders.forEach(r => {
        if (r.notify === false || !activeOn(r, date) || done[r.id]) return;
        const at = parseISO(date); const m = toMin(r.time); at.setHours(Math.floor(m / 60), m % 60, 0, 0);
        if (at > now) out.push({ r, at, snoozed: false });
      });
      if (out.length && i > 0) break;
    }
    out.sort((a, b) => a.at - b.at);
    return out[0] || null;
  }

  /** Ateria kirjattu → vastaava ateriamuistutus merkitään tehdyksi automaattisesti. */
  function autoCompleteMeal(st, date, meal) {
    st.reminders.filter(r => r.kind === 'meal' && r.meal === meal && activeOn(r, date)).forEach(r => {
      if (!(st.tasks.done[date] || {})[r.id]) setDone(st, r.id, date, true);
    });
  }

  /* ---------- Tuonti Apple Healthista (Yazio) ----------
   * iPhone-sovellus lukee Apple Healthista ravintonäytteet (ks. ios/GymTrack/HealthNutrition.swift) ja
   * ryhmittelee ne aterioiksi. Täällä ne muutetaan ruokamerkinnöiksi (src: 'yazio'). Tuonti korvaa aina
   * haetun aikavälin Yazio-merkinnät, joten sama ateria ei koskaan tule kahdesti. Itse kirjattuihin
   * merkintöihin ei kosketa. Merkinnät tallentuvat pilveen kuten muutkin, joten ne näkyvät myös verkkosovelluksessa. */
  const IMPORT_MEALS = [
    [/breakfast|aamiai|aamupala|frühstück|desayuno|petit/i, 'm1', 'Aamiainen'],
    [/lunch|lounas|mittag|almuerzo|déjeuner/i, 'm2', 'Lounas'],
    [/dinner|supper|illalli|päivälli|abend|cena|dîner/i, 'm3', 'Illallinen'],
    [/snack|välipala|zwischen|merienda|collation/i, 'snack', 'Välipala']
  ];
  const YAZIO_RE = /yazio/i;

  function importMeal(x) {
    const hit = IMPORT_MEALS.find(([re]) => re.test(x.foodType || ''));
    if (hit) return { meal: hit[1], label: hit[2] };
    const [h, m] = String(x.time || '12:00').split(':').map(Number);
    const d = new Date(2000, 0, 1, h || 0, m || 0);
    const meal = defaultMeal(d);
    return { meal, label: x.foodType || mealLabel(meal) };
  }

  const shortHash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };

  /**
   * Laskee, mitä Apple Healthista haettu vastaus muuttaisi. Ei muuta tilaa.
   * res = { from, to, entries: [{ key, date, time, foodType, source, bundle, kcal, p, c, f }], sources }
   * Palauttaa { changed, entries (uudet Yazio-merkinnät), from, to, count, days, kcal, others (muut lähteet) }.
   */
  function planImport(st, res, now = new Date().toISOString()) {
    const from = res.from, to = res.to;
    const yz = st.food.yazio || {};
    const skip = new Set(yz.skip || []);
    const old = new Map(st.food.entries.filter(e => e.src === 'yazio').map(e => [e.id, e]));
    const entries = [];
    (res.entries || []).forEach(x => {
      if (!YAZIO_RE.test(`${x.bundle || ''} ${x.source || ''}`)) return;
      if (!x.date || x.date < from || x.date > to) return;
      const kcal = Math.round(+x.kcal || 0), p = r1(x.p), c = r1(x.c), f = r1(x.f);
      if (!kcal && !p && !c && !f) return;
      const id = 'yz_' + shortHash(x.key || `${x.date}|${x.time}|${x.foodType}`);
      if (skip.has(id)) return;
      const { meal, label } = importMeal(x);
      const prev = old.get(id);
      entries.push({
        id, date: x.date, meal: prev && prev.mealMoved ? prev.meal : meal, name: `Yazio · ${label}`,
        amount: 1, unit: 'annos', kcal, p, c, f, per100: null,
        createdAt: prev ? prev.createdAt : now, src: 'yazio', time: x.time || null,
        ...(prev && prev.mealMoved ? { mealMoved: true } : {})
      });
    });
    const sig = e => [e.id, e.date, e.meal, e.kcal, e.p, e.c, e.f, e.name].join('|');
    const inRange = st.food.entries.filter(e => e.src === 'yazio' && e.date >= from && e.date <= to);
    const a = inRange.map(sig).sort().join('\n'), b = entries.map(sig).sort().join('\n');
    const others = (res.sources || []).filter(s => !YAZIO_RE.test(`${s.bundle || ''} ${s.name || ''}`) && s.count > 0).map(s => s.name);
    return {
      changed: a !== b, entries, from, to,
      count: entries.length, days: new Set(entries.map(e => e.date)).size,
      kcal: entries.reduce((n, e) => n + e.kcal, 0), others
    };
  }

  /** Vie suunnitelman tilaan: aikavälin vanhat Yazio-merkinnät pois, uudet tilalle, ateriamuistutukset kuitataan. */
  function applyImport(st, plan) {
    st.food.entries = st.food.entries.filter(e => !(e.src === 'yazio' && e.date >= plan.from && e.date <= plan.to)).concat(plan.entries);
    const seen = new Set();
    plan.entries.forEach(e => { const k = e.date + e.meal; if (!seen.has(k)) { seen.add(k); autoCompleteMeal(st, e.date, e.meal); } });
  }

  /* ---------- Raportit ---------- */
  function rangeStats(st, from, days) {
    const out = [];
    const t = today();
    for (let i = 0; i < days; i++) {
      const date = addDays(from, i);
      const tot = dayTotals(st, date);
      const tp = date >= (st.tasks.since || '') ? taskProgress(st, date) : { done: 0, total: 0 };
      out.push({ date, ...tot, logged: tot.n > 0, future: date > t, tasksDone: tp.done, tasksTotal: tp.total });
    }
    const past = out.filter(d => !d.future);
    const logged = out.filter(d => d.logged);
    const avg = k => logged.length ? logged.reduce((n, d) => n + d[k], 0) / logged.length : 0;
    const g = st.food.goals;
    return {
      days: out, past: past.length, logged: logged.length,
      avgKcal: Math.round(avg('kcal')), avgP: r1(avg('p')), avgC: r1(avg('c')), avgF: r1(avg('f')),
      kcalHits: logged.filter(d => g.kcal && Math.abs(d.kcal - g.kcal) <= g.kcal * 0.1).length,
      proteinHits: logged.filter(d => g.protein && d.p >= g.protein * 0.95).length,
      tasksDone: past.reduce((n, d) => n + d.tasksDone, 0),
      tasksTotal: past.reduce((n, d) => n + d.tasksTotal, 0)
    };
  }

  function weightTrend(st, from, to) {
    const all = M.measurementsOf(st, 'weight').slice().reverse(); // vanhin ensin
    const inRange = all.filter(m => m.date >= from && m.date <= to);
    const before = all.filter(m => m.date < from);
    const prev = before.length ? before[before.length - 1] : null;
    const first = inRange[0] || null, last = inRange[inRange.length - 1] || null;
    const base = prev || first;
    return { list: inRange, first, last, prev, change: last && base && last !== base ? r1(last.value - base.value) : (last && prev ? r1(last.value - prev.value) : null) };
  }

  function weeklyReport(st, weekStart) {
    const ws = weekStart || addDays(weekStartISO(), -7);
    const we = addDays(ws, 6);
    const s = rangeStats(st, ws, 7);
    const w = weightTrend(st, ws, we);
    const startD = parseISO(ws), endD = parseISO(we); endD.setHours(23, 59, 59);
    const workouts = M.finishedSessions(st).filter(x => { const d = new Date(x.startedAt); return d >= startD && d <= endD; });
    const planned = st.plan ? st.plan.schedule.filter(id => st.workouts.some(x => x.id === id)).length : 0;
    const g = st.food.goals;
    const tips = [];
    const daysAvail = Math.max(1, s.past);
    if (s.logged < Math.min(5, daysAvail)) tips.push(`Kirjaa ruokailut joka päivä. Tällä viikolla kirjauksia oli ${s.logged}/${daysAvail} päivänä. Suosikit ja "Toista eilinen" nopeuttavat kirjaamista.`);
    if (s.logged && g.protein && s.avgP < g.protein * 0.9) tips.push(`Proteiinia keskimäärin ${Math.round(s.avgP)} g, tavoite ${g.protein} g. Lisää proteiinilähde jokaiseen ateriaan (esim. rahka, kana, raejuusto, kananmuna).`);
    if (s.logged && g.kcal && s.avgKcal > g.kcal * 1.1) tips.push(`Kalorit ylittivät tavoitteen keskimäärin ${s.avgKcal - g.kcal} kcal päivässä. Tarkista annoskoot ja välipalat.`);
    if (s.logged && g.kcal && s.avgKcal < g.kcal * 0.85) tips.push(`Kaloreita jäi keskimäärin ${g.kcal - s.avgKcal} kcal alle tavoitteen. Syö riittävästi, jotta jaksat treenata ja palautua.`);
    if (s.tasksTotal && s.tasksDone / s.tasksTotal < 0.7) tips.push(`Tehtävistä tehtiin ${Math.round(s.tasksDone / s.tasksTotal * 100)} %. Siirrä vaikeimmat muistutukset sopivampaan aikaan tai torkuta niitä, kun et ehdi heti.`);
    if (planned && workouts.length < planned) tips.push(`Treenejä ${workouts.length}/${planned}. Varaa treenit kalenteriin etukäteen.`);
    if (!w.list.length) tips.push('Punnitse itsesi vähintään kerran viikossa, mieluiten aamulla samaan aikaan.');
    if (g.weight && w.last && w.change !== null) {
      const dir = Math.sign(g.weight - w.last.value);
      if (dir !== 0 && Math.sign(w.change) === -dir && Math.abs(w.change) >= 0.3) tips.push(`Paino muuttui ${w.change > 0 ? '+' : ''}${w.change} kg, mutta tavoite (${g.weight} kg) on toiseen suuntaan. Säädä päivän kaloreita noin ${dir > 0 ? '+200' : '−200'} kcal.`);
    }
    if (!tips.length) tips.push('Hyvä viikko! Jatka samaan malliin ja pidä rutiinit ennallaan.');
    return { weekStart: ws, weekEnd: we, ...s, weight: w, workouts: workouts.length, plannedWorkouts: planned, tips };
  }

  /* ---------- Synkronoitava tila palvelimelle ---------- */
  function serverState(st) {
    const t = today(), y = addDays(t, -1);
    const done = {};
    [y, t].forEach(d => { done[d] = Object.keys(st.tasks.done[d] || {}); });
    const tot = dayTotals(st, t);
    const tp = taskProgress(st, t);
    let tz = 'Europe/Helsinki';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch (e) { /* */ }
    return {
      tz,
      trip: st.trip || null,
      reminders: st.reminders.map(r => ({ id: r.id, time: r.time, title: r.title, body: r.body, days: r.days || [], enabled: r.enabled !== false, notify: r.notify !== false, kind: r.kind, tripBody: r.tripBody })),
      done,
      summary: { date: t, kcal: tot.kcal, protein: tot.p, goalKcal: st.food.goals.kcal, goalProtein: st.food.goals.protein, tasksDone: tp.done, tasksTotal: tp.total }
    };
  }

  GT.life = {
    MEALS, mealLabel, defaultMeal, defaultReminders, defaultLife, ensureLife,
    iso, parseISO, addDays, today, weekday, weekStartISO, hm, toMin,
    entriesOn, totals, dayTotals, scaleItem, recentFoods, searchFoods,
    activeOn, tasksOn, taskProgress, setDone, nextReminder, autoCompleteMeal, onTrip, TRIP_MEAL, planImport, applyImport,
    rangeStats, weightTrend, weeklyReport, serverState
  };
})();
