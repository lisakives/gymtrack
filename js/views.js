/* GymTrack – näkymät */
(function () {
  'use strict';

  const { esc, icon } = GT.ui;
  const M = GT.model, F = GT.fmt;
  const S = () => GT.Store.get();

  const views = {};
  const ui = { historyEdit: null, progressMetric: 'weight', period: '3m', bodyPeriod: 'all', bodyGroup: 'all' };
  GT.viewState = ui;

  /* ---------- Yhteiset palat ---------- */
  function header(title, { back, sub, right = '', large = false } = {}) {
    return `<header class="top ${large ? 'top-large' : ''}">
      <div class="top-row">
        ${back ? `<a class="icon-btn" href="#/${back}" aria-label="Takaisin">${icon('back')}</a>` : ''}
        <div class="top-titles">
          ${sub ? `<div class="top-sub">${sub}</div>` : ''}
          <h1>${title}</h1>
        </div>
        <div class="top-right">${right}</div>
      </div>
    </header>`;
  }

  const periodChips = (current, action) => `<div class="chips">${[['1m', '1 kk'], ['3m', '3 kk'], ['6m', '6 kk'], ['1y', '1 v'], ['all', 'Kaikki']]
    .map(([k, l]) => `<button class="chip ${current === k ? 'on' : ''}" data-action="${action}" data-v="${k}">${l}</button>`).join('')}</div>`;

  function periodStart(p) {
    const d = new Date();
    if (p === '1m') d.setMonth(d.getMonth() - 1);
    else if (p === '3m') d.setMonth(d.getMonth() - 3);
    else if (p === '6m') d.setMonth(d.getMonth() - 6);
    else if (p === '1y') d.setFullYear(d.getFullYear() - 1);
    else return null;
    return d;
  }

  function activeBanner() {
    const a = M.activeSession(S());
    if (!a) return '';
    return `<a class="active-banner" href="#/session">
      <span class="pulse"></span>
      <span class="ab-text"><b>${esc(a.workoutName)} käynnissä</b><span data-elapsed="${a.startedAt}">${F.clock(Date.now() - new Date(a.startedAt))}</span></span>
      <span class="ab-cta">Jatka ${icon('chevron')}</span></a>`;
  }

  const gymTabs = on => `<div class="segmented mb"><a class="${on === 'home' ? 'on' : ''}" href="#/home">Treeni</a><a class="${on === 'workouts' ? 'on' : ''}" href="#/workouts">Ohjelma</a><a class="${on === 'history' ? 'on' : ''}" href="#/history">Historia</a></div>`;

  const empty = (title, text, btn = '') => `<div class="empty"><div class="empty-ic">${icon('dumbbell')}</div><h3>${title}</h3><p>${text}</p>${btn}</div>`;

  /* ================= ETUSIVU ================= */
  function ring(done, total) {
    const r = 30, c = 2 * Math.PI * r, f = total ? Math.min(1, done / total) : 0;
    return `<svg class="ring" viewBox="0 0 76 76" aria-hidden="true">
      <circle cx="38" cy="38" r="${r}" class="ring-bg"/>
      <circle cx="38" cy="38" r="${r}" class="ring-fg ${f > 0 ? '' : 'zero'}" style="--circ:${c.toFixed(1)};stroke-dasharray:${c.toFixed(1)};stroke-dashoffset:${(c * (1 - f)).toFixed(1)}" transform="rotate(-90 38 38)"/>
    </svg>`;
  }

  views.home = () => {
    const st = S();
    const fin = M.finishedSessions(st);
    const weekStart = M.startOfWeek();
    const weekSessions = fin.filter(s => new Date(s.startedAt) >= weekStart);
    const last = fin[0];
    const sched = M.nextScheduled(st);
    const next = sched ? sched.workout : M.nextWorkout(st);
    const weights = M.measurementsOf(st, 'weight');
    const cur = weights[0], prev = weights[1];
    const prs = M.recentPRs(st, 3);
    const active = M.activeSession(st);
    const today = M.todayIndex();
    const planned = st.plan ? st.plan.schedule.filter(id => st.workouts.some(w => w.id === id)).length : 3;
    const weekVolume = weekSessions.reduce((n, s) => n + M.sessionStats(s).volume, 0);
    const prCount = fin.reduce((n, s) => n + (s.prs ? s.prs.length : 0), 0);

    const eyebrow = sched ? (sched.offset === 0 ? (sched.swapped ? 'Tänään · vaihdettu' : 'Tänään') : sched.restToday ? 'Lepopäivä · seuraavaksi ' + sched.label.toLowerCase() : 'Seuraavaksi · ' + sched.label.toLowerCase()) : 'Seuraava treeni';
    const startNow = !sched || sched.offset === 0;

    const days = M.DAYS.map((d, i) => {
      const date = new Date(weekStart); date.setDate(date.getDate() + i);
      const w = sched && sched.swapped && i === today ? sched.workout : st.plan ? st.workouts.find(x => x.id === st.plan.schedule[i]) : null;
      const doneS = weekSessions.find(s => M.todayIndex(new Date(s.startedAt)) === i);
      let cls = 'off', mark = '';
      if (doneS) { cls = 'done'; mark = icon('check'); }
      else if (w) { cls = i < today ? 'missed' : 'plan'; mark = esc(w.name.charAt(0)); }
      return `<div class="wd ${cls} ${i === today ? 'today' : ''}"><span>${d.slice(0, 2)}</span><i>${mark}</i><small>${doneS ? esc(doneS.workoutName) : w ? esc(w.name) : ''}</small></div>`;
    }).join('');

    const weightCard = cur ? (() => {
      const diff = prev ? cur.value - prev.value : null;
      const series = weights.slice(0, 12).reverse().map(m => m.value);
      return `<a class="card card-link weight-card" href="#/body/weight">
        <div class="row-between"><div class="card-label">Paino</div>${icon('chevron', 'muted')}</div>
        <div class="wc-row">
          <div>
            <div class="big">${F.num(cur.value)}<small> kg</small></div>
            <div class="muted sm">${prev ? `Edellinen ${F.num(prev.value)} kg · <span class="${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${diff > 0 ? '+' : ''}${F.num(diff)} kg</span>` : 'Ensimmäinen mittaus'}</div>
          </div>
          <div class="wc-spark">${GT.charts.spark(series)}</div>
        </div></a>`;
    })() : `<div class="card"><div class="card-label">Paino</div><p class="muted sm">Lisää paino, niin näet kehityksen tässä.</p>
        <button class="btn btn-soft" data-action="quick-weight">${icon('plus')} Lisää paino</button></div>`;

    return `
      <header class="top top-home">
        <div class="top-row">
          <div class="top-titles"><div class="wordmark">GYMTRACK</div><div class="top-sub">${F.dateLong(new Date())}</div></div>
          <div class="top-right"><a class="icon-btn" href="#/settings" aria-label="Asetukset">${icon('settings')}</a></div>
        </div>
      </header>
      <main class="content">
        ${gymTabs('home')}
        ${activeBanner()}
        ${!active && next ? `<section class="hero2">
          <div class="eyebrow">${eyebrow}</div>
          <div class="hero-name">${esc(next.name)}</div>
          <div class="hero-sub">${esc(next.subtitle || '')}</div>
          <ol class="hero-list">${next.exercises.map(e => `<li><span>${esc(e.name)}</span><b>${e.sets}×${e.repMin}–${e.repMax}</b></li>`).join('')}</ol>
          <button class="btn ${startNow ? 'btn-primary' : 'btn-soft'} btn-block btn-lg" data-action="start-workout" data-id="${next.id}">${icon('play')} ${startNow ? 'Aloita treeni' : 'Aloita silti nyt'}</button>
          ${sched && sched.offset === 0 && st.workouts.length > 1 ? `<div class="swap-row">${sched.swapped && sched.planned ? `<span class="muted sm">Ohjelmassa ${esc(sched.planned.name)}</span>` : ''}<button class="swap-btn" data-action="swap-today">${sched.swapped ? 'Vaihda uudelleen' : 'Haluatko treenata jotain muuta?'}</button></div>` : ''}
        </section>` : ''}

        <section class="card week-card">
          <div class="week-top">
            <div class="ring-wrap">${ring(weekSessions.length, planned)}<div class="ring-num"><b>${weekSessions.length}</b><span>/${planned}</span></div></div>
            <div class="grow">
              <div class="card-label">Tämä viikko</div>
              <div class="week-text">${weekSessions.length >= planned && planned ? 'Viikon treenit tehty' : `${Math.max(0, planned - weekSessions.length)} treeniä jäljellä`}</div>
              <div class="muted sm">${F.num(weekVolume, 0)} kg nostettu</div>
            </div>
          </div>
          <div class="wdays">${days}</div>
        </section>

        <section class="card trio">
          <div><b>${fin.length}</b><span>Treeniä</span></div>
          <div><b>${prCount}</b><span>Ennätystä</span></div>
          <div><b>${last ? F.relDay(last.startedAt).replace(/ päivää sitten$/, ' pv') : '–'}</b><span>Viimeksi</span></div>
        </section>

        ${last ? (() => {
          const ss = M.sessionStats(last);
          return `<a class="card card-link last-card" href="#/history/${last.id}">
            <div class="row-between"><div class="card-label">Viimeisin treeni</div>${icon('chevron', 'muted')}</div>
            <div class="row-between"><div class="name-md">${esc(last.workoutName)}</div><div class="muted sm">${F.relDay(last.startedAt)}</div></div>
            <div class="kv">
              <div><span>Kesto</span><b>${F.duration(ss.durationMs)}</b></div>
              <div><span>Sarjat</span><b>${ss.sets}</b></div>
              <div><span>Volyymi</span><b>${F.num(ss.volume, 0)} kg</b></div>
            </div>
          </a>`;
        })() : ''}

        ${weightCard}

        <section class="card">
          <div class="row-between"><div class="card-label">Viimeisimmät ennätykset</div>${prs.length ? `<a class="link sm" href="#/prs">Kaikki</a>` : ''}</div>
          ${prs.length ? `<ul class="pr-list">${prs.map(p => `<li><span class="pr-ic">${icon('trophy')}</span><div><b>${esc(p.label)}</b><span class="muted sm">${esc(p.text)} · ${F.relDay(p.date)}</span></div></li>`).join('')}</ul>`
            : `<p class="muted sm">Ennätykset tunnistetaan automaattisesti, kun ylität aiemman tuloksesi.</p>`}
        </section>
      </main>`;
  };

  /* ================= TREENIT ================= */
  views.workouts = () => {
    const st = S();
    return `
      ${header('Treenit', { large: true })}
      <main class="content">
        ${gymTabs('workouts')}
        ${activeBanner()}
        ${st.plan ? `<section class="card">
          <div class="row-between"><div class="card-label">Tavoite</div><button class="link sm" data-action="edit-goal">Muokkaa</button></div>
          <div class="h3">${esc(st.plan.goal || 'Ei asetettu')}</div>
        </section>
        <section class="card">
          <div class="card-label">Viikkorytmi</div>
          <div class="week">${M.DAYS.map((d, i) => {
            const w = st.workouts.find(x => x.id === st.plan.schedule[i]);
            return `<button class="day ${w ? 'train' : ''} ${i === M.todayIndex() ? 'today' : ''}" data-action="edit-day" data-d="${i}">
              <span>${d.slice(0, 2)}</span><b>${w ? esc(w.name) : 'Lepo'}</b></button>`;
          }).join('')}</div>
          <p class="muted sm mt-sm">Napauta päivää vaihtaaksesi treenin.</p>
        </section>` : ''}
        <div class="section-title">Treenipäivät</div>
        ${st.workouts.map(w => {
          const lastS = M.finishedSessions(st).find(s => s.workoutId === w.id);
          return `<a class="card card-link workout-card" href="#/workout/${w.id}">
            <div class="row-between">
              <div><div class="name-lg">${esc(w.name)}</div><div class="muted sm">${esc(w.subtitle || '')}</div></div>
              ${icon('chevron', 'muted')}
            </div>
            <div class="ex-chips">${w.exercises.map(e => `<span>${esc(e.name)}</span>`).join('') || '<span class="muted">Ei liikkeitä</span>'}</div>
            <div class="meta">${w.exercises.length} liikettä${lastS ? ' · viimeksi ' + F.relDay(lastS.startedAt).toLowerCase() : ''}</div>
          </a>`;
        }).join('')}
        <button class="btn btn-soft btn-block" data-action="new-workout">${icon('plus')} Uusi treenipäivä</button>
        ${st.plan ? `<section class="card mt">
          <div class="row-between"><div class="card-label">Treeniohjeet</div><button class="link sm" data-action="edit-guidelines">Muokkaa</button></div>
          <ul class="guide">${(st.plan.guidelines || []).map(g => `<li>${esc(g)}</li>`).join('')}</ul>
        </section>` : ''}
      </main>`;
  };

  views.workout = (id) => {
    const st = S();
    const w = st.workouts.find(x => x.id === id);
    if (!w) return views.notFound();
    return `
      ${header(esc(w.name), { back: 'workouts', sub: esc(w.subtitle || 'Treenipäivä'), right: `<a class="btn btn-ghost btn-sm" href="#/edit/${w.id}">${icon('edit')} Muokkaa</a>` })}
      <main class="content">
        <ul class="list card">
          ${w.exercises.map((e, i) => {
            const key = e.variants && e.variants.length ? e.id + '::' + e.variants[0] : e.id;
            const prev = M.previousFor(st, key) || (e.variants ? e.variants.map(v => M.previousFor(st, e.id + '::' + v)).find(Boolean) : null);
            return `<li class="list-row">
              <span class="num-badge">${i + 1}</span>
              <div class="grow"><b>${esc(e.name)}</b>
                <div class="muted sm">${e.sets} × ${e.repMin}–${e.repMax}${prev ? ' · viimeksi ' + esc(F.setsSummary(prev.sets)) : ''}</div></div>
            </li>`;
          }).join('') || `<li class="list-row muted">Ei liikkeitä. Lisää liikkeitä muokkaustilassa.</li>`}
        </ul>
        <button class="btn btn-primary btn-block btn-lg" data-action="start-workout" data-id="${w.id}" ${w.exercises.length ? '' : 'disabled'}>${icon('play')} Aloita treeni</button>
      </main>`;
  };

  /* ---------- Ohjelman muokkaus ---------- */
  views.edit = (id) => {
    const st = S();
    const w = st.workouts.find(x => x.id === id);
    if (!w) return views.notFound();
    return `
      ${header('Muokkaa', { back: 'workout/' + w.id, sub: esc(w.name) })}
      <main class="content">
        <section class="card">
          <div class="fields">
            <label class="field"><span>Treenipäivän nimi</span><input data-bind="wname" data-id="${w.id}" value="${esc(w.name)}" autocomplete="off"></label>
            <label class="field"><span>Kuvaus</span><input data-bind="wsub" data-id="${w.id}" value="${esc(w.subtitle || '')}" placeholder="esim. Selkä + hauis" autocomplete="off"></label>
          </div>
        </section>
        <div class="section-title">Liikkeet</div>
        <ul class="list card">
          ${w.exercises.map((e, i) => `<li class="list-row edit-row">
            <div class="grow" data-action="edit-exercise" data-w="${w.id}" data-e="${e.id}">
              <b>${esc(e.name)}</b>
              <div class="muted sm">${e.sets} sarjaa · ${e.repMin}–${e.repMax} toistoa${e.variants && e.variants.length ? ' · ' + e.variants.map(esc).join(' / ') : ''}</div>
            </div>
            <div class="row-actions">
              <button class="icon-btn sm" data-action="move-ex" data-w="${w.id}" data-e="${e.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Ylös">${icon('up')}</button>
              <button class="icon-btn sm" data-action="move-ex" data-w="${w.id}" data-e="${e.id}" data-dir="1" ${i === w.exercises.length - 1 ? 'disabled' : ''} aria-label="Alas">${icon('down')}</button>
              <button class="icon-btn sm" data-action="edit-exercise" data-w="${w.id}" data-e="${e.id}" aria-label="Muokkaa">${icon('edit')}</button>
            </div>
          </li>`).join('') || `<li class="list-row muted">Ei vielä liikkeitä.</li>`}
        </ul>
        <button class="btn btn-soft btn-block" data-action="add-exercise" data-w="${w.id}">${icon('plus')} Lisää liike</button>
        <p class="muted sm center mt">Muutokset tallentuvat automaattisesti. Vanhat treenitulokset säilyvät, vaikka muutat ohjelmaa.</p>
        <button class="btn btn-danger-ghost btn-block mt-lg" data-action="delete-workout" data-w="${w.id}">${icon('trash')} Poista treenipäivä</button>
      </main>`;
  };

  /* ================= AKTIIVINEN TREENI ================= */
  views.session = () => {
    const st = S();
    const a = M.activeSession(st);
    if (!a) return `${header('Treeni', { back: 'workouts' })}<main class="content">${empty('Ei käynnissä olevaa treeniä', 'Aloita treeni Treenit-välilehdeltä.', '<a class="btn btn-primary" href="#/workouts">Treenit</a>')}</main>`;
    const total = a.exercises.reduce((n, e) => n + e.sets.length, 0);
    const done = a.exercises.reduce((n, e) => n + e.sets.filter(M.setLogged).length, 0);
    return `
      ${header(esc(a.workoutName), {
        sub: `<span data-elapsed="${a.startedAt}">${F.clock(Date.now() - new Date(a.startedAt))}</span>`,
        right: `<button class="icon-btn" data-action="rest-menu" aria-label="Lepoajastin">${icon('timer')}</button>`
      })}
      <main class="content">
        ${st.plan && st.plan.guidelines && st.plan.guidelines.length ? `<details class="card guide-card"><summary>Treeniohjeet</summary><ul class="guide">${st.plan.guidelines.map(g => `<li>${esc(g)}</li>`).join('')}</ul></details>` : ''}
        <div class="progress"><div class="progress-bar" style="width:${total ? done / total * 100 : 0}%"></div></div>
        <div class="muted sm progress-label">${done} / ${total} sarjaa tehty</div>
        <ul class="ex-list">
          ${a.exercises.map((e, i) => {
            const prev = M.previousFor(st, M.exKey(e), a.id);
            const d = e.sets.filter(M.setLogged).length;
            const complete = d >= e.sets.length && e.sets.length;
            return `<li><a class="card card-link ex-card ${complete ? 'complete' : ''}" href="#/session/${i}">
              <div class="ex-ring ${complete ? 'on' : ''}">${complete ? icon('check') : `${d}/${e.sets.length}`}</div>
              <div class="grow">
                <b>${esc(M.exLabel(e))}</b>
                <div class="muted sm">${e.target ? `${e.target.sets} × ${e.target.repMin}–${e.target.repMax}` : `${e.sets.length} sarjaa`}${prev ? ' · ed. ' + esc(F.setsSummary(prev.sets)) : ''}</div>
              </div>${icon('chevron', 'muted')}</a></li>`;
          }).join('')}
        </ul>
        <button class="btn btn-soft btn-block" data-action="session-add-ex">${icon('plus')} Lisää liike tähän treeniin</button>
        <section class="card mt">
          <div class="card-label">${icon('note', 'inline')} Muistiinpanot</div>
          <textarea class="notes" data-bind="session-notes" rows="3" placeholder="Fiilis, nukutut tunnit, kivut, säädöt…">${esc(a.notes || '')}</textarea>
        </section>
        <button class="btn btn-primary btn-block btn-lg mt" data-action="finish-session">${icon('flag')} Lopeta treeni</button>
        <button class="btn btn-danger-ghost btn-block" data-action="discard-session">Hylkää treeni</button>
      </main>`;
  };

  /** Ehdotukset sarjan kenttiin (placeholder) */
  function suggestion(e, i, prev) {
    const ps = prev ? (prev.sets[i] || prev.sets[prev.sets.length - 1]) : null;
    let w = ps ? ps.weight : '', r = ps ? ps.reps : '';
    for (let j = i - 1; j >= 0; j--) {
      const s = e.sets[j];
      if (M.num(s.weight) !== null) { w = s.weight; break; }
    }
    if (!r && !ps && e.target) r = e.target.repMax;
    return { w: M.num(w) !== null ? String(w) : '', r: M.num(r) !== null ? String(r) : '' };
  }
  GT.suggestion = suggestion;

  views.sessionEx = (idxStr) => {
    const st = S();
    const a = M.activeSession(st);
    if (!a) { setTimeout(() => GT.go('session')); return ''; }
    const idx = parseInt(idxStr, 10);
    const e = a.exercises[idx];
    if (!e) { setTimeout(() => GT.go('session')); return ''; }
    const key = M.exKey(e);
    const hist = M.exerciseHistory(st, key, a.id);
    const prev = hist[0];
    const pr = M.computePRs(hist);

    const rows = e.sets.map((s, i) => {
      const sug = suggestion(e, i, prev);
      const ps = prev && prev.sets[i];
      return `<div class="set-row ${s.done ? 'done' : ''}" data-i="${i}">
        <div class="set-no">${i + 1}</div>
        <div class="set-prev">${ps ? `${F.num(ps.weight)}×${F.num(ps.reps, 0)}` : '–'}</div>
        <input class="set-input" data-field="weight" data-ex="${idx}" data-i="${i}" inputmode="decimal" enterkeyhint="next" placeholder="${esc(sug.w.replace('.', ','))}" value="${esc(String(s.weight).replace('.', ','))}" aria-label="Paino sarja ${i + 1}" autocomplete="off">
        <input class="set-input" data-field="reps" data-ex="${idx}" data-i="${i}" inputmode="numeric" enterkeyhint="done" placeholder="${esc(sug.r)}" value="${esc(s.reps)}" aria-label="Toistot sarja ${i + 1}" autocomplete="off">
        <button class="set-check" data-action="toggle-set" data-ex="${idx}" data-i="${i}" aria-label="Merkitse sarja tehdyksi">${icon('check')}</button>
      </div>`;
    }).join('');

    return `
      ${header(esc(M.exLabel(e)), {
        back: 'session',
        sub: `Liike ${idx + 1}/${a.exercises.length} · <span data-elapsed="${a.startedAt}">${F.clock(Date.now() - new Date(a.startedAt))}</span>`,
        right: `<button class="icon-btn" data-action="rest-menu" aria-label="Lepoajastin">${icon('timer')}</button>`
      })}
      <main class="content">
        ${e.variants && e.variants.length ? `<div class="segmented">${e.variants.map(v => `<button class="${e.variant === v ? 'on' : ''}" data-action="set-variant" data-ex="${idx}" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div>` : ''}

        <section class="card prev-card">
          <div class="row-between"><div class="card-label">Edellinen kerta</div><div class="muted sm">${prev ? F.relDay(prev.session.startedAt) : ''}</div></div>
          ${prev ? `<div class="prev-sets">${prev.sets.map((s, i) => `<div><span class="muted">${i + 1}</span><b>${F.num(s.weight)} kg</b><span>× ${F.num(s.reps, 0)}</span></div>`).join('')}</div>`
            : `<p class="muted sm">Ei aiempia tuloksia. Tämä kerta on lähtötaso.</p>`}
          ${prev && e.target && prev.sets.length >= e.target.sets && prev.sets.every(s => M.num(s.reps) >= e.target.repMax)
            ? `<div class="hint">${icon('up', 'inline')} Viime kerralla kaikki sarjat ylärajalla (${e.target.repMax}). Lisää hieman painoa.</div>` : ''}
          ${pr.maxWeight ? `<div class="prev-best">${icon('trophy', 'inline')} Paras: ${F.kg(pr.maxWeight.weight)} × ${pr.maxWeight.reps}${pr.bestE1rm ? ` · arv. 1RM ${F.kg(pr.bestE1rm.value)}` : ''}</div>` : ''}
        </section>

        <section class="card sets-card">
          <div class="set-head"><div>Sarja</div><div>Ed.</div><div>kg</div><div>Toistot</div><div></div></div>
          ${rows}
          <div class="set-tools">
            <button class="btn btn-ghost btn-sm" data-action="add-set" data-ex="${idx}">${icon('plus')} Sarja</button>
            <button class="btn btn-ghost btn-sm" data-action="remove-set" data-ex="${idx}" ${e.sets.length ? '' : 'disabled'}>${icon('minus')} Poista viimeinen</button>
          </div>
          ${e.target ? `<p class="muted sm center">Tavoite ${e.target.sets} × ${e.target.repMin}–${e.target.repMax}. Tyhjä kenttä käyttää harmaata ehdotusta.</p>` : ''}
        </section>

        ${hist.length > 1 ? `<section class="card">
          <div class="row-between"><div class="card-label">Aiemmat tulokset</div><a class="link sm" href="#/progress/${encodeURIComponent(key)}">Kehitys</a></div>
          <ul class="mini-hist">${hist.slice(0, 6).map(h => `<li><span class="muted">${F.date(h.session.startedAt, { day: 'numeric', month: 'numeric' })}</span><span>${esc(F.setsSummary(h.sets))}</span></li>`).join('')}</ul>
        </section>` : ''}

        <div class="ex-nav">
          ${idx > 0 ? `<a class="btn btn-soft" href="#/session/${idx - 1}">${icon('back')} Edellinen</a>` : '<span></span>'}
          ${idx < a.exercises.length - 1 ? `<a class="btn btn-primary" href="#/session/${idx + 1}">Seuraava ${icon('chevron')}</a>`
            : `<a class="btn btn-primary" href="#/session">Valmis ${icon('check')}</a>`}
        </div>
        <button class="btn btn-danger-ghost btn-block btn-sm" data-action="session-remove-ex" data-ex="${idx}">Poista liike tästä treenistä</button>
      </main>`;
  };

  /* ---------- Yhteenveto ---------- */
  views.summary = (id) => {
    const st = S();
    const s = st.sessions.find(x => x.id === id);
    if (!s) return views.notFound();
    const ss = M.sessionStats(s);
    const prs = s.prs || [];
    return `
      <main class="content summary">
        <div class="summary-badge">${icon('check')}</div>
        <h1 class="center">Treeni valmis</h1>
        <p class="muted center">${esc(s.workoutName)} · ${F.dateLong(s.startedAt)}</p>
        <section class="stat-grid four">
          <div class="card stat"><div class="card-label">Kesto</div><div class="big sm">${F.duration(ss.durationMs)}</div></div>
          <div class="card stat"><div class="card-label">Liikkeet</div><div class="big sm">${ss.exercises}</div></div>
          <div class="card stat"><div class="card-label">Sarjat</div><div class="big sm">${ss.sets}</div></div>
          <div class="card stat"><div class="card-label">Volyymi</div><div class="big sm">${F.num(ss.volume, 0)}<small> kg</small></div></div>
        </section>
        ${prs.length ? `<section class="card pr-card">
          <div class="card-label">${icon('trophy', 'inline')} Uudet ennätykset</div>
          <ul class="pr-list">${prs.map(p => `<li><span class="pr-ic">${icon('trophy')}</span><div><b>${esc(p.label)}</b><span class="muted sm">${esc(p.text)}</span></div></li>`).join('')}</ul>
        </section>` : ''}
        <section class="card">
          <div class="card-label">Suoritetut liikkeet</div>
          <ul class="mini-hist">${s.exercises.filter(e => e.sets.some(M.setLogged)).map(e => `<li><span>${esc(M.exLabel(e))}</span><span class="muted">${esc(F.setsSummary(e.sets))}</span></li>`).join('') || '<li class="muted">Ei kirjattuja sarjoja</li>'}</ul>
        </section>
        <a class="btn btn-primary btn-block btn-lg" href="#/home">Valmis</a>
        <a class="btn btn-ghost btn-block" href="#/history/${s.id}">Näytä treenipäiväkirjassa</a>
      </main>`;
  };

  /* ================= HISTORIA ================= */
  views.history = () => {
    const st = S();
    const fin = M.finishedSessions(st);
    if (!fin.length) return `${header('Historia', { large: true })}<main class="content">${gymTabs('history')}${activeBanner()}${empty('Ei vielä treenejä', 'Valmiit treenit tallentuvat tänne automaattisesti.', '<a class="btn btn-primary" href="#/workouts">Aloita treeni</a>')}</main>`;
    const groups = {};
    fin.forEach(s => {
      const d = new Date(s.startedAt);
      const k = d.toLocaleDateString('fi-FI', { month: 'long', year: 'numeric' });
      (groups[k] = groups[k] || []).push(s);
    });
    return `
      ${header('Historia', { large: true, sub: `${fin.length} treeniä` })}
      <main class="content">
        ${gymTabs('history')}
        ${activeBanner()}
        ${Object.entries(groups).map(([month, list]) => `
          <div class="section-title">${month.charAt(0).toUpperCase() + month.slice(1)}</div>
          ${list.map(s => {
            const ss = M.sessionStats(s);
            const d = new Date(s.startedAt);
            return `<a class="card card-link hist-card" href="#/history/${s.id}">
              <div class="date-box"><b>${d.getDate()}</b><span>${d.toLocaleDateString('fi-FI', { weekday: 'short' })}</span></div>
              <div class="grow">
                <div class="row-between"><b>${esc(s.workoutName)}</b>${s.prs && s.prs.length ? `<span class="badge">${icon('trophy', 'inline')} ${s.prs.length}</span>` : ''}</div>
                <div class="muted sm">${F.duration(ss.durationMs)} · ${ss.exercises} liikettä · ${ss.sets} sarjaa · ${F.num(ss.volume, 0)} kg</div>
                ${s.notes ? `<div class="note-line">${esc(s.notes)}</div>` : ''}
              </div></a>`;
          }).join('')}`).join('')}
      </main>`;
  };

  views.historyDetail = (id) => {
    const st = S();
    const s = st.sessions.find(x => x.id === id && x.endedAt);
    if (!s) return views.notFound();
    const ss = M.sessionStats(s);
    const editing = ui.historyEdit === id;
    const d = new Date(s.startedAt);
    const dateVal = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return `
      ${header(esc(s.workoutName), {
        back: 'history', sub: F.dateLong(s.startedAt) + ' · ' + d.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' }),
        right: `<button class="btn ${editing ? 'btn-primary' : 'btn-ghost'} btn-sm" data-action="toggle-history-edit" data-id="${s.id}">${editing ? icon('check') + ' Valmis' : icon('edit') + ' Muokkaa'}</button>`
      })}
      <main class="content">
        <section class="stat-grid four">
          <div class="card stat"><div class="card-label">Kesto</div><div class="big sm">${F.duration(ss.durationMs)}</div></div>
          <div class="card stat"><div class="card-label">Liikkeet</div><div class="big sm">${ss.exercises}</div></div>
          <div class="card stat"><div class="card-label">Sarjat</div><div class="big sm">${ss.sets}</div></div>
          <div class="card stat"><div class="card-label">Volyymi</div><div class="big sm">${F.num(ss.volume, 0)}<small> kg</small></div></div>
        </section>
        ${editing ? `<section class="card"><div class="fields">
          <label class="field half"><span>Päivämäärä</span><input type="date" data-bind="hist-date" data-id="${s.id}" value="${dateVal}"></label>
          <label class="field half"><span>Kesto (min)</span><input inputmode="numeric" data-bind="hist-duration" data-id="${s.id}" value="${Math.round(ss.durationMs / 60000)}"></label>
        </div></section>` : ''}
        ${s.prs && s.prs.length ? `<section class="card pr-card"><div class="card-label">${icon('trophy', 'inline')} Ennätykset tässä treenissä</div>
          <ul class="pr-list">${s.prs.map(p => `<li><span class="pr-ic">${icon('trophy')}</span><div><b>${esc(p.label)}</b><span class="muted sm">${esc(p.text)}</span></div></li>`).join('')}</ul></section>` : ''}
        ${s.exercises.map((e, ei) => {
          const sets = editing ? e.sets : e.sets.filter(M.setLogged);
          if (!sets.length && !editing) return '';
          return `<section class="card">
            <div class="row-between"><b>${esc(M.exLabel(e))}</b>
              ${editing ? `<button class="icon-btn sm danger" data-action="hist-del-ex" data-id="${s.id}" data-ex="${ei}" aria-label="Poista liike">${icon('trash')}</button>`
                : `<a class="link sm" href="#/progress/${encodeURIComponent(M.exKey(e))}">Kehitys</a>`}</div>
            <table class="sets-table"><thead><tr><th>Sarja</th><th>Paino</th><th>Toistot</th>${editing ? '<th></th>' : '<th>Arv. 1RM</th>'}</tr></thead><tbody>
            ${editing ? e.sets.map((x, i) => `<tr>
                <td>${i + 1}</td>
                <td><input class="tbl-input" inputmode="decimal" data-bind="hist-set" data-id="${s.id}" data-ex="${ei}" data-i="${i}" data-field="weight" value="${esc(x.weight)}"></td>
                <td><input class="tbl-input" inputmode="numeric" data-bind="hist-set" data-id="${s.id}" data-ex="${ei}" data-i="${i}" data-field="reps" value="${esc(x.reps)}"></td>
                <td><button class="icon-btn sm danger" data-action="hist-del-set" data-id="${s.id}" data-ex="${ei}" data-i="${i}" aria-label="Poista sarja">${icon('x')}</button></td></tr>`).join('')
              : sets.map((x, i) => `<tr><td>${i + 1}</td><td>${F.kg(x.weight)}</td><td>${F.num(x.reps, 0)}</td><td class="muted">${M.e1rm(x.weight, x.reps) ? F.kg(M.e1rm(x.weight, x.reps)) : '–'}</td></tr>`).join('')}
            </tbody></table>
            ${editing ? `<button class="btn btn-ghost btn-sm" data-action="hist-add-set" data-id="${s.id}" data-ex="${ei}">${icon('plus')} Lisää sarja</button>` : ''}
          </section>`;
        }).join('')}
        <section class="card">
          <div class="card-label">${icon('note', 'inline')} Muistiinpanot</div>
          <textarea class="notes" data-bind="hist-notes" data-id="${s.id}" rows="3" placeholder="Lisää muistiinpano…">${esc(s.notes || '')}</textarea>
        </section>
        <button class="btn btn-danger-ghost btn-block mt" data-action="delete-session" data-id="${s.id}">${icon('trash')} Poista treeni</button>
      </main>`;
  };

  /* ================= KEHITYS ================= */
  function progressTabs(on) {
    return `<div class="segmented mb"><a class="${on === 'body' ? 'on' : ''}" href="#/body">Kehon mitat</a><a class="${on === 'ex' ? 'on' : ''}" href="#/progress">Liikkeet</a><a class="${on === 'pr' ? 'on' : ''}" href="#/prs">Ennätykset</a></div>`;
  }

  views.progress = () => {
    const st = S();
    const list = M.trackableExercises(st);
    const groups = {};
    list.forEach(x => (groups[x.group] = groups[x.group] || []).push(x));
    return `
      ${header('Kehitys', { large: true })}
      <main class="content">
        ${progressTabs('ex')}
        ${Object.entries(groups).map(([g, items]) => `
          <div class="section-title">${esc(g)}</div>
          <ul class="list card">${items.map(x => {
            const hist = M.exerciseHistory(st, x.key);
            const series = hist.slice(0, 10).reverse().map(h => Math.max(...h.sets.map(s => M.num(s.weight) || 0)));
            const lastW = series.length ? series[series.length - 1] : null;
            return `<li><a class="list-row link-row" href="#/progress/${encodeURIComponent(x.key)}">
              <div class="grow"><b>${esc(x.label)}</b><div class="muted sm">${hist.length ? `${hist.length} kertaa · viimeksi ${F.kg(lastW)}` : 'Ei vielä tuloksia'}</div></div>
              <div class="row-spark">${hist.length > 1 ? GT.charts.spark(series, { width: 72, height: 28 }) : ''}</div>
              ${icon('chevron', 'muted')}</a></li>`;
          }).join('')}</ul>`).join('')}
      </main>`;
  };

  views.progressDetail = (keyEnc) => {
    const st = S();
    const key = decodeURIComponent(keyEnc);
    const label = M.labelForKey(st, key);
    const all = M.exerciseHistory(st, key);
    const from = periodStart(ui.period);
    const hist = from ? all.filter(h => new Date(h.session.startedAt) >= from) : all;
    const pr = M.computePRs(all);
    const metric = ui.progressMetric;

    const pts = hist.map(h => {
      const sets = h.sets;
      const maxW = Math.max(...sets.map(s => M.num(s.weight) || 0));
      const top = sets.filter(s => (M.num(s.weight) || 0) === maxW);
      const topReps = Math.max(...top.map(s => M.num(s.reps) || 0));
      let y;
      if (metric === 'weight') y = maxW;
      else if (metric === 'reps') y = topReps;
      else if (metric === 'e1rm') y = Math.max(0, ...sets.map(s => M.e1rm(s.weight, s.reps) || 0));
      else y = sets.reduce((n, s) => n + (M.num(s.weight) || 0) * (M.num(s.reps) || 0), 0);
      return { t: h.session.startedAt, y, label: F.setsSummary(sets) };
    }).filter(p => p.y > 0);

    const unit = metric === 'reps' ? 'toistoa' : 'kg';
    const first = pts.length ? pts[pts.length - 1].y : null, lastV = pts.length ? pts[0].y : null;
    const change = pts.length > 1 ? lastV - first : null;
    const metrics = [['weight', 'Paino'], ['reps', 'Toistot'], ['e1rm', 'Arv. 1RM'], ['volume', 'Volyymi']];
    const repRecords = Object.values(pr.repsAtWeight).sort((a, b) => b.weight - a.weight).slice(0, 6);

    return `
      ${header(esc(label), { back: 'progress', sub: 'Kehitys' })}
      <main class="content">
        <div class="segmented">${metrics.map(([k, l]) => `<button class="${metric === k ? 'on' : ''}" data-action="metric" data-v="${k}">${l}</button>`).join('')}</div>
        <section class="card chart-card">
          <div class="row-between">
            <div><div class="big">${lastV !== null ? F.num(lastV) : '–'}<small> ${unit}</small></div>
              <div class="muted sm">${metric === 'weight' ? 'Raskain sarja' : metric === 'reps' ? 'Toistot raskaimmalla painolla' : metric === 'e1rm' ? 'Arvioitu yhden toiston maksimi' : 'Kokonaiskuorma treenissä'}</div></div>
            ${change !== null ? `<div class="delta ${change > 0 ? 'up' : change < 0 ? 'down' : ''}">${change > 0 ? '+' : ''}${F.num(change)} ${unit}</div>` : ''}
          </div>
          ${GT.charts.line(pts, { unit })}
          ${periodChips(ui.period, 'period')}
        </section>
        ${pr.maxWeight ? `<section class="stat-grid">
          <div class="card stat"><div class="card-label">Suurin paino</div><div class="big sm">${F.num(pr.maxWeight.weight)}<small> kg</small></div><div class="muted sm">× ${pr.maxWeight.reps} · ${F.date(pr.maxWeight.date)}</div></div>
          <div class="card stat"><div class="card-label">Paras arv. 1RM</div><div class="big sm">${pr.bestE1rm ? F.num(pr.bestE1rm.value) + '<small> kg</small>' : '–'}</div><div class="muted sm">${pr.bestE1rm ? `${F.num(pr.bestE1rm.weight)} × ${pr.bestE1rm.reps}` : 'Vaatii 1–12 toistoa'}</div></div>
        </section>
        <section class="card"><div class="card-label">Toistoennätykset painoittain</div>
          <div class="rep-records">${repRecords.map(r => `<div><b>${F.num(r.weight)} kg</b><span>${r.reps} toistoa</span></div>`).join('')}</div></section>` : ''}
        <section class="card">
          <div class="card-label">Aiemmat treenikerrat</div>
          ${hist.length ? `<ul class="mini-hist">${hist.map(h => `<li><a href="#/history/${h.session.id}"><span class="muted">${F.date(h.session.startedAt)}</span><span>${esc(F.setsSummary(h.sets))}</span></a></li>`).join('')}</ul>`
            : '<p class="muted sm">Ei tuloksia valitulla jaksolla.</p>'}
        </section>
      </main>`;
  };

  views.prs = () => {
    const st = S();
    const list = M.allPRs(st);
    return `
      ${header('Kehitys', { large: true })}
      <main class="content">
        ${progressTabs('pr')}
        ${list.length ? list.map(p => `<a class="card card-link pr-row" href="#/progress/${encodeURIComponent(p.key)}">
            <div class="row-between"><b>${esc(p.label)}</b>${icon('chevron', 'muted')}</div>
            <div class="pr-grid">
              <div><span class="muted sm">Suurin paino</span><b>${F.kg(p.maxWeight.weight)}</b><span class="muted sm">× ${p.maxWeight.reps} · ${F.date(p.maxWeight.date, { day: 'numeric', month: 'numeric' })}</span></div>
              <div><span class="muted sm">Arv. 1RM</span><b>${p.bestE1rm ? F.kg(p.bestE1rm.value) : '–'}</b><span class="muted sm">${p.bestE1rm ? `${F.num(p.bestE1rm.weight)} × ${p.bestE1rm.reps}` : ''}</span></div>
              <div><span class="muted sm">Paras sarja</span><b>${F.num(p.maxVolumeSet.weight)}×${p.maxVolumeSet.reps}</b><span class="muted sm">${F.num(p.maxVolumeSet.weight * p.maxVolumeSet.reps, 0)} kg</span></div>
            </div></a>`).join('')
          : empty('Ei vielä ennätyksiä', 'Ennätykset lasketaan automaattisesti kirjatuista sarjoista.')}
      </main>`;
  };

  /* ================= KEHON MITAT ================= */
  function measureSummary(st, type) {
    const list = M.measurementsOf(st, type);
    const cur = list[0], prev = list[1];
    const diff = cur && prev ? cur.value - prev.value : null;
    return { list, cur, prev, diff };
  }

  function deltaHtml(type, diff) {
    if (diff === null) return '';
    const m = M.MEASURES[type];
    let cls = '';
    if (m.lowerIsBetter === true) cls = diff < 0 ? 'good' : diff > 0 ? 'bad' : '';
    else if (m.lowerIsBetter === false) cls = diff > 0 ? 'good' : diff < 0 ? 'bad' : '';
    return `<span class="delta ${cls}">${diff > 0 ? '+' : ''}${F.num(diff)} ${m.unit}</span>`;
  }

  const FIGURE = `<svg class="figure" viewBox="0 0 120 260" aria-hidden="true">
    <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <ellipse cx="60" cy="22" rx="13" ry="15"/>
      <path d="M53 36 L52 45 M67 36 L68 45"/>
      <path d="M52 45 C40 47 30 50 27 58 C24 68 22 84 20 100 C18 116 16 128 15 140"/>
      <path d="M68 45 C80 47 90 50 93 58 C96 68 98 84 100 100 C102 116 104 128 105 140"/>
      <path d="M15 140 C13 146 14 151 18 151 C21 151 22 146 22 140"/>
      <path d="M105 140 C107 146 106 151 102 151 C99 151 98 146 98 140"/>
      <path d="M22 140 C25 122 28 108 31 96 C33 88 35 80 37 72"/>
      <path d="M98 140 C95 122 92 108 89 96 C87 88 85 80 83 72"/>
      <path d="M37 72 C38 88 40 102 41 112 C42 122 40 132 39 140"/>
      <path d="M83 72 C82 88 80 102 79 112 C78 122 80 132 81 140"/>
      <path d="M39 140 C38 165 40 190 43 214 C44 228 44 240 44 248 C44 252 40 254 36 255 L52 255 C53 246 54 232 55 214 C57 190 58 170 60 156"/>
      <path d="M81 140 C82 165 80 190 77 214 C76 228 76 240 76 248 C76 252 80 254 84 255 L68 255 C67 246 66 232 65 214 C63 190 62 170 60 156"/>
    </g>
    <g class="fig-lines" stroke-width="1.2" stroke-dasharray="2.5 2.5" fill="none">
      <path d="M38 74 Q60 80 82 74"/>
      <path d="M41 112 Q60 117 79 112"/>
      <path d="M24 80 Q30 83 35 80"/>
    </g>
  </svg>`;

  views.body = () => {
    const st = S();
    const pts = ['biceps', 'chest', 'waist'];
    const pos = { biceps: { left: '22%', top: '30%' }, chest: { left: '50%', top: '28%' }, waist: { left: '50%', top: '43%' } };
    return `
      ${header('Kehitys', { large: true, right: `<button class="icon-btn" data-action="add-measure-all" aria-label="Lisää mittaus">${icon('plus')}</button>` })}
      <main class="content">
        ${progressTabs('body')}
        <section class="card figure-card">
          <div class="figure-wrap">
            ${FIGURE}
            ${pts.map(t => `<a class="hotspot" href="#/body/${t}" style="left:${pos[t].left};top:${pos[t].top}" aria-label="${M.MEASURES[t].label}"><span></span></a>`).join('')}
          </div>
          <ul class="figure-list">
            ${pts.map(t => {
              const m = measureSummary(st, t);
              return `<li><a href="#/body/${t}">
                <span class="dot"></span>
                <div class="grow"><span class="muted sm">${M.MEASURES[t].label}</span>
                  <b>${m.cur ? F.num(m.cur.value) + ' cm' : '–'}</b>${deltaHtml(t, m.diff)}</div>
                ${icon('chevron', 'muted')}</a></li>`;
            }).join('')}
          </ul>
        </section>
        <section class="stat-grid">
          ${['weight', 'bodyfat'].map(t => {
            const m = measureSummary(st, t);
            return `<a class="card card-link stat" href="#/body/${t}">
              <div class="card-label">${M.MEASURES[t].label}</div>
              <div class="big sm">${m.cur ? F.num(m.cur.value) + `<small> ${M.MEASURES[t].unit}</small>` : '–'}</div>
              <div class="sm">${m.cur ? deltaHtml(t, m.diff) || '<span class="muted">Ensimmäinen</span>' : '<span class="muted">Lisää mittaus</span>'}</div>
              ${m.list.length > 1 ? GT.charts.spark(m.list.slice(0, 12).reverse().map(x => x.value), { width: 120, height: 30 }) : ''}
            </a>`;
          }).join('')}
        </section>
        <button class="btn btn-primary btn-block" data-action="add-measure-all">${icon('plus')} Lisää mittaukset</button>
        <p class="muted sm center mt">Napauta mittauskohtaa hahmosta nähdäksesi kyseisen alueen historian.</p>
      </main>`;
  };

  views.bodyDetail = (type) => {
    const st = S();
    const meta = M.MEASURES[type];
    if (!meta) return views.notFound();
    const m = measureSummary(st, type);
    const from = periodStart(ui.bodyPeriod);
    const shown = from ? m.list.filter(x => new Date(x.date) >= from) : m.list;
    const grouped = GT.groupMeasures ? GT.groupMeasures(shown, ui.bodyGroup) : null;
    const pts = grouped ? grouped.map(x => ({ t: x.key + 'T12:00:00', y: x.value, label: x.label })) : shown.map(x => ({ t: x.date + 'T12:00:00', y: x.value }));
    const groupTabs = `<div class="segmented">${[['all', 'Mittaukset'], ['week', 'Viikoittain'], ['month', 'Kuukausittain']].map(([k, l]) => `<button class="${(ui.bodyGroup || 'all') === k ? 'on' : ''}" data-action="body-group" data-v="${k}">${l}</button>`).join('')}</div>`;
    const firstAll = m.list[m.list.length - 1];
    return `
      ${header(meta.label, { back: 'body', sub: 'Kehon mitat', right: `<button class="icon-btn" data-action="add-measure" data-type="${type}" aria-label="Lisää">${icon('plus')}</button>` })}
      <main class="content">
        ${groupTabs}
        <section class="card chart-card">
          <div class="row-between">
            <div><div class="big">${m.cur ? F.num(m.cur.value) : '–'}<small> ${meta.unit}</small></div>
              <div class="muted sm">${m.cur ? F.date(m.cur.date) : 'Ei mittauksia'}</div></div>
            <div class="right">${deltaHtml(type, m.diff)}${firstAll && m.list.length > 2 ? `<div class="muted sm">Alusta ${m.cur.value - firstAll.value > 0 ? '+' : ''}${F.num(m.cur.value - firstAll.value)} ${meta.unit}</div>` : ''}</div>
          </div>
          ${GT.charts.line(pts, { unit: meta.unit })}
          ${periodChips(ui.bodyPeriod, 'body-period')}
        </section>
        <button class="btn btn-primary btn-block" data-action="add-measure" data-type="${type}">${icon('plus')} Lisää mittaus</button>
        ${grouped ? `<div class="section-title">${ui.bodyGroup === 'week' ? 'Viikkokeskiarvot' : 'Kuukausikeskiarvot'}</div>
        <ul class="list card">${grouped.map((x, i) => {
          const p = grouped[i + 1];
          return `<li class="list-row"><div class="grow"><b>${F.num(x.value)} ${meta.unit}</b><div class="muted sm">${esc(x.label)} · ${x.n} mittaus${x.n > 1 ? 'ta' : ''}</div></div>${deltaHtml(type, p ? Math.round((x.value - p.value) * 10) / 10 : null)}</li>`;
        }).join('') || '<li class="list-row muted">Ei mittauksia valitulla jaksolla.</li>'}</ul>` : ''}
        <div class="section-title">Historia</div>
        ${m.list.length ? `<ul class="list card">${m.list.map((x, i) => {
          const p = m.list[i + 1];
          const d = p ? x.value - p.value : null;
          return `<li class="list-row" data-action="measure-row" data-id="${x.id}">
            <div class="grow"><b>${F.num(x.value)} ${meta.unit}</b><div class="muted sm">${F.date(x.date)}</div></div>
            ${deltaHtml(type, d)}
            <span class="icon-btn sm">${icon('edit')}</span></li>`;
        }).join('')}</ul>` : `<p class="muted sm center">Lisää ensimmäinen mittaus yllä olevasta painikkeesta.</p>`}
      </main>`;
  };

  /* ================= ASETUKSET ================= */
  views.settings = () => {
    const st = S();
    const s = st.settings;
    let size = 0;
    try { size = (localStorage.getItem('gymtrack.v1') || '').length; } catch (e) { /* */ }
    return `
      ${header('Asetukset', { back: 'today' })}
      <main class="content">
        <div class="section-title">Elämäntavat</div>
        <section class="card">
          <a class="list-row link-row" href="#/notifications"><div class="grow"><b>Puhelimen ilmoitukset</b><div class="muted sm">${(GT.push.nativeOn ? GT.push.nativeOn() : st.push && st.push.subscribed) ? 'Käytössä' : 'Ei käytössä'}</div></div>${icon('chevron', 'muted')}</a>
          <a class="list-row link-row" href="#/reminders"><div class="grow"><b>Muistutukset ja tehtävät</b><div class="muted sm">${(st.reminders || []).length} muistutusta</div></div>${icon('chevron', 'muted')}</a>
          <button class="list-row link-row" data-action="food-goals"><div class="grow"><b>Ruokatavoitteet</b><div class="muted sm">${st.food ? `${st.food.goals.kcal} kcal · proteiini ${st.food.goals.protein} g` : ''}</div></div>${icon('chevron', 'muted')}</button>
        </section>
        <div class="section-title">Lepoajastin</div>
        <section class="card">
          <div class="card-label">Oletuslepo</div>
          <div class="chips">${[60, 90, 120, 150, 180, 240].map(v => `<button class="chip ${s.restSeconds === v ? 'on' : ''}" data-action="set-rest-default" data-v="${v}">${F.clock(v * 1000)}</button>`).join('')}</div>
          <label class="toggle"><span>Käynnistä automaattisesti, kun sarja merkitään tehdyksi</span><input type="checkbox" data-bind="auto-rest" ${s.autoRest ? 'checked' : ''}><i></i></label>
          <label class="toggle"><span>Äänimerkki levon päättyessä</span><input type="checkbox" data-bind="rest-sound" ${s.sound ? 'checked' : ''}><i></i></label>
        </section>
        <div class="section-title">Tili ja pilvivarmuuskopio</div>
        ${GT.accountView ? GT.accountView.section() : ''}
        <div class="section-title">Varmuuskopio tiedostona</div>
        <section class="card">
          <p class="muted sm">Tiedot tallentuvat automaattisesti tähän laitteeseen${GT.cloud && GT.cloud.loggedIn() ? ' ja salattuna pilveen' : ''}. Voit myös siirtää ne tiedostona.</p>
          <button class="btn btn-soft btn-block" data-action="export">${icon('download')} Vie tiedot (JSON)</button>
          <label class="btn btn-soft btn-block file-btn">${icon('upload')} Palauta varmuuskopiosta<input type="file" accept="application/json,.json" data-bind="import-file"></label>
          <p class="muted sm center">${st.sessions.filter(x => x.endedAt).length} treeniä · ${st.measurements.length} mittausta · ${st.food ? st.food.entries.length : 0} ruokakirjausta · ${(size / 1024).toFixed(1)} kt</p>
        </section>
        <div class="section-title">Tiedot</div>
        <section class="card">
          <button class="btn btn-danger-ghost btn-block" data-action="reset-all">${icon('trash')} Tyhjennä kaikki tiedot</button>
        </section>
        ${GT.cloudStatus ? `<p class="muted sm center mt">${esc(GT.cloudStatus)}</p>` : ''}
        <p class="muted sm center mt">GymTrack 2.0${GT.EMBEDDED ? '' : ' · toimii myös ilman verkkoyhteyttä'}</p>
      </main>`;
  };

  views.notFound = () => `${header('Ei löytynyt', { back: 'home' })}<main class="content">${empty('Sivua ei löytynyt', 'Kohde on ehkä poistettu.', '<a class="btn btn-primary" href="#/home">Etusivulle</a>')}</main>`;

  GT.views = views;
})();
