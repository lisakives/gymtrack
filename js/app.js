/* GymTrack – sovelluslogiikka: reititys, toiminnot, lepoajastin */
(function () {
  'use strict';

  const Store = GT.Store, M = GT.model, F = GT.fmt, ui = GT.ui, V = GT.views, VS = GT.viewState;
  const S = () => Store.get();
  const viewEl = document.getElementById('view');

  Store.init(M.createDefault);
  if (M.ensurePlan(S())) Store.update();
  // Elämäntapaosat (ruoka, muistutukset, tehtävät) lisätään vanhaan tallennukseen
  if (GT.life.ensureLife(S())) Store.update();
  Store.onChange(st => { GT.life.ensureLife(st); GT.push.scheduleSync(); });

  /* ================= REITITYS ================= */
  const routes = [
    [/^$|^today(?:\?.*)?$/, () => V.today(), 'today'],
    [/^food$/, () => V.food(), 'food'],
    [/^food\/(\d{4}-\d{2}-\d{2})$/, m => V.food(m[1]), 'food'],
    [/^food-report\/(week|month)$/, m => V.foodReport(m[1]), 'food'],
    [/^food-favs$/, () => V.foodFavs(), 'food'],
    [/^reminders$/, () => V.reminders(), 'reminders'],
    [/^notifications$/, () => V.notifications(), 'reminders'],
    [/^report(?:\/(.+))?$/, m => V.report(m[1]), 'today'],
    [/^home$/, () => V.home(), 'gym'],
    [/^workouts$/, () => V.workouts(), 'gym'],
    [/^workout\/(.+)$/, m => V.workout(m[1]), 'gym'],
    [/^edit\/(.+)$/, m => V.edit(m[1]), 'gym'],
    [/^session$/, () => V.session(), 'gym'],
    [/^session\/(\d+)$/, m => V.sessionEx(m[1]), 'gym'],
    [/^summary\/(.+)$/, m => V.summary(m[1]), 'gym'],
    [/^history$/, () => V.history(), 'gym'],
    [/^history\/(.+)$/, m => V.historyDetail(m[1]), 'gym'],
    [/^progress$/, () => V.progress(), 'body'],
    [/^progress\/(.+)$/, m => V.progressDetail(m[1]), 'body'],
    [/^prs$/, () => V.prs(), 'body'],
    [/^body$/, () => V.body(), 'body'],
    [/^body\/(.+)$/, m => V.bodyDetail(m[1]), 'body'],
    [/^settings$/, () => V.settings(), 'today']
  ];

  let lastRoute = null;
  // Upotetussa näkymässä (esim. Claude-artifakti) reititys pidetään muistissa.
  let memPath = GT.EMBEDDED ? 'today' : null;
  function currentPath() { return memPath !== null ? memPath : location.hash.replace(/^#\/?/, ''); }

  function render() {
    let path = currentPath();
    // Ilmoituksesta avattu: #/today?r=<muistutus>
    const deep = path.match(/^today\?(?:.*&)?r=([^&]+)/);
    if (deep) {
      path = 'today';
      if (memPath !== null) memPath = 'today'; else history.replaceState(null, '', '#/today');
      GT.openReminder(decodeURIComponent(deep[1]));
    }
    let html = null, tab = 'home';
    for (const [re, fn, t] of routes) {
      const m = path.match(re);
      if (m) { html = fn(m); tab = t; break; }
    }
    if (html === null) html = V.notFound();
    const changed = path !== lastRoute;
    if (changed || !viewEl.firstChild) {
      viewEl.innerHTML = html;
      viewEl.classList.remove('enter'); void viewEl.offsetWidth; viewEl.classList.add('enter');
      window.scrollTo(0, 0);
      GT.motion.countUp(viewEl);
    } else {
      // Sama näkymä: päivitetään paikallaan, jolloin siirtymät animoituvat eikä näkymä välähdä
      GT.motion.morph(viewEl, html);
    }
    lastRoute = path;
    document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
    document.body.classList.toggle('in-session', path.startsWith('session'));
    GT.charts.bind(viewEl);
    renderRest();
  }
  GT.render = render;
  window.addEventListener('hashchange', render);

  const go = path => {
    if (memPath !== null) { memPath = path; render(); return; }
    if (currentPath() === path) render(); else location.hash = '#/' + path;
  };
  GT.go = go;
  if (memPath !== null) {
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href^="#/"]');
      if (!a) return;
      e.preventDefault();
      go(a.getAttribute('href').slice(2));
    });
  }

  /* ================= TREENISESSIO ================= */
  function lastVariant(st, exerciseId) {
    for (const s of M.finishedSessions(st)) {
      const e = s.exercises.find(x => x.exerciseId === exerciseId && x.variant);
      if (e) return e.variant;
    }
    return null;
  }

  function startWorkout(w) {
    const st = S();
    const sess = {
      id: M.uid('s'),
      workoutId: w.id,
      workoutName: w.name,
      startedAt: new Date().toISOString(),
      endedAt: null,
      notes: '',
      prs: [],
      exercises: w.exercises.map(e => {
        let variant;
        if (e.variants && e.variants.length) {
          // vaihtoehdot vuorottelevat oletuksena treenikerrasta toiseen
          const lv = lastVariant(st, e.id);
          const i = e.variants.indexOf(lv);
          variant = i === -1 ? e.variants[0] : e.variants[(i + 1) % e.variants.length];
        }
        return {
          exerciseId: e.id, name: e.name, equipment: e.equipment,
          variants: e.variants && e.variants.length ? e.variants.slice() : undefined,
          variant,
          target: { sets: e.sets, repMin: e.repMin, repMax: e.repMax },
          sets: Array.from({ length: e.sets }, () => ({ weight: '', reps: '', done: false }))
        };
      })
    };
    Store.update(s => { s.sessions.push(sess); s.activeSessionId = sess.id; });
    go('session');
  }

  /** Laskee treenin ennätykset vertaamalla sitä aiempiin treeneihin. */
  function computeSessionPRs(st, sess) {
    const out = [];
    sess.exercises.forEach(e => {
      const key = M.exKey(e);
      const prior = M.exerciseHistory(st, key, sess.id).filter(h => h.session.startedAt < sess.startedAt);
      if (!prior.length) return;
      const base = M.computePRs(prior);
      let best = null;
      const rank = { weight: 3, e1rm: 2, reps: 1 };
      e.sets.filter(M.setLogged).forEach(s => {
        const w = M.num(s.weight) || 0, r = M.num(s.reps) || 0;
        const est = M.e1rm(w, r);
        let c = null;
        if (base.maxWeight && w > base.maxWeight.weight) c = { type: 'weight', text: `Suurin paino ${F.kg(w)} × ${r}`, v: w };
        else if (est && base.bestE1rm && est > base.bestE1rm.value) c = { type: 'e1rm', text: `Arvioitu 1RM ${F.kg(est)} (${F.num(w)} × ${r})`, v: est };
        else if (base.repsAtWeight[String(w)] && r > base.repsAtWeight[String(w)].reps) c = { type: 'reps', text: `${r} toistoa painolla ${F.kg(w)}`, v: r };
        if (c && (!best || rank[c.type] > rank[best.type] || (c.type === best.type && c.v > best.v))) best = c;
      });
      if (best) out.push({ key, label: M.exLabel(e), type: best.type, text: best.text });
    });
    return out;
  }

  async function finishSession() {
    const st = S();
    const a = M.activeSession(st);
    if (!a) return;
    // kirjatut mutta merkitsemättömät sarjat lasketaan tehdyiksi
    const pending = a.exercises.reduce((n, e) => n + e.sets.filter(s => !s.done && M.num(s.reps) > 0).length, 0);
    const logged = a.exercises.reduce((n, e) => n + e.sets.filter(s => s.done || M.num(s.reps) > 0).length, 0);
    if (!logged) {
      const ok = await ui.confirm({ title: 'Ei kirjattuja sarjoja', text: 'Treenissä ei ole yhtään kirjattua sarjaa. Hylätäänkö treeni?', ok: 'Hylkää treeni', danger: true });
      if (ok) discardSession(true);
      return;
    }
    const ok = await ui.confirm({ title: 'Lopetetaanko treeni?', text: pending ? `${pending} kirjattua sarjaa merkitään tehdyiksi.` : 'Treeni tallennetaan treenipäiväkirjaan.', ok: 'Lopeta ja tallenna' });
    if (!ok) return;
    Store.update(s => {
      const sess = s.sessions.find(x => x.id === a.id);
      sess.exercises.forEach(e => {
        e.sets.forEach(x => { if (M.num(x.reps) > 0) x.done = true; });
        e.sets = e.sets.filter(M.setLogged);
      });
      sess.exercises = sess.exercises.filter(e => e.sets.length);
      sess.endedAt = new Date().toISOString();
      sess.prs = computeSessionPRs(s, sess);
      s.activeSessionId = null;
      s.rest = null;
    });
    Store.saveNow();
    go('summary/' + a.id);
  }

  async function discardSession(skipConfirm) {
    const a = M.activeSession(S());
    if (!a) return;
    if (!skipConfirm) {
      const ok = await ui.confirm({ title: 'Hylätäänkö treeni?', text: 'Tämän treenin kirjaukset poistetaan pysyvästi.', ok: 'Hylkää', danger: true });
      if (!ok) return;
    }
    Store.update(s => { s.sessions = s.sessions.filter(x => x.id !== a.id); s.activeSessionId = null; s.rest = null; });
    go('home');
  }

  /* ================= LEPOAJASTIN ================= */
  let audioCtx = null;
  document.addEventListener('pointerdown', () => {
    if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* */ } }
    else if (audioCtx.state === 'suspended') audioCtx.resume();
  }, { passive: true });

  function beep() {
    if (!audioCtx || !S().settings.sound) return;
    const t = audioCtx.currentTime;
    [0, 0.22, 0.44].forEach((d, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = i === 2 ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.25, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.18);
      o.connect(g).connect(audioCtx.destination);
      o.start(t + d); o.stop(t + d + 0.2);
    });
  }

  function startRest(seconds) {
    seconds = seconds || S().settings.restSeconds || 90;
    Store.update(s => { s.rest = { endsAt: Date.now() + seconds * 1000, total: seconds }; });
    renderRest();
  }
  function stopRest() { Store.update(s => { s.rest = null; }); renderRest(); }

  const restEl = document.getElementById('rest');
  function renderRest() {
    const r = S().rest;
    if (!r) { restEl.hidden = true; restEl.innerHTML = ''; return; }
    const left = r.endsAt - Date.now();
    if (left <= 0) {
      stopRest();
      beep(); ui.haptic([200, 100, 200]);
      ui.toast('Lepo päättyi – seuraava sarja', '', 2400);
      return;
    }
    const pct = Math.max(0, Math.min(100, left / (r.total * 1000) * 100));
    if (restEl.hidden || !restEl.firstChild) {
      restEl.innerHTML = `<div class="rest-bar"><i></i></div>
        <div class="rest-inner">
          <button class="rest-btn" data-action="rest-adj" data-v="-15" aria-label="Vähennä 15 s">−15</button>
          <div class="rest-time"><span class="muted sm">Lepo</span><b></b></div>
          <button class="rest-btn" data-action="rest-adj" data-v="15" aria-label="Lisää 15 s">+15</button>
          <button class="rest-btn close" data-action="rest-stop" aria-label="Lopeta lepo">${ui.icon('x')}</button>
        </div>`;
      restEl.hidden = false;
    }
    restEl.querySelector('.rest-time b').textContent = F.clock(left + 999);
    restEl.querySelector('.rest-bar i').style.width = pct + '%';
  }

  setInterval(() => {
    if (S().rest) renderRest();
    document.querySelectorAll('[data-elapsed]').forEach(el => { el.textContent = F.clock(Date.now() - new Date(el.dataset.elapsed)); });
  }, 500);

  /* ================= TOIMINNOT ================= */
  const findWorkout = id => S().workouts.find(w => w.id === id);
  const activeEx = idx => { const a = M.activeSession(S()); return a ? a.exercises[+idx] : null; };

  const equipmentField = value => ({
    name: 'equipment', label: 'Väline', type: 'select', value: value || '',
    options: [{ value: '', label: 'Ei valittu' }, ...Object.entries(M.EQUIPMENT).map(([v, l]) => ({ value: v, label: l }))]
  });
  function exerciseFields(e = {}, st, currentW) {
    const fields = [
      { name: 'name', label: 'Liikkeen nimi', value: e.name || '', required: true, placeholder: 'esim. Penkkipunnerrus' },
      equipmentField(e.equipment),
      { name: 'sets', label: 'Sarjat', type: 'number', int: true, value: e.sets ?? 3, required: true, third: true },
      { name: 'repMin', label: 'Toistot min', type: 'number', int: true, value: e.repMin ?? 8, required: true, third: true },
      { name: 'repMax', label: 'Toistot max', type: 'number', int: true, value: e.repMax ?? 12, required: true, third: true },
      { name: 'variants', label: 'Vaihtoehtoiset liikkeet (valinnainen, pilkulla erotettuna)', value: (e.variants || []).join(', '), placeholder: 'esim. Ylätalja, Avustetut leuanvedot' }
    ];
    if (st && st.workouts.length > 1) fields.push({ name: 'day', label: 'Treenipäivä', type: 'select', value: currentW, options: st.workouts.map(w => ({ value: w.id, label: w.name })) });
    return fields;
  }
  function applyExercise(e, v) {
    e.name = v.name;
    if (M.EQUIPMENT[v.equipment]) e.equipment = v.equipment; else delete e.equipment;
    e.sets = Math.max(1, Math.min(20, Math.round(v.sets)));
    e.repMin = Math.max(1, Math.round(v.repMin));
    e.repMax = Math.max(e.repMin, Math.round(v.repMax));
    const vars = (v.variants || '').split(',').map(x => x.trim()).filter(Boolean);
    if (vars.length >= 2) e.variants = vars; else delete e.variants;
  }

  function measureForm(type, existing) {
    const meta = M.MEASURES[type];
    return ui.form({
      title: (existing ? 'Muokkaa: ' : 'Lisää: ') + meta.label.toLowerCase(),
      fields: [
        { name: 'date', label: 'Päivämäärä', type: 'date', value: existing ? existing.date : F.todayISO(), required: true },
        { name: 'value', label: `${meta.label} (${meta.unit})`, type: 'number', value: existing ? String(existing.value).replace('.', ',') : '', required: true, placeholder: (() => { const l = M.measurementsOf(S(), type)[0]; return l ? String(l.value).replace('.', ',') : ''; })() }
      ]
    });
  }

  async function addMeasure(type) {
    const v = await measureForm(type);
    if (!v) return;
    Store.update(s => s.measurements.push({ id: M.uid('m'), type, date: v.date, value: v.value, createdAt: new Date().toISOString() }));
    ui.toast(`${M.MEASURES[type].label} tallennettu`);
    render();
  }

  function download(text, filename) {
    if (GT.saveFile) { GT.saveFile(text, filename); return; }
    const blob = new Blob([text], { type: 'application/json' });
    const file = new File([blob], filename, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
      navigator.share({ files: [file], title: 'GymTrack-varmuuskopio' }).catch(() => { /* peruttu */ });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const actions = {
    'start-workout': async el => {
      const w = findWorkout(el.dataset.id);
      if (!w) return;
      const a = M.activeSession(S());
      if (a) {
        if (a.workoutId === w.id) return go('session');
        const r = await ui.sheet(`<h3 class="sheet-title">Treeni on jo käynnissä</h3><p class="sheet-text">${ui.esc(a.workoutName)} on kesken. Mitä tehdään?</p>
          <div class="sheet-actions"><button class="btn btn-primary btn-block" data-sheet="continue">Jatka käynnissä olevaa</button>
          <button class="btn btn-danger-ghost btn-block" data-sheet="replace">Hylkää se ja aloita ${ui.esc(w.name)}</button>
          <button class="btn btn-ghost btn-block" data-sheet="cancel">Peruuta</button></div>`);
        if (r === 'continue') return go('session');
        if (r !== 'replace') return;
        Store.update(s => { s.sessions = s.sessions.filter(x => x.id !== a.id); s.activeSessionId = null; });
      }
      startWorkout(w);
    },

    'quick-weight': () => addMeasure('weight'),

    /* --- ohjelma --- */
    'new-workout': async () => {
      const v = await ui.form({ title: 'Uusi treenipäivä', ok: 'Luo', fields: [
        { name: 'name', label: 'Nimi', required: true, placeholder: 'esim. UPPER' },
        { name: 'subtitle', label: 'Kuvaus', placeholder: 'esim. Ylävartalo' }] });
      if (!v) return;
      const w = { id: M.uid('w'), name: v.name, subtitle: v.subtitle, exercises: [] };
      Store.update(s => s.workouts.push(w));
      go('edit/' + w.id);
    },
    'add-exercise': async el => {
      const w = findWorkout(el.dataset.w);
      const v = await ui.form({ title: 'Uusi liike', ok: 'Lisää', fields: exerciseFields({}, null) });
      if (!v || v.__action) return;
      Store.update(() => { const e = { id: M.uid('ex') }; applyExercise(e, v); w.exercises.push(e); });
      render();
    },
    'edit-exercise': async el => {
      const st = S();
      const w = findWorkout(el.dataset.w);
      const e = w && w.exercises.find(x => x.id === el.dataset.e);
      if (!e) return;
      const v = await ui.form({
        title: 'Muokkaa liikettä', fields: exerciseFields(e, st, w.id),
        extra: `<button type="button" class="btn btn-danger-ghost btn-block" data-sheet="delete">${ui.icon('trash')} Poista liike ohjelmasta</button>`
      });
      if (!v) return;
      if (v.__action === 'delete') {
        const ok = await ui.confirm({ title: `Poistetaanko ${ui.esc(e.name)}?`, text: 'Liike poistetaan ohjelmasta. Aiemmat tulokset säilyvät historiassa.', ok: 'Poista', danger: true });
        if (ok) Store.update(() => { w.exercises = w.exercises.filter(x => x.id !== e.id); });
        return render();
      }
      Store.update(s => {
        applyExercise(e, v);
        if (v.day && v.day !== w.id) {
          const target = s.workouts.find(x => x.id === v.day);
          w.exercises = w.exercises.filter(x => x.id !== e.id);
          target.exercises.push(e);
          ui.toast(`Siirretty päivään ${ui.esc(target.name)}`);
        }
      });
      render();
    },
    'move-ex': el => {
      const w = findWorkout(el.dataset.w);
      const i = w.exercises.findIndex(x => x.id === el.dataset.e);
      const j = i + (+el.dataset.dir);
      if (j < 0 || j >= w.exercises.length) return;
      Store.update(() => { [w.exercises[i], w.exercises[j]] = [w.exercises[j], w.exercises[i]]; });
      render();
    },
    'delete-workout': async el => {
      const w = findWorkout(el.dataset.w);
      const ok = await ui.confirm({ title: `Poistetaanko ${ui.esc(w.name)}?`, text: 'Treenipäivä poistetaan ohjelmasta. Aiemmat treenit säilyvät historiassa.', ok: 'Poista', danger: true });
      if (!ok) return;
      Store.update(s => { s.workouts = s.workouts.filter(x => x.id !== w.id); });
      go('workouts');
    },

    /* --- viikkorytmi, tavoite ja ohjeet --- */
    'edit-day': async el => {
      const st = S(); const d = +el.dataset.d;
      const cur = st.plan.schedule[d] || '';
      const r = await ui.sheet(`<h3 class="sheet-title">${M.DAYS[d]}</h3>
        <div class="sheet-actions">
          ${st.workouts.map(w => `<button class="btn ${cur === w.id ? 'btn-primary' : 'btn-soft'} btn-block" data-sheet="${w.id}">${ui.esc(w.name)}</button>`).join('')}
          <button class="btn ${!cur ? 'btn-primary' : 'btn-soft'} btn-block" data-sheet="rest">Lepo</button>
          <button class="btn btn-ghost btn-block" data-sheet="cancel">Peruuta</button></div>`);
      if (!r || r === 'cancel') return;
      Store.update(s => { s.plan.schedule[d] = r === 'rest' ? null : r; });
      render();
    },
    'edit-goal': async () => {
      const v = await ui.form({ title: 'Tavoite', fields: [{ name: 'goal', label: 'Ohjelman tavoite', value: S().plan.goal || '' }] });
      if (!v || v.__action) return;
      Store.update(s => { s.plan.goal = v.goal; });
      render();
    },
    'edit-guidelines': async () => {
      const v = await ui.form({ title: 'Treeniohjeet', fields: [{ name: 'g', label: 'Yksi ohje per rivi', type: 'textarea', value: (S().plan.guidelines || []).join('\n') }] });
      if (!v || v.__action) return;
      Store.update(s => { s.plan.guidelines = v.g.split('\n').map(x => x.trim()).filter(Boolean); });
      render();
    },

    /* --- sessio --- */
    'finish-session': () => finishSession(),
    'discard-session': () => discardSession(),
    'set-variant': el => { const e = activeEx(el.dataset.ex); Store.update(() => { e.variant = el.dataset.v; }); render(); },
    'toggle-set': el => {
      const idx = +el.dataset.ex, i = +el.dataset.i;
      const st = S(); const a = M.activeSession(st); const e = a.exercises[idx]; const s = e.sets[i];
      if (s.done) { Store.update(() => { s.done = false; }); return render(); }
      const prev = M.previousFor(st, M.exKey(e), a.id);
      const sug = GT.suggestion(e, i, prev);
      const weight = s.weight !== '' ? s.weight : sug.w;
      const reps = s.reps !== '' ? s.reps : sug.r;
      if (!(M.num(reps) > 0)) {
        ui.toast('Syötä toistomäärä', 'error');
        const inp = viewEl.querySelector(`.set-input[data-field="reps"][data-i="${i}"]`);
        inp && inp.focus();
        return;
      }
      const before = e.sets.slice(0, i).filter(M.setLogged);
      Store.update(() => { s.weight = weight === '' ? '' : String(weight); s.reps = String(reps); s.done = true; });
      ui.haptic(15);
      const prs = M.checkSetPR(st, M.exKey(e), s, a.id, before);
      if (prs.length) ui.toast(`<b>Uusi ennätys!</b> ${ui.esc(prs[0].text)}`, 'pr', 3600);
      if (st.settings.autoRest && e.sets.some(x => !x.done)) startRest();
      else if (st.settings.autoRest && !e.sets.some(x => !x.done)) ui.toast(`${ui.esc(M.exLabel(e))} valmis`);
      render();
    },
    'add-set': el => {
      const e = activeEx(el.dataset.ex);
      Store.update(() => e.sets.push({ weight: '', reps: '', done: false }));
      render();
    },
    'remove-set': el => {
      const e = activeEx(el.dataset.ex);
      if (!e.sets.length) return;
      Store.update(() => e.sets.pop());
      render();
    },
    'session-remove-ex': async el => {
      const e = activeEx(el.dataset.ex);
      const ok = await ui.confirm({ title: `Poistetaanko ${ui.esc(M.exLabel(e))} tästä treenistä?`, text: 'Ohjelma ei muutu.', ok: 'Poista', danger: true });
      if (!ok) return;
      Store.update(s => { const a = M.activeSession(s); a.exercises.splice(+el.dataset.ex, 1); });
      go('session');
    },
    'session-add-ex': async () => {
      const st = S();
      const opts = [{ value: '', label: '— Uusi liike —' }];
      st.workouts.forEach(w => w.exercises.forEach(e => opts.push({ value: e.id, label: `${w.name}: ${e.name}` })));
      const v = await ui.form({ title: 'Lisää liike treeniin', ok: 'Lisää', fields: [
        { name: 'pick', label: 'Ohjelman liike', type: 'select', value: '', options: opts },
        { name: 'name', label: 'tai uuden liikkeen nimi', placeholder: 'esim. Facepull' },
        Object.assign(equipmentField(''), { label: 'Uuden liikkeen väline' }),
        { name: 'sets', label: 'Sarjat', type: 'number', int: true, value: 3, required: true }] });
      if (!v || v.__action) return;
      let src = null;
      st.workouts.forEach(w => w.exercises.forEach(e => { if (e.id === v.pick) src = e; }));
      if (!src && !v.name) return ui.toast('Valitse liike tai anna nimi', 'error');
      const ex = src ? {
        exerciseId: src.id, name: src.name, equipment: src.equipment, variants: src.variants ? src.variants.slice() : undefined,
        variant: src.variants ? src.variants[0] : undefined, target: { sets: src.sets, repMin: src.repMin, repMax: src.repMax }
      } : { exerciseId: 'c:' + v.name.toLowerCase(), name: v.name, equipment: M.EQUIPMENT[v.equipment] ? v.equipment : undefined };
      ex.sets = Array.from({ length: Math.max(1, Math.round(v.sets) || 3) }, () => ({ weight: '', reps: '', done: false }));
      Store.update(s => M.activeSession(s).exercises.push(ex));
      go('session/' + (M.activeSession(S()).exercises.length - 1));
    },

    /* --- lepo --- */
    'rest-menu': async () => {
      const running = S().rest;
      const def = S().settings.restSeconds;
      const r = await ui.sheet(`<h3 class="sheet-title">Lepoajastin</h3>
        <div class="rest-grid">${[45, 60, 90, 120, 150, 180, 240, 300].map(v => `<button class="btn ${v === def ? 'btn-primary' : 'btn-soft'}" data-sheet="${v}">${F.clock(v * 1000)}</button>`).join('')}</div>
        <div class="sheet-actions">${running ? '<button class="btn btn-danger-ghost btn-block" data-sheet="stop">Pysäytä ajastin</button>' : ''}
        <button class="btn btn-ghost btn-block" data-sheet="cancel">Sulje</button></div>`);
      if (r === 'stop') stopRest();
      else if (r && r !== 'cancel') startRest(+r);
    },
    'rest-adj': el => {
      Store.update(s => {
        if (!s.rest) return;
        s.rest.endsAt += (+el.dataset.v) * 1000;
        if (+el.dataset.v > 0) s.rest.total += +el.dataset.v;
      });
      renderRest();
    },
    'rest-stop': () => stopRest(),

    /* --- historia --- */
    'toggle-history-edit': el => {
      const id = el.dataset.id;
      if (VS.historyEdit === id) {
        Store.update(s => {
          const sess = s.sessions.find(x => x.id === id);
          sess.exercises.forEach(e => {
            e.sets.forEach(x => { x.done = M.num(x.reps) > 0; });
            e.sets = e.sets.filter(M.setLogged);
          });
          sess.exercises = sess.exercises.filter(e => e.sets.length);
          sess.prs = computeSessionPRs(s, sess);
        });
        VS.historyEdit = null;
        ui.toast('Muutokset tallennettu');
      } else VS.historyEdit = id;
      render();
    },
    'hist-del-set': el => {
      Store.update(s => { s.sessions.find(x => x.id === el.dataset.id).exercises[+el.dataset.ex].sets.splice(+el.dataset.i, 1); });
      render();
    },
    'hist-add-set': el => {
      Store.update(s => {
        const e = s.sessions.find(x => x.id === el.dataset.id).exercises[+el.dataset.ex];
        const last = e.sets[e.sets.length - 1];
        e.sets.push({ weight: last ? last.weight : '', reps: '', done: false });
      });
      render();
    },
    'hist-del-ex': async el => {
      const ok = await ui.confirm({ title: 'Poistetaanko liike tästä treenistä?', ok: 'Poista', danger: true });
      if (!ok) return;
      Store.update(s => { s.sessions.find(x => x.id === el.dataset.id).exercises.splice(+el.dataset.ex, 1); });
      render();
    },
    'delete-session': async el => {
      const ok = await ui.confirm({ title: 'Poistetaanko treeni?', text: 'Treeni ja sen kaikki sarjat poistetaan pysyvästi.', ok: 'Poista treeni', danger: true });
      if (!ok) return;
      Store.update(s => { s.sessions = s.sessions.filter(x => x.id !== el.dataset.id); });
      VS.historyEdit = null;
      ui.toast('Treeni poistettu');
      go('history');
    },

    /* --- kehitys --- */
    'metric': el => { VS.progressMetric = el.dataset.v; render(); },
    'period': el => { VS.period = el.dataset.v; render(); },
    'body-period': el => { VS.bodyPeriod = el.dataset.v; render(); },
    'body-group': el => { VS.bodyGroup = el.dataset.v; render(); },

    /* --- mitat --- */
    'add-measure': el => addMeasure(el.dataset.type),
    'add-measure-all': async () => {
      const types = ['weight', 'biceps', 'chest', 'waist', 'bodyfat'];
      const v = await ui.form({ title: 'Lisää mittaukset', fields: [
        { name: 'date', label: 'Päivämäärä', type: 'date', value: F.todayISO(), required: true },
        ...types.map(t => ({ name: t, label: `${M.MEASURES[t].label} (${M.MEASURES[t].unit})`, type: 'number', half: true }))],
        extra: '<p class="muted sm">Täytä vain ne mitat, jotka mittasit.</p>' });
      if (!v || v.__action) return;
      const add = types.filter(t => v[t] !== null);
      if (!add.length) return ui.toast('Yhtään arvoa ei syötetty', 'error');
      Store.update(s => add.forEach(t => s.measurements.push({ id: M.uid('m'), type: t, date: v.date, value: v[t], createdAt: new Date().toISOString() })));
      ui.toast(`${add.length} mittausta tallennettu`);
      render();
    },
    'measure-row': async el => {
      const m = S().measurements.find(x => x.id === el.dataset.id);
      if (!m) return;
      const meta = M.MEASURES[m.type];
      const r = await ui.sheet(`<h3 class="sheet-title">${F.num(m.value)} ${meta.unit}</h3><p class="sheet-text">${meta.label} · ${F.date(m.date)}</p>
        <div class="sheet-actions"><button class="btn btn-soft btn-block" data-sheet="edit">${ui.icon('edit')} Muokkaa</button>
        <button class="btn btn-danger-ghost btn-block" data-sheet="delete">${ui.icon('trash')} Poista</button>
        <button class="btn btn-ghost btn-block" data-sheet="cancel">Peruuta</button></div>`);
      if (r === 'edit') {
        const v = await measureForm(m.type, m);
        if (v && !v.__action) { Store.update(() => { m.date = v.date; m.value = v.value; }); ui.toast('Mittaus päivitetty'); }
      } else if (r === 'delete') {
        Store.update(s => { s.measurements = s.measurements.filter(x => x.id !== m.id); });
        ui.toast('Mittaus poistettu');
      }
      render();
    },

    /* --- asetukset --- */
    'set-rest-default': el => { Store.update(s => { s.settings.restSeconds = +el.dataset.v; }); render(); },
    'export': () => {
      download(Store.exportJSON(), `gymtrack-varmuuskopio-${F.todayISO()}.json`);
      Store.update(s => { s.settings.lastBackup = new Date().toISOString(); });
    },
    'reset-all': async () => {
      const ok = await ui.confirm({ title: 'Tyhjennetäänkö kaikki tiedot?', text: 'Kaikki treenit, mittaukset, ruokakirjaukset, muistutukset ja ohjelmamuutokset poistetaan tältä laitteelta. Ota ensin varmuuskopio.', ok: 'Tyhjennä kaikki', danger: true });
      if (!ok) return;
      Store.reset(M.createDefault);
      ui.toast('Tiedot tyhjennetty');
      go('home');
    }
  };

  Object.assign(actions, GT.extraActions || {});

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.action];
    if (fn) { e.preventDefault(); fn(el, e); }
  });

  /* ================= KENTTÄSIDOKSET ================= */
  const binds = {
    'wname': el => { const w = findWorkout(el.dataset.id); if (w && el.value.trim()) Store.update(() => { w.name = el.value.trim(); }); },
    'wsub': el => { const w = findWorkout(el.dataset.id); if (w) Store.update(() => { w.subtitle = el.value.trim(); }); },
    'session-notes': el => Store.update(s => { const a = M.activeSession(s); if (a) a.notes = el.value; }),
    'hist-notes': el => Store.update(s => { const x = s.sessions.find(y => y.id === el.dataset.id); if (x) x.notes = el.value; }),
    'hist-set': el => Store.update(s => {
      const set = s.sessions.find(y => y.id === el.dataset.id).exercises[+el.dataset.ex].sets[+el.dataset.i];
      set[el.dataset.field] = el.value.replace(',', '.').trim();
    }),
    'hist-date': el => {
      if (!el.value) return;
      Store.update(s => {
        const x = s.sessions.find(y => y.id === el.dataset.id);
        const st = new Date(x.startedAt), dur = new Date(x.endedAt) - st;
        const [yy, mm, dd] = el.value.split('-').map(Number);
        st.setFullYear(yy, mm - 1, dd);
        x.startedAt = st.toISOString(); x.endedAt = new Date(+st + dur).toISOString();
      });
    },
    'hist-duration': el => {
      const min = M.num(el.value);
      if (!(min > 0)) return;
      Store.update(s => { const x = s.sessions.find(y => y.id === el.dataset.id); x.endedAt = new Date(+new Date(x.startedAt) + min * 60000).toISOString(); });
    },
    'auto-rest': el => Store.update(s => { s.settings.autoRest = el.checked; }),
    'rest-sound': el => Store.update(s => { s.settings.sound = el.checked; }),
    'import-file': async el => {
      const file = el.files && el.files[0];
      if (!file) return;
      const text = await file.text();
      el.value = '';
      let parsed;
      try { parsed = JSON.parse(text); } catch (err) { return ui.toast('Tiedosto ei ole kelvollista JSONia', 'error'); }
      const data = parsed.app === 'GymTrack' ? parsed.data : parsed;
      const n = data && Array.isArray(data.sessions) ? data.sessions.filter(x => x.endedAt).length : 0;
      const ok = await ui.confirm({ title: 'Palautetaanko varmuuskopio?', text: `Varmuuskopiossa on ${n} treeniä${parsed.exportedAt ? ' (' + F.date(parsed.exportedAt) + ')' : ''}. Nykyiset tiedot korvataan.`, ok: 'Palauta' });
      if (!ok) return;
      try { Store.importJSON(text); ui.toast('Varmuuskopio palautettu'); go('home'); }
      catch (err) { ui.toast(ui.esc(err.message), 'error'); }
    }
  };

  Object.assign(binds, GT.extraBinds || {});

  document.addEventListener('input', e => {
    const el = e.target;
    if (el.classList.contains('set-input')) {
      const ex = activeEx(el.dataset.ex);
      if (!ex) return;
      Store.update(() => { ex.sets[+el.dataset.i][el.dataset.field] = el.value.replace(',', '.').trim(); });
      return;
    }
    const b = el.dataset && el.dataset.bind;
    if (b && binds[b] && el.type !== 'file' && el.type !== 'checkbox' && el.type !== 'date') binds[b](el);
  });
  document.addEventListener('change', e => {
    const el = e.target;
    const b = el.dataset && el.dataset.bind;
    if (b && binds[b] && (el.type === 'file' || el.type === 'checkbox' || el.type === 'date')) binds[b](el);
    if (b === 'wname' && !el.value.trim()) { el.value = findWorkout(el.dataset.id).name; }
  });
  // Enter painoon → siirry toistoihin
  document.addEventListener('keydown', e => {
    const el = e.target;
    if (e.key !== 'Enter' || !el.classList || !el.classList.contains('set-input')) return;
    e.preventDefault();
    if (el.dataset.field === 'weight') {
      const r = viewEl.querySelector(`.set-input[data-field="reps"][data-i="${el.dataset.i}"]`);
      r && r.focus();
    } else el.blur();
  });

  /* ================= KÄYNNISTYS ================= */
  if (memPath === null && !location.hash) location.replace('#/today');
  render();

  // Kun sovellus palaa näkyviin (esim. seuraavana päivänä), päivän tiedot päivitetään
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { GT.viewState.pushStatus = null; render(); GT.push.syncNow(); }
  });

  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol) && !GT.EMBEDDED) {
    navigator.serviceWorker.register('sw.js').then(() => GT.push.verify()).catch(err => console.warn('SW-rekisteröinti epäonnistui', err));
    // Ilmoitusta napautettu sovelluksen ollessa auki
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data && e.data.type === 'open' && e.data.hash) { location.hash = e.data.hash; }
    });
  }
})();
