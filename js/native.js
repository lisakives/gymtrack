/* GymTrack – iPhone-sovelluksen silta (ios/-kansion Xcode-projekti)
 *
 * Kun sovellus ajetaan iPhone-sovelluksen sisällä, tämä moduuli
 *  - lähettää kotinäytön widgeteille päivän tiedot (kalorit, proteiini, tehtävät, seuraava muistutus)
 *  - ajastaa muistutukset iPhonen omina ilmoituksina (ei tarvita push-palvelinta)
 *  - tallentaa tiedoista varmuuskopion sovelluksen puolelle
 *  - ottaa vastaan widgetistä ja ilmoituksista tehdyt kuittaukset (Tehty / Torkuta)
 * Selaimessa ja kotinäytön verkkosovelluksessa moduuli ei tee mitään.
 */
(function () {
  'use strict';

  const handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.gymtrack;
  if (!handler || !window.GT_NATIVE) return;

  const L = GT.life, M = GT.model, Store = GT.Store, VS = GT.viewState;
  const S = () => Store.get();
  const { esc, icon } = GT.ui;
  GT.NATIVE = window.GT_NATIVE;
  document.documentElement.classList.add('native-ios');

  /** Viesti sovellukselle. Sovellus vastaa kutsumalla GT.native._reply(id, vastaus). */
  const pending = new Map();
  let seq = 0;
  function call(type, payload = {}) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, resolve);
      setTimeout(() => { if (pending.delete(id)) reject(new Error('Sovellus ei vastannut')); }, 10000);
      try { handler.postMessage({ type, id, ...payload }); } catch (e) { pending.delete(id); reject(e); }
    });
  }
  function reply(id, value) {
    const fn = pending.get(id);
    if (fn) { pending.delete(id); fn(value); }
  }

  /* ---------- Ilmoitukset ---------- */
  const minuteOf = (date, time) => { const at = L.parseISO(date); const m = L.toMin(time); at.setHours(Math.floor(m / 60), m % 60, 0, 0); return at; };
  const bodyFor = (st, r, date) => (L.onTrip(st, date) && r.tripBody ? r.tripBody : r.body) || '';
  const notifOff = () => !!(S().push && S().push.nativeOff);

  /** Seuraavan 7 päivän ilmoitukset (iPhone sallii enintään 64 ajastettua). */
  function upcoming(st, now = new Date()) {
    const out = [];
    const t = L.today();
    for (let i = 0; i < 7; i++) {
      const date = L.addDays(t, i);
      const done = st.tasks.done[date] || {};
      st.reminders.forEach(r => {
        if (r.notify === false || r.enabled === false || done[r.id]) return;
        if (r.days && r.days.length && !r.days.includes(L.weekday(date))) return;
        const at = minuteOf(date, r.time);
        if (at <= now) return;
        out.push({ id: `gt-${r.id}-${date}`, at: +at, title: r.title, body: bodyFor(st, r, date), rid: r.id, date });
      });
    }
    const doneT = st.tasks.done[t] || {};
    Object.entries(st.snoozed || {}).forEach(([rid, until]) => {
      const r = st.reminders.find(x => x.id === rid);
      if (r && until > +now && !doneT[rid]) out.push({ id: `gt-snooze-${rid}`, at: until, title: r.title, body: bodyFor(st, r, t) + ' (torkutettu)', rid, date: t });
    });
    out.sort((a, b) => a.at - b.at);
    return out.slice(0, 60);
  }

  /* ---------- Widgetin tiedot ---------- */
  function taskList(st, date) {
    return L.tasksOn(st, date).map(x => ({ id: x.r.id, time: x.r.time, title: x.r.title, done: x.done, kind: x.r.kind || null }));
  }

  function widgetSnapshot(st) {
    const t = L.today();
    const tot = L.dayTotals(st, t);
    const g = st.food.goals || {};
    const meals = L.MEALS.map(m => {
      const mt = L.totals(L.entriesOn(st, t).filter(e => (e.meal || 'snack') === m.key));
      return { key: m.key, label: m.label, kcal: mt.kcal, protein: mt.p, count: mt.n };
    });
    const weights = M.measurementsOf ? M.measurementsOf(st, 'weight') : [];
    const w = weights.length ? weights[0] : null;
    const sessions = M.finishedSessions(st);
    const weekStart = L.parseISO(L.weekStartISO(t));
    const last = sessions[0] || null;
    let next = null;
    try {
      const n = M.nextScheduled(st);
      if (n && n.workout) next = { name: n.workout.name, label: n.label || '' };
      else { const w2 = M.nextWorkout(st); if (w2) next = { name: w2.name, label: 'Seuraava' }; }
    } catch (e) { /* */ }
    return {
      v: 1,
      updatedAt: new Date().toISOString(),
      date: t,
      food: {
        kcal: tot.kcal, protein: tot.p, carbs: tot.c, fat: tot.f, entries: tot.n,
        goalKcal: +g.kcal || 0, goalProtein: +g.protein || 0, goalCarbs: +g.carbs || 0, goalFat: +g.fat || 0,
        meals
      },
      tasks: taskList(st, t),
      tomorrowTasks: taskList(st, L.addDays(t, 1)),
      upcoming: upcoming(st).slice(0, 16).map(n => ({ at: n.at, title: n.title, rid: n.rid, date: n.date })),
      weight: w ? { value: +w.value, date: w.date } : null,
      workoutsThisWeek: sessions.filter(s => new Date(s.startedAt) >= weekStart).length,
      lastWorkout: last ? { name: last.workoutName || 'Treeni', date: L.iso(new Date(last.startedAt)) } : null,
      nextWorkout: next,
      trip: L.onTrip(st, t),
      week: weekPlan(st, t, sessions),
      weights: weights.slice(0, 12).reverse().map(m => ({ date: m.date, value: +m.value })),
      goalWeight: +g.weight || null
    };
  }

  /** Viikon treenit ma–su: suunniteltu treeni ja tehdyt treenit. */
  function weekPlan(st, t, sessions) {
    const DAYS = ['ma', 'ti', 'ke', 'to', 'pe', 'la', 'su'];
    const ws = L.weekStartISO(t);
    const sched = (st.plan && st.plan.schedule) || [];
    return DAYS.map((label, i) => {
      const date = L.addDays(ws, i);
      const w = sched[i] ? st.workouts.find(x => x.id === sched[i]) : null;
      const done = sessions.filter(s => L.iso(new Date(s.startedAt)) === date);
      return { label, date, planned: w ? w.name : null, done: done.length > 0, doneName: done.length ? (done[0].workoutName || 'Treeni') : null };
    });
  }

  /** Käynnissä oleva treeni ja lepoajastin lukitusnäytön Live Activityyn. */
  function liveWorkout(st) {
    const a = M.activeSession(st);
    if (!a) return null;
    let done = 0, total = 0, current = null;
    (a.exercises || []).forEach(e => {
      const sets = e.sets || [];
      total += sets.length;
      const d = sets.filter(x => x.done).length;
      done += d;
      if (!current && d < sets.length) current = e.name;
    });
    const r = st.rest && st.rest.endsAt > Date.now() ? st.rest : null;
    return {
      id: a.id, name: a.workoutName || 'Treeni', startedAt: +new Date(a.startedAt),
      setsDone: done, setsTotal: total, exercise: current,
      restEndsAt: r ? r.endsAt : null, restTotal: r ? r.total : null
    };
  }

  /* ---------- Synkronointi sovellukselle ---------- */
  let timer = null, lastKey = null, lastStateAt = null;
  function scheduleSync(delay = 400) {
    clearTimeout(timer);
    timer = setTimeout(syncNow, delay);
  }
  function syncNow(force) {
    clearTimeout(timer);
    const st = S();
    if (!st) return Promise.resolve();
    const widget = widgetSnapshot(st);
    const notifications = notifOff() ? [] : upcoming(st);
    const live = liveWorkout(st);
    const key = JSON.stringify({ w: { ...widget, updatedAt: 0 }, notifications, live });
    const stateAt = st.updatedAt || null;
    if (!force && key === lastKey && stateAt === lastStateAt) return Promise.resolve();
    lastKey = key;
    const payload = { widget, notifications, live };
    if (force || stateAt !== lastStateAt) { Store.saveNow(); payload.state = JSON.stringify(S()); lastStateAt = S().updatedAt || null; }
    return call('sync', payload).catch(e => console.warn('Sovellussynkronointi epäonnistui', e));
  }

  /** Widgetistä tai ilmoituksesta tehdyt kuittaukset, jotka odottavat sovelluksessa. */
  function applyActions(list) {
    if (!Array.isArray(list) || !list.length) return 0;
    let n = 0;
    Store.update(s => {
      list.forEach(a => {
        if (!a || !a.rid || !s.reminders.some(r => r.id === a.rid)) return;
        if (a.type === 'done' && a.date) { L.setDone(s, a.rid, a.date, true); n++; }
        if (a.type === 'snooze' && a.until) { s.snoozed = s.snoozed || {}; s.snoozed[a.rid] = a.until; n++; }
      });
    });
    if (n) { GT.render && GT.render(); syncNow(true); }
    return n;
  }
  function pull() {
    return call('drain').then(r => applyActions(r && r.actions)).catch(() => 0);
  }

  /* ---------- GT.push korvataan iPhonen omilla ilmoituksilla ---------- */
  let permission = 'default';
  async function status() {
    try { const r = await call('notifStatus'); permission = (r && r.permission) || 'default'; } catch (e) { permission = 'default'; }
    document.documentElement.classList.toggle('native-notif-on', permission === 'granted' && !notifOff());
    return { native: true, ios: true, standalone: true, supported: true, permission, server: 'iPhone', subscribed: permission === 'granted' && !notifOff(), endpointHost: 'iPhone' };
  }
  Object.assign(GT.push, {
    supported: () => true,
    standalone: () => true,
    nativeOn: () => permission === 'granted' && !notifOff(),
    status,
    async enable() {
      const r = await call('notifRequest');
      if (!r || !r.granted) throw new Error('Ilmoituksia ei sallittu. Salli ne: iPhonen Asetukset → GymTrack → Ilmoitukset.');
      permission = 'granted';
      Store.update(s => { s.push.nativeOff = false; });
      await syncNow(true);
      return true;
    },
    async disable() {
      Store.update(s => { s.push.nativeOff = true; });
      await syncNow(true);
    },
    async test(delaySeconds = 0) { await call('notifTest', { delay: Math.max(1, +delaySeconds || 0) }); return { ok: true }; },
    async snooze(r, minutes) {
      const until = Date.now() + minutes * 60000;
      Store.update(s => { s.snoozed = s.snoozed || {}; s.snoozed[r.id] = until; });
      syncNow(true);
      return until;
    },
    scheduleSync: () => scheduleSync(),
    syncNow: () => syncNow(),
    verify: async () => {},
    writeSwConfig: async () => {},
    serverStatus: async () => ({})
  });

  /* ---------- Kirjautuminen sovelluksessa ----------
   * Face ID -pääsyavain ja Google-kirjautuminen on sidottu verkkosivun osoitteeseen, eikä Google salli
   * kirjautumista sovelluksen sisäisessä selaimessa. Sovelluksessa kirjaudutaan käyttäjänimellä ja salasanalla;
   * iPhone ehdottaa tallennettua salasanaa ja täyttää sen Face ID:llä. */
  if (GT.cloud) {
    GT.cloud.passkeySupported = async () => false;
    GT.cloud.googleClientId = async () => null;
    GT.cloud.googleReady = () => false;
  }

  /* ---------- Varmuuskopion tallennus jakovalikon kautta ---------- */
  GT.saveFile = (text, filename) => { call('saveFile', { text, filename }); };

  /* ---------- Ilmoitusnäkymä iPhone-sovelluksessa ---------- */
  function step(ok, title, body, warn) {
    return `<li class="step ${ok ? 'ok' : warn ? 'warn' : ''}"><span class="step-ic">${ok ? icon('check') : warn ? '!' : '•'}</span><div class="grow"><b>${title}</b>${body ? `<div class="muted sm">${body}</div>` : ''}</div></li>`;
  }
  const clock = ms => new Date(ms).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
  const dayName = ms => { const d = L.iso(new Date(ms)); const t = L.today(); return d === t ? 'tänään' : d === L.addDays(t, 1) ? 'huomenna' : new Date(ms).toLocaleDateString('fi-FI', { weekday: 'long' }); };

  GT.views.notifications = () => {
    const ps = VS.pushStatus;
    if (!ps) GT.refreshPushStatus();
    const perm = ps ? ps.permission : '…';
    const on = perm === 'granted' && !notifOff();
    const list = notifOff() ? [] : upcoming(S());
    return `
      <header class="top"><div class="top-row">
        <a class="icon-btn" href="#/reminders" aria-label="Takaisin">${icon('back')}</a>
        <div class="top-titles"><div class="top-sub">Muistutukset</div><h1>Ilmoitukset</h1></div>
        <div class="top-right"></div></div></header>
      <main class="content">
        <section class="card">
          <ol class="steps">
            ${step(true, 'iPhone-sovellus', 'Muistutukset ajastetaan suoraan puhelimeen. Erillistä ilmoituspalvelinta ei tarvita.')}
            ${step(perm === 'granted', 'Ilmoituslupa', perm === 'granted' ? 'Sallittu' : perm === 'denied' ? 'Estetty. Salli: iPhonen <b>Asetukset → GymTrack → Ilmoitukset → Salli ilmoitukset</b>.' : 'Ei vielä pyydetty', perm === 'denied')}
            ${step(on && list.length > 0, 'Ajastetut muistutukset', on ? (list.length ? `${list.length} seuraavan 7 päivän aikana. Seuraava: <b>${esc(list[0].title)}</b> ${dayName(list[0].at)} klo ${clock(list[0].at)}.` : 'Ei tulevia muistutuksia.') : notifOff() ? 'Poistettu käytöstä tässä puhelimessa.' : 'Ei vielä', false)}
          </ol>
          ${perm === 'denied'
            ? `<button class="btn btn-primary btn-block btn-lg" data-action="native-settings">${icon('settings')} Avaa iPhonen asetukset</button>`
            : on ? '' : `<button class="btn btn-primary btn-block btn-lg" data-action="push-enable">${icon('bell')} Ota ilmoitukset käyttöön</button>`}
        </section>

        ${on ? `<div class="section-title">Testaa</div>
        <section class="card">
          <button class="btn btn-soft btn-block" data-action="push-test" data-v="5">${icon('bell')} Testi-ilmoitus 5 sekunnin päästä</button>
          <button class="btn btn-soft btn-block" data-action="push-test" data-v="60">${icon('timer')} Testi minuutin päästä</button>
          <p class="muted sm">Napauta testiä ja palaa kotinäytölle. Ilmoituksessa on painikkeet <b>Tehty</b> ja <b>Torkuta 10 min</b> (paina ilmoitusta pitkään).</p>
          <button class="btn btn-danger-ghost btn-block" data-action="push-disable">Poista muistutusilmoitukset käytöstä</button>
        </section>` : ''}

        <div class="section-title">Kotinäytön widgetit</div>
        <section class="card">
          <p class="muted sm">Paina kotinäyttöä pitkään → <b>Muokkaa</b> → <b>Lisää widget</b> → etsi <b>GymTrack</b>. Valittavana ovat <b>Ravinto</b>, <b>Päivän tehtävät</b> ja <b>Päivän yhteenveto</b> sekä lukitusnäytön pienet widgetit. Widgetit päivittyvät aina, kun kirjaat jotain sovellukseen. Tehtävän voi kuitata tehdyksi suoraan isosta widgetistä.</p>
        </section>
      </main>`;
  };

  GT.native = { call, _reply: reply, syncNow, applyActions, pull, upcoming, widgetSnapshot };

  // Toiminnot, joita yleiset näkymät eivät tunne
  GT.extraActions = Object.assign(GT.extraActions || {}, { 'native-settings': () => call('openSettings') });

  // Käynnistys: haetaan odottavat kuittaukset ja lähetetään tiedot widgeteille
  const start = () => {
    status().then(() => GT.render && GT.render());
    call('ready').then(r => { if (!applyActions(r && r.actions)) syncNow(true); }).catch(() => syncNow(true));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 50));
  else setTimeout(start, 50);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { pull(); status(); syncNow(); }
    else syncNow(true);
  });
  // Päivän vaihtuessa ja ajan kuluessa (seuraava muistutus) widgetin tiedot pidetään ajan tasalla
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 60000);
})();
