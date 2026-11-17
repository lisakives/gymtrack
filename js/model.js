/* GymTrack – tietomalli, oletusohjelma ja laskennat */
(function () {
  'use strict';

  const uid = (p = 'id') => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function ex(name, sets, repMin, repMax, variants) {
    const e = { id: uid('ex'), name, sets, repMin, repMax };
    if (variants) e.variants = variants;
    return e;
  }

  const DAYS = ['Maanantai', 'Tiistai', 'Keskiviikko', 'Torstai', 'Perjantai', 'Lauantai', 'Sunnuntai'];
  const DAYS_ESS = ['maanantaina', 'tiistaina', 'keskiviikkona', 'torstaina', 'perjantaina', 'lauantaina', 'sunnuntaina'];

  function defaultPlan(workouts) {
    const byName = n => { const w = workouts.find(x => x.name.toUpperCase() === n); return w ? w.id : null; };
    return {
      goal: 'Maksimaalinen lihasmassan kasvattaminen',
      guidelines: [
        'Palautukset: noin 60–90 sekuntia.',
        'Tee työsarjat hyvällä tekniikalla ja jätä yleensä 1–3 toistoa varastoon.',
        'Kun saat kaikissa sarjoissa toistoalueen ylärajan hyvällä tekniikalla, lisää hieman painoa.',
        'Kirjaa jokaisen sarjan painot ja toistot ylös.',
        'Aloita jokainen treeni riittävällä lämmittelyllä ja tee tarvittaessa kevyitä lämmittelysarjoja ennen raskaita liikkeitä.'
      ],
      // ma–su: treenipäivän id tai null (lepo)
      schedule: [byName('PULL'), null, byName('PUSH'), null, byName('LEGS'), null, null]
    };
  }

  /** Lisää ohjelman tavoitteen, ohjeet ja viikkorytmin vanhaan tallennukseen. */
  function ensurePlan(state) {
    if (state.plan) return false;
    state.plan = defaultPlan(state.workouts);
    return true;
  }

  function todayIndex(d = new Date()) { return (d.getDay() + 6) % 7; }

  /** Viikkorytmin mukainen seuraava treeni: { workout, offset, label, restToday } */
  function nextScheduled(state) {
    const plan = state.plan;
    if (!plan || !plan.schedule) return null;
    const wOf = id => id ? state.workouts.find(w => w.id === id) : null;
    if (!plan.schedule.some(wOf)) return null;
    const t = todayIndex();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const doneToday = finishedSessions(state).filter(s => new Date(s.startedAt) >= todayStart);
    const todayW = wOf(plan.schedule[t]);
    if (todayW && !doneToday.some(s => s.workoutId === todayW.id)) return { workout: todayW, offset: 0, label: 'Tänään', restToday: false };
    for (let i = 1; i <= 7; i++) {
      const w = wOf(plan.schedule[(t + i) % 7]);
      if (w) return { workout: w, offset: i, label: i === 1 ? 'Huomenna' : DAYS_ESS[(t + i) % 7].charAt(0).toUpperCase() + DAYS_ESS[(t + i) % 7].slice(1), restToday: !todayW, doneToday: !!todayW };
    }
    return null;
  }

  function createDefault() {
    const st = createBase();
    st.plan = defaultPlan(st.workouts);
    return st;
  }

  function createBase() {
    return {
      schema: 1,
      createdAt: new Date().toISOString(),
      settings: { restSeconds: 90, autoRest: true, sound: true },
      workouts: [
        {
          id: uid('w'), name: 'PULL', subtitle: 'Selkä + hauis',
          exercises: [
            ex('Alataljasoutu', 3, 8, 12),
            ex('Ylätalja / avustetut leuanvedot', 3, 8, 12, ['Ylätalja', 'Avustetut leuanvedot']),
            ex('Hauiskääntö Z-tangolla', 3, 8, 12),
            ex('Hammer-hauiskääntö', 3, 10, 15)
          ]
        },
        {
          id: uid('w'), name: 'PUSH', subtitle: 'Rinta + olkapäät + ojentajat',
          exercises: [
            ex('Vinopenkkipunnerrus käsipainoilla', 3, 8, 12),
            ex('Pystypunnerrus suoralla tangolla', 3, 6, 10),
            ex('Ojentajapunnerrus taljassa', 3, 10, 15),
            ex('Pec Deck', 3, 10, 15),
            ex('Vipunostot sivuille', 3, 12, 20)
          ]
        },
        {
          id: uid('w'), name: 'LEGS', subtitle: 'Jalat + vatsat',
          exercises: [
            ex('Jalkaprässi', 3, 6, 10),
            ex('Reisien ojennus', 3, 10, 15),
            ex('Reisien koukistus', 3, 10, 15),
            ex('Vatsarutistus lattialla', 3, 15, 20)
          ]
        }
      ],
      sessions: [],
      activeSessionId: null,
      measurements: [],
      rest: null
    };
  }

  /* ---------- Mittaustyypit ---------- */
  const MEASURES = {
    weight: { key: 'weight', label: 'Paino', unit: 'kg', step: 0.1, lowerIsBetter: null },
    biceps: { key: 'biceps', label: 'Hauis', unit: 'cm', step: 0.1, lowerIsBetter: false },
    chest: { key: 'chest', label: 'Rinta', unit: 'cm', step: 0.1, lowerIsBetter: false },
    waist: { key: 'waist', label: 'Vyötärö', unit: 'cm', step: 0.1, lowerIsBetter: true },
    bodyfat: { key: 'bodyfat', label: 'Rasvaprosentti', unit: '%', step: 0.1, lowerIsBetter: true }
  };

  /* ---------- Apufunktiot ---------- */
  const num = v => {
    if (v === '' || v === null || v === undefined) return null;
    const n = parseFloat(String(v).replace(',', '.'));
    return isFinite(n) ? n : null;
  };

  const setLogged = s => s && s.done && num(s.reps) > 0;

  /** Avain, jolla liikkeen historia yhdistetään. Variantit seurataan erikseen. */
  const exKey = (sessEx) => sessEx.variant ? sessEx.exerciseId + '::' + sessEx.variant : sessEx.exerciseId;
  const exLabel = (sessEx) => sessEx.variant || sessEx.name;

  /** Epley-kaava; luotettava vain kohtuullisilla toistomäärillä (1–12). */
  function e1rm(weight, reps) {
    weight = num(weight); reps = num(reps);
    if (!weight || !reps || reps < 1 || reps > 12) return null;
    if (reps === 1) return weight;
    return Math.round(weight * (1 + reps / 30) * 10) / 10;
  }

  function finishedSessions(state) {
    return state.sessions.filter(s => s.endedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  function activeSession(state) {
    return state.activeSessionId ? state.sessions.find(s => s.id === state.activeSessionId) || null : null;
  }

  function sessionStats(sess) {
    let sets = 0, volume = 0, reps = 0, exercises = 0;
    sess.exercises.forEach(e => {
      const done = e.sets.filter(setLogged);
      if (done.length) exercises++;
      done.forEach(s => {
        sets++;
        reps += num(s.reps) || 0;
        volume += (num(s.weight) || 0) * (num(s.reps) || 0);
      });
    });
    const end = sess.endedAt ? new Date(sess.endedAt) : new Date();
    const durationMs = Math.max(0, end - new Date(sess.startedAt));
    return { sets, volume: Math.round(volume), reps, exercises, durationMs };
  }

  /** Kaikki aiemmat kirjaukset liikkeelle (uusin ensin). */
  function exerciseHistory(state, key, excludeSessionId) {
    const out = [];
    finishedSessions(state).forEach(sess => {
      if (sess.id === excludeSessionId) return;
      sess.exercises.forEach(e => {
        if (exKey(e) !== key) return;
        const sets = e.sets.filter(setLogged);
        if (sets.length) out.push({ session: sess, entry: e, sets });
      });
    });
    return out;
  }

  function previousFor(state, key, excludeSessionId) {
    return exerciseHistory(state, key, excludeSessionId)[0] || null;
  }

  /** Ennätykset yhdelle liikkeelle annetusta historiasta. */
  function computePRs(history) {
    let maxWeight = null, bestE1rm = null, maxVolumeSet = null;
    const repsAtWeight = {};
    // vanhimmasta uusimpaan, jotta ensimmäinen saavutus jää päivämääräksi
    history.slice().reverse().forEach(h => {
      h.sets.forEach(s => {
        const w = num(s.weight) || 0, r = num(s.reps) || 0;
        const date = h.session.startedAt;
        if (!maxWeight || w > maxWeight.weight || (w === maxWeight.weight && r > maxWeight.reps)) maxWeight = { weight: w, reps: r, date };
        const est = e1rm(w, r);
        if (est && (!bestE1rm || est > bestE1rm.value)) bestE1rm = { value: est, weight: w, reps: r, date };
        if (!maxVolumeSet || w * r > maxVolumeSet.weight * maxVolumeSet.reps) maxVolumeSet = { weight: w, reps: r, date };
        const k = String(w);
        if (!repsAtWeight[k] || r > repsAtWeight[k].reps) repsAtWeight[k] = { weight: w, reps: r, date };
      });
    });
    return { maxWeight, bestE1rm, maxVolumeSet, repsAtWeight };
  }

  /** Tarkistaa onko sarja uusi ennätys verrattuna aiempiin treeneihin. */
  function checkSetPR(state, key, set, sessionId, currentSetsBefore) {
    const hist = exerciseHistory(state, key, sessionId);
    if (!hist.length) return [];
    // Mukaan myös saman treenin aiemmat sarjat, ettei samasta ilmoiteta kahdesti
    const all = hist.concat(currentSetsBefore && currentSetsBefore.length
      ? [{ session: { startedAt: new Date().toISOString() }, sets: currentSetsBefore }] : []);
    const pr = computePRs(all);
    const w = num(set.weight) || 0, r = num(set.reps) || 0;
    const res = [];
    if (pr.maxWeight && w > pr.maxWeight.weight) res.push({ type: 'weight', text: `Suurin paino: ${fmtKg(w)} × ${r}` });
    const est = e1rm(w, r);
    if (est && pr.bestE1rm && est > pr.bestE1rm.value && !res.length) res.push({ type: 'e1rm', text: `Arvioitu 1RM: ${fmtKg(est)}` });
    const prevAt = pr.repsAtWeight[String(w)];
    if (prevAt && r > prevAt.reps && !res.length) res.push({ type: 'reps', text: `${r} toistoa painolla ${fmtKg(w)}` });
    return res;
  }

  /* ---------- Progressiivinen ylikuormitus ---------- */
  const round2 = v => Math.round(v * 100) / 100;
  /** Painonlisäys: pienemmillä painoilla pienempi askel (noin 2–5 %). */
  function weightStep(w) { return w >= 100 ? 5 : w >= 30 ? 2.5 : w >= 10 ? 1 : 0.5; }

  /**
   * Ehdotus seuraavaan kertaan liikkeen historian perusteella (uusin ensin).
   * - increase: viime kerralla kaikki tavoitesarjat toistoalueen ylärajalla → nosta painoa.
   * - stall: sama paino kolmella viime kerralla ilman toistojen kasvua → kevennä ~10 %.
   * - hold: muuten pidä paino ja lisää toistoja.
   */
  function progression(target, hist) {
    const last = hist && hist[0];
    if (!target || !last) return null;
    const sets = last.sets.filter(setLogged);
    const weightOf = s => num(s.weight) || 0;
    const top = sets.length ? Math.max(...sets.map(weightOf)) : 0;
    if (!(top > 0)) return null; // kehonpainoliikkeet: ei painoehdotusta
    const repMax = num(target.repMax), repMin = num(target.repMin);
    if (sets.length >= target.sets && sets.every(s => num(s.reps) >= repMax)) {
      const step = weightStep(top);
      return { type: 'increase', step, from: top, to: round2(top + step), reps: repMin,
        text: `Viime kerralla kaikki sarjat ylärajalla (${repMax}). Nosta painoa ${fmtKg(step)} → ${fmtKg(top + step)} ja aloita ${repMin} toistosta.` };
    }
    const recent = hist.slice(0, 3).map(h => {
      const ls = h.sets.filter(setLogged);
      return { top: Math.max(0, ...ls.map(weightOf)), reps: ls.reduce((n, s) => n + (num(s.reps) || 0), 0) };
    });
    if (recent.length === 3 && recent.every(r => r.top === top) && recent[0].reps <= recent[1].reps && recent[1].reps <= recent[2].reps) {
      const inc = top >= 30 ? 2.5 : 0.5;
      const to = round2(Math.round(top * 0.9 / inc) * inc);
      return { type: 'stall', from: top, to,
        text: `Paino ${fmtKg(top)} on pysynyt samana kolme kertaa ilman toistojen kasvua. Kokeile kevennystä (${fmtKg(to)}) ja nouse takaisin.` };
    }
    const missing = sets.reduce((n, s) => n + Math.max(0, repMax - (num(s.reps) || 0)), 0)
      + Math.max(0, target.sets - sets.length) * repMax;
    return { type: 'hold', from: top, to: top, missing,
      text: `Pidä paino ${fmtKg(top)} ja tavoittele ${repMax} toistoa kaikissa sarjoissa (vielä ${missing} toistoa).` };
  }

  /** Kaikkien liikkeiden ennätykset (Ennätykset-näkymään). */
  function allPRs(state) {
    const keys = new Map();
    finishedSessions(state).forEach(sess => sess.exercises.forEach(e => {
      const k = exKey(e);
      if (!keys.has(k) && e.sets.some(setLogged)) keys.set(k, exLabel(e));
    }));
    const out = [];
    keys.forEach((label, key) => {
      const pr = computePRs(exerciseHistory(state, key));
      if (pr.maxWeight) out.push({ key, label, ...pr });
    });
    return out.sort((a, b) => (b.maxWeight.date || '').localeCompare(a.maxWeight.date || ''));
  }

  /** Viimeisimmät ennätystapahtumat (etusivulle). */
  function recentPRs(state, limit = 3) {
    const events = [];
    finishedSessions(state).forEach(sess => (sess.prs || []).forEach(p => events.push({ ...p, date: sess.startedAt, sessionId: sess.id })));
    return events.slice(0, limit);
  }

  function nextWorkout(state) {
    if (!state.workouts.length) return null;
    const last = finishedSessions(state)[0];
    if (!last) return state.workouts[0];
    const idx = state.workouts.findIndex(w => w.id === last.workoutId);
    if (idx === -1) return state.workouts[0];
    return state.workouts[(idx + 1) % state.workouts.length];
  }

  function startOfWeek(d = new Date()) {
    const x = new Date(d); x.setHours(0, 0, 0, 0);
    const day = (x.getDay() + 6) % 7; // ma = 0
    x.setDate(x.getDate() - day);
    return x;
  }

  function measurementsOf(state, type) {
    return state.measurements.filter(m => m.type === type).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  /** Kaikki seurattavat liikkeet: ohjelman liikkeet + historiasta löytyvät. */
  function trackableExercises(state) {
    const map = new Map();
    state.workouts.forEach(w => w.exercises.forEach(e => {
      if (e.variants && e.variants.length) e.variants.forEach(v => map.set(e.id + '::' + v, { key: e.id + '::' + v, label: v, group: w.name }));
      else map.set(e.id, { key: e.id, label: e.name, group: w.name });
    }));
    finishedSessions(state).forEach(s => s.exercises.forEach(e => {
      const k = exKey(e);
      if (!map.has(k)) map.set(k, { key: k, label: exLabel(e), group: 'Arkisto' });
    }));
    return Array.from(map.values());
  }

  function labelForKey(state, key) {
    const t = trackableExercises(state).find(x => x.key === key);
    return t ? t.label : 'Liike';
  }

  /* ---------- Muotoilut ---------- */
  const fi = 'fi-FI';
  function fmtKg(v) {
    v = num(v);
    if (v === null) return '–';
    return (Math.round(v * 100) / 100).toLocaleString(fi) + ' kg';
  }
  function fmtNum(v, digits = 1) {
    v = num(v);
    if (v === null) return '–';
    return v.toLocaleString(fi, { maximumFractionDigits: digits });
  }
  function fmtDate(iso, opts) {
    const d = new Date(iso);
    return d.toLocaleDateString(fi, opts || { day: 'numeric', month: 'numeric', year: 'numeric' });
  }
  function fmtDateLong(iso) {
    const d = new Date(iso);
    const s = d.toLocaleDateString(fi, { weekday: 'long', day: 'numeric', month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function fmtDuration(ms) {
    const m = Math.round(ms / 60000);
    if (m < 60) return m + ' min';
    return Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
  }
  function fmtClock(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    const pad = n => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }
  function relDay(iso) {
    const d = new Date(iso); d.setHours(0, 0, 0, 0);
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const diff = Math.round((t - d) / 86400000);
    if (diff === 0) return 'Tänään';
    if (diff === 1) return 'Eilen';
    if (diff < 7) return diff + ' päivää sitten';
    return fmtDate(iso, { day: 'numeric', month: 'numeric' });
  }
  function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function setsSummary(sets) {
    const logged = sets.filter(setLogged);
    if (!logged.length) return '–';
    const ws = logged.map(s => num(s.weight) || 0);
    const allSame = ws.every(w => w === ws[0]);
    if (allSame) return (ws[0] ? fmtKg(ws[0]) + ' × ' : '') + logged.map(s => num(s.reps)).join(', ');
    return logged.map(s => (num(s.weight) || 0).toLocaleString(fi) + '×' + num(s.reps)).join(' · ');
  }

  window.GT = window.GT || {};
  GT.model = {
    uid, createDefault, MEASURES, DAYS, ensurePlan, defaultPlan, nextScheduled, todayIndex, num, setLogged, exKey, exLabel, e1rm,
    finishedSessions, activeSession, sessionStats, exerciseHistory, previousFor,
    computePRs, checkSetPR, progression, weightStep, allPRs, recentPRs, nextWorkout, startOfWeek,
    measurementsOf, trackableExercises, labelForKey
  };
  GT.fmt = { kg: fmtKg, num: fmtNum, date: fmtDate, dateLong: fmtDateLong, duration: fmtDuration, clock: fmtClock, relDay, todayISO, setsSummary };
})();
