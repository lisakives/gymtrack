/* GymTrack – elämäntapanäkymät: Tänään, Ruoka, Muistutukset, Ilmoitukset, Viikkoraportti */
(function () {
  'use strict';

  const { esc, icon } = GT.ui;
  const M = GT.model, F = GT.fmt, L = GT.life, C = GT.charts;
  const S = () => GT.Store.get();
  const V = GT.views, VS = GT.viewState;
  Object.assign(VS, { foodDate: null, foodReport: 'week', foodReportOffset: 0, reportWeek: null, pushStatus: null, serverStatus: null, bodyGroup: 'all' });

  const DAY2 = ['ma', 'ti', 'ke', 'to', 'pe', 'la', 'su'];
  const kcal = v => Math.round(v || 0).toLocaleString('fi-FI');
  const g = v => F.num(v, 0) + ' g';
  const time = t => t.replace(':', '.');

  function header(title, { back, sub, right = '', large = false } = {}) {
    return `<header class="top ${large ? 'top-large' : ''}"><div class="top-row">
      ${back ? `<a class="icon-btn" href="#/${back}" aria-label="Takaisin">${icon('back')}</a>` : ''}
      <div class="top-titles">${sub ? `<div class="top-sub">${sub}</div>` : ''}<h1>${title}</h1></div>
      <div class="top-right">${right}</div></div></header>`;
  }

  function relTime(at) {
    const mins = Math.round((at - Date.now()) / 60000);
    if (mins < 1) return 'nyt';
    if (mins < 60) return `${mins} min päästä`;
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h < 24) return `${h} h ${m ? m + ' min ' : ''}päästä`;
    return F.dateLong(at);
  }
  const atLabel = at => {
    const t = L.iso(at), tt = L.today();
    const hmTxt = time(L.hm(at));
    if (t === tt) return 'Tänään ' + hmTxt;
    if (t === L.addDays(tt, 1)) return 'Huomenna ' + hmTxt;
    return DAY2[L.weekday(t)] + ' ' + hmTxt;
  };
  const daysText = d => !d || !d.length || d.length === 7 ? 'Joka päivä' : d.length === 5 && [0, 1, 2, 3, 4].every(x => d.includes(x)) ? 'Arkisin' : d.slice().sort().map(x => DAY2[x]).join(', ');

  function macroBar(label, val, goal, unit = 'g') {
    const pct = goal ? Math.min(100, val / goal * 100) : 0;
    const over = goal && val > goal * 1.1;
    return `<div class="macro"><div class="macro-top"><span>${label}</span><b>${F.num(val, 0)}${goal ? `<small> / ${goal} ${unit}</small>` : ` ${unit}`}</b></div>
      <div class="macro-bar"><i class="${over ? 'over' : ''}" style="width:${pct.toFixed(0)}%"></i></div></div>`;
  }

  function pushBanner() {
    const st = S();
    if (GT.push.nativeOn ? GT.push.nativeOn() : (st.push && st.push.subscribed && (!('Notification' in window) || Notification.permission === 'granted'))) return '';
    const ps = VS.pushStatus;
    let text = 'Ota puhelimen ilmoitukset käyttöön, niin muistutukset tulevat myös sovelluksen ollessa suljettuna.';
    if (ps && ps.permission === 'denied') text = 'Ilmoitukset on estetty puhelimen asetuksista. Katso ohjeet.';
    else if (GT.push.ios && !GT.push.standalone()) text = 'Lisää sovellus Koti-valikkoon, jotta iPhone voi näyttää muistutukset.';
    return `<a class="card card-link notice" href="#/notifications">${icon('bell')}<div class="grow"><b>Ilmoitukset eivät ole päällä</b><div class="muted sm">${text}</div></div>${icon('chevron', 'muted')}</a>`;
  }


  /* ---------- Ajo keikalla ---------- */
  function tripCard() {
    const st = S();
    const t = st.trip;
    const today = L.today();
    if (t && t.to >= today) {
      const days = Math.round((L.parseISO(t.to) - L.parseISO(today)) / 86400000) + 1;
      const fmt = d => F.date(L.parseISO(d), { day: 'numeric', month: 'numeric' });
      return `<section class="card trip-card on">
        <div class="row-between"><div class="card-label">${icon('swap', 'inline')} Olen töissä</div><button class="link sm" data-action="trip-end">Lopeta</button></div>
        <div class="name-md">${fmt(t.from)}–${fmt(t.to)}</div>
        <div class="muted sm">${t.from <= today ? `Töissä nyt, ${days} pv jäljellä` : `Alkaa ${fmt(t.from)}`}. Ateriamuistutukset kertovat työpäivän ohjeen.</div>
      </section>`;
    }
    return `<section class="card trip-card">
      <div class="card-label">${icon('swap', 'inline')} Olen töissä</div>
      <div class="muted sm">Työpäivinä ateriamuistutukset muuttuvat työpäivän ohjeeksi.</div>
      <div class="chips">
        <button class="chip" data-action="trip-start" data-offset="0">Olen töissä</button>
        <button class="chip" data-action="trip-start" data-offset="1">Olen huomenna töissä</button>
      </div>
    </section>`;
  }
  GT.tripCard = tripCard;

  /* ================= TÄNÄÄN ================= */
  V.today = () => {
    const st = S();
    const t = L.today();
    const tp = L.taskProgress(st, t);
    const next = L.nextReminder(st);
    const tot = L.dayTotals(st, t);
    const goals = st.food.goals;
    const sched = M.nextScheduled(st);
    const active = M.activeSession(st);
    const wd = L.weekday(t);
    const showReport = wd === 0 || wd === 6;
    const reportWeek = wd === 6 ? L.weekStartISO(t) : L.addDays(L.weekStartISO(t), -7);
    const meals = L.MEALS.map(m => ({ ...m, list: L.entriesOn(st, t).filter(e => e.meal === m.key) }));
    const snz = st.snoozed || {};

    return `
      <header class="top top-home"><div class="top-row">
        <div class="top-titles"><div class="wordmark">TÄNÄÄN</div><div class="top-sub">${F.dateLong(new Date())}</div></div>
        <div class="top-right"><a class="icon-btn" href="#/settings" aria-label="Asetukset">${icon('settings')}</a></div>
      </div></header>
      <main class="content">
        ${pushBanner()}
        ${GT.accountView ? GT.accountView.banner() : ''}
        ${st.trip && st.trip.to >= t ? tripCard() : ''}
        ${active ? `<a class="active-banner" href="#/session"><span class="pulse"></span><span class="ab-text"><b>${esc(active.workoutName)} käynnissä</b><span data-elapsed="${active.startedAt}">${F.clock(Date.now() - new Date(active.startedAt))}</span></span><span class="ab-cta">Jatka ${icon('chevron')}</span></a>` : ''}

        <section class="card today-top">
          <div class="tt-ring">${C.ring(tp.total ? tp.done / tp.total : 0)}<div class="ring-num"><b data-count="${tp.pct}">${tp.pct}</b><span>%</span></div></div>
          <div class="grow">
            <div class="card-label">Päivän tehtävät</div>
            <div class="week-text">${tp.done}/${tp.total} tehty${tp.total && tp.done === tp.total ? ' 🎉' : ''}</div>
            ${next ? `<div class="next-rem">${icon('bell', 'inline')} <span>Seuraava: <b>${atLabel(next.at)}</b> ${esc(next.r.title)}${next.snoozed ? ' (torkku)' : ''}</span></div>
              <div class="muted sm">${relTime(+next.at)}</div>` : '<div class="muted sm">Ei tulevia muistutuksia</div>'}
          </div>
        </section>

        <section class="card">
          <ul class="task-list">${tp.list.map(x => `<li class="${x.done ? 'done' : ''}">
              <button class="task-check" data-action="task-toggle" data-id="${x.r.id}" aria-label="Merkitse tehdyksi">${icon('check')}</button>
              <button class="task-main" data-action="task-menu" data-id="${x.r.id}">
                <span class="task-time">${time(x.r.time)}</span>
                <span class="task-title">${esc(x.r.title)}${snz[x.r.id] > Date.now() && !x.done ? `<small class="snz">${icon('timer', 'inline')} ${time(L.hm(new Date(snz[x.r.id])))}</small>` : ''}</span>
              </button></li>`).join('') || '<li class="muted sm">Ei tehtäviä tälle päivälle.</li>'}
          </ul>
          <a class="link sm" href="#/reminders">Muokkaa muistutuksia</a>
        </section>

        <a class="card card-link food-sum" href="#/food">
          <div class="row-between"><div class="card-label">Ruoka tänään</div>${icon('chevron', 'muted')}</div>
          <div class="fs-row">
            <div class="fs-kcal">${C.ring(goals.kcal ? tot.kcal / goals.kcal : 0, { size: 84, stroke: 8, cls: 'kcal' })}<div class="ring-num col"><b data-count="${tot.kcal}">${kcal(tot.kcal)}</b><span>kcal</span></div></div>
            <div class="grow">
              ${macroBar('Kalorit', tot.kcal, goals.kcal, 'kcal')}
              ${macroBar('Proteiini', tot.p, goals.protein)}
              <div class="muted sm">${meals.filter(m => m.list.length).length} ateriaa kirjattu · H ${g(tot.c)} · R ${g(tot.f)}</div>
            </div>
          </div>
        </a>
        <button class="btn btn-primary btn-block btn-lg" data-action="food-add">${icon('plus')} Lisää ruoka</button>

        <section class="quick-grid">
          <button class="quick" data-action="quick-weight">${icon('body')}<span>Paino</span></button>
          <a class="quick" href="#/body">${icon('chart')}<span>Mitat</span></a>
          ${!active && sched && sched.offset === 0 ? `<button class="quick hl" data-action="start-workout" data-id="${sched.workout.id}">${icon('play')}<span>${esc(sched.workout.name)}</span></button>` : `<a class="quick" href="#/home">${icon('dumbbell')}<span>Treeni</span></a>`}
          <a class="quick" href="#/report">${icon('note')}<span>Raportti</span></a>
        </section>

        ${showReport ? (() => {
          const rep = L.weeklyReport(st, reportWeek);
          return `<a class="card card-link report-teaser" href="#/report/${reportWeek}">
            <div class="row-between"><div class="card-label">${wd === 6 ? 'Tämän viikon raportti' : 'Viime viikon raportti'}</div>${icon('chevron', 'muted')}</div>
            <div class="kv"><div><span>Kirjattu</span><b>${rep.logged}/7 pv</b></div><div><span>Ka. kcal</span><b>${rep.logged ? kcal(rep.avgKcal) : '–'}</b></div><div><span>Tehtävät</span><b>${rep.tasksTotal ? Math.round(rep.tasksDone / rep.tasksTotal * 100) + ' %' : '–'}</b></div></div>
          </a>`;
        })() : ''}

        ${sched && !active ? `<a class="card card-link" href="#/home"><div class="row-between"><div class="card-label">Treeni · ${esc(sched.label)}</div>${icon('chevron', 'muted')}</div>
          <div class="name-md">${esc(sched.workout.name)}</div><div class="muted sm">${esc(sched.workout.subtitle || '')}</div></a>` : ''}
      </main>`;
  };

  /* ================= RUOKA ================= */
  function foodTabs(on) {
    return `<div class="segmented mb"><a class="${on === 'day' ? 'on' : ''}" href="#/food">Päivä</a><a class="${on === 'week' ? 'on' : ''}" href="#/food-report/week">Viikko</a><a class="${on === 'month' ? 'on' : ''}" href="#/food-report/month">Kuukausi</a></div>`;
  }

  V.food = (dateArg) => {
    const st = S();
    const date = dateArg && /^\d{4}-\d{2}-\d{2}$/.test(dateArg) ? dateArg : L.today();
    VS.foodDate = date;
    const t = L.today();
    const tot = L.dayTotals(st, date);
    const goals = st.food.goals;
    const left = goals.kcal ? goals.kcal - tot.kcal : null;
    const dayLabel = date === t ? 'Tänään' : date === L.addDays(t, -1) ? 'Eilen' : F.dateLong(L.parseISO(date));
    const favs = st.food.favorites.slice().sort((a, b) => (b.uses || 0) - (a.uses || 0)).slice(0, 8);
    const prevDay = L.addDays(date, -1);

    return `
      ${header('Ruoka', { large: true, right: `<button class="icon-btn" data-action="food-menu" aria-label="Ruokavalikko">${icon('list')}</button>` })}
      <main class="content">
        ${foodTabs('day')}
        <div class="date-nav">
          <a class="icon-btn" href="#/food/${L.addDays(date, -1)}" aria-label="Edellinen päivä">${icon('back')}</a>
          <b>${dayLabel}</b>
          ${date < t ? `<a class="icon-btn" href="#/food/${L.addDays(date, 1)}" aria-label="Seuraava päivä">${icon('chevron')}</a>` : '<span class="icon-btn ghost"></span>'}
        </div>
        <section class="card food-total">
          <div class="ft-head">
            <div><div class="big"><span data-count="${tot.kcal}">${kcal(tot.kcal)}</span><small> kcal</small></div>
              <div class="muted sm">${left === null ? '' : left >= 0 ? `${kcal(left)} kcal jäljellä` : `${kcal(-left)} kcal yli tavoitteen`}</div></div>
            <div class="ft-ring">${C.ring(goals.kcal ? tot.kcal / goals.kcal : 0, { size: 64, stroke: 7 })}</div>
          </div>
          ${macroBar('Proteiini', tot.p, goals.protein)}
          ${macroBar('Hiilihydraatit', tot.c, goals.carbs)}
          ${macroBar('Rasva', tot.f, goals.fat)}
        </section>

        <button class="btn btn-primary btn-block btn-lg" data-action="food-add" data-date="${date}">${icon('plus')} Lisää ruoka</button>
        ${yazioBar()}
        ${favs.length ? `<div class="fav-row">${favs.map(f => `<button class="chip fav-chip" data-action="fav-add" data-id="${f.id}" data-date="${date}">${icon('plus', 'inline')} ${esc(f.name)} <small>${kcal(f.items.reduce((n, i) => n + i.kcal, 0))}</small></button>`).join('')}</div>` : ''}

        ${L.MEALS.map(m => {
          const list = L.entriesOn(st, date).filter(e => e.meal === m.key);
          const mt = L.totals(list);
          const prevList = L.entriesOn(st, prevDay).filter(e => e.meal === m.key);
          return `<section class="card meal">
            <div class="row-between meal-head">
              <div><b>${m.label}</b>${list.length ? `<span class="muted sm"> · ${kcal(mt.kcal)} kcal · P ${g(mt.p)}</span>` : ''}</div>
              <div class="row-actions">
                ${list.length ? `<button class="icon-btn sm" data-action="meal-menu" data-meal="${m.key}" data-date="${date}" aria-label="Aterian toiminnot">${icon('settings')}</button>` : ''}
                <button class="icon-btn sm" data-action="food-add" data-meal="${m.key}" data-date="${date}" aria-label="Lisää ${m.label}">${icon('plus')}</button>
              </div>
            </div>
            ${list.length ? `<ul class="food-list">${list.map(e => `<li data-action="food-entry" data-id="${e.id}">
                <div class="grow"><b>${esc(e.name)}</b><span class="muted sm">${e.src === 'yazio' ? (e.time ? 'klo ' + esc(e.time.replace(':', '.')) : 'Apple Health') : `${F.num(e.amount)} ${esc(e.unit || 'g')}`} · P ${F.num(e.p)} · H ${F.num(e.c)} · R ${F.num(e.f)}</span></div>
                <span class="fl-kcal">${kcal(e.kcal)}</span></li>`).join('')}</ul>`
              : prevList.length ? `<button class="btn btn-ghost btn-sm" data-action="meal-copy" data-meal="${m.key}" data-from="${prevDay}" data-date="${date}">${icon('swap')} Toista edellisen päivän ateria (${kcal(L.totals(prevList).kcal)} kcal)</button>` : ''}
          </section>`;
        }).join('')}
        <a class="btn btn-ghost btn-block" href="#/food-favs">${icon('trophy')} Suosikit (${st.food.favorites.length})</a>
      </main>`;
  };

  V.foodReport = (kind) => {
    const st = S();
    kind = kind === 'month' ? 'month' : 'week';
    if (VS.foodReport !== kind) { VS.foodReport = kind; VS.foodReportOffset = 0; }
    const off = VS.foodReportOffset;
    let from, days, title;
    if (kind === 'week') {
      from = L.addDays(L.weekStartISO(), off * 7); days = 7;
      title = `${F.date(L.parseISO(from), { day: 'numeric', month: 'numeric' })}–${F.date(L.parseISO(L.addDays(from, 6)), { day: 'numeric', month: 'numeric' })}`;
    } else {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + off);
      from = L.iso(d); const e = new Date(d); e.setMonth(e.getMonth() + 1); e.setDate(0); days = e.getDate();
      title = d.toLocaleDateString('fi-FI', { month: 'long', year: 'numeric' });
      title = title.charAt(0).toUpperCase() + title.slice(1);
    }
    const s = L.rangeStats(st, from, days);
    const goals = st.food.goals;
    const items = s.days.map(d => ({ label: kind === 'week' ? DAY2[L.weekday(d.date)] : String(+d.date.slice(8)), v: d.kcal, hint: `${d.date}: ${d.kcal} kcal` }));
    const pItems = s.days.map(d => ({ label: kind === 'week' ? DAY2[L.weekday(d.date)] : String(+d.date.slice(8)), v: d.p }));
    const w = L.weightTrend(st, from, L.addDays(from, days - 1));
    return `
      ${header('Ruoka', { large: true, right: `<button class="icon-btn" data-action="food-menu" aria-label="Ruokavalikko">${icon('list')}</button>` })}
      <main class="content">
        ${foodTabs(kind)}
        <div class="date-nav">
          <button class="icon-btn" data-action="report-shift" data-v="-1" aria-label="Edellinen">${icon('back')}</button>
          <b>${title}</b>
          ${off < 0 ? `<button class="icon-btn" data-action="report-shift" data-v="1" aria-label="Seuraava">${icon('chevron')}</button>` : '<span class="icon-btn ghost"></span>'}
        </div>
        <section class="stat-grid">
          <div class="card stat"><div class="card-label">Ka. kalorit</div><div class="big sm">${s.logged ? kcal(s.avgKcal) : '–'}<small> kcal</small></div><div class="muted sm">Tavoite ${kcal(goals.kcal)}</div></div>
          <div class="card stat"><div class="card-label">Ka. proteiini</div><div class="big sm">${s.logged ? F.num(s.avgP, 0) : '–'}<small> g</small></div><div class="muted sm">Tavoite ${goals.protein} g</div></div>
          <div class="card stat"><div class="card-label">Kirjatut päivät</div><div class="big sm">${s.logged}<small> / ${s.past || days}</small></div><div class="muted sm">${s.past ? Math.round(s.logged / s.past * 100) : 0} % toteutuma</div></div>
          <div class="card stat"><div class="card-label">Kalorit tavoitteessa</div><div class="big sm">${s.kcalHits}<small> pv</small></div><div class="muted sm">±10 % · proteiini ${s.proteinHits} pv</div></div>
        </section>
        <section class="card"><div class="card-label">Kalorit päivittäin</div>${C.bars(items, { goal: goals.kcal })}</section>
        <section class="card"><div class="card-label">Proteiini päivittäin (g)</div>${C.bars(pItems, { goal: goals.protein })}</section>
        <section class="card"><div class="card-label">Makrot keskimäärin</div>
          ${macroBar('Proteiini', s.avgP, goals.protein)}${macroBar('Hiilihydraatit', s.avgC, goals.carbs)}${macroBar('Rasva', s.avgF, goals.fat)}
          ${w.last ? `<div class="muted sm mt-sm">Paino jakson lopussa ${F.num(w.last.value)} kg${w.change !== null ? ` (${w.change > 0 ? '+' : ''}${F.num(w.change)} kg)` : ''}</div>` : ''}
        </section>
        ${kind === 'week' ? `<a class="btn btn-soft btn-block" href="#/report/${from}">${icon('note')} Koko viikkoraportti</a>` : ''}
      </main>`;
  };

  V.foodFavs = () => {
    const st = S();
    return `
      ${header('Suosikit', { back: 'food', sub: 'Ruoka' })}
      <main class="content">
        ${st.food.favorites.length ? `<ul class="list card">${st.food.favorites.map(f => {
          const t = L.totals(f.items);
          return `<li class="list-row"><div class="grow"><b>${esc(f.name)}</b><div class="muted sm">${f.items.length > 1 ? f.items.length + ' ruokaa · ' : ''}${kcal(t.kcal)} kcal · P ${g(t.p)}${f.uses ? ' · käytetty ' + f.uses + ' krt' : ''}</div></div>
            <div class="row-actions"><button class="icon-btn sm" data-action="fav-add" data-id="${f.id}" aria-label="Lisää tänään">${icon('plus')}</button>
            <button class="icon-btn sm danger" data-action="fav-delete" data-id="${f.id}" aria-label="Poista suosikki">${icon('trash')}</button></div></li>`;
        }).join('')}</ul>` : `<div class="empty"><div class="empty-ic">${icon('trophy')}</div><h3>Ei vielä suosikkeja</h3><p>Tallenna ruoka tai koko ateria suosikiksi napauttamalla sitä ruokapäiväkirjassa. Suosikin saa lisättyä yhdellä napautuksella.</p></div>`}
      </main>`;
  };

  /* ================= YAZIO (APPLE HEALTH) ================= */
  const clockOf = iso => new Date(iso).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
  const whenOf = iso => {
    if (!iso) return '';
    const d = L.iso(new Date(iso));
    return (d === L.today() ? 'tänään' : d === L.addDays(L.today(), -1) ? 'eilen' : F.date(iso)) + ' klo ' + clockOf(iso);
  };
  /** Laitekohtainen tieto viimeisimmästä hausta (ei synkronoida pilveen, ettei jokainen haku luo muutosta). */
  L.yazioLast = () => { try { return JSON.parse(localStorage.getItem('gymtrack.yazio.last') || 'null'); } catch (e) { return null; } };

  function yazioBar() {
    const st = S();
    if (!GT.NATIVE || !(st.food.yazio && st.food.yazio.on)) return '';
    const last = L.yazioLast();
    const busy = VS.yazioBusy;
    return `<div class="yazio-bar"><a class="grow muted sm" href="#/food-yazio">${icon('swap', 'inline')} Yazio · ${busy ? 'haetaan…' : last && last.at ? 'haettu ' + whenOf(last.at) : 'ei vielä haettu'}</a>
      <button class="btn btn-ghost btn-sm" data-action="yazio-sync" ${busy ? 'disabled' : ''}>Päivitä</button></div>`;
  }

  V.foodYazio = () => {
    const st = S();
    const yz = st.food.yazio || {};
    const native = !!GT.NATIVE;
    const on = !!yz.on;
    const last = L.yazioLast();
    const t = L.today();
    const week = st.food.entries.filter(e => e.src === 'yazio' && e.date > L.addDays(t, -7));
    const wt = L.totals(week);
    const step = (ok, title, body) => `<li class="step ${ok ? 'ok' : ''}"><span class="step-ic">${ok ? icon('check') : '•'}</span><div class="grow"><b>${title}</b>${body ? `<div class="muted sm">${body}</div>` : ''}</div></li>`;
    return `
      ${header('Yazio', { back: 'food', sub: 'Ruoka' })}
      <main class="content">
        <section class="card">
          <p class="sheet-text">Yazio kirjoittaa ateriasi kalorit ja makrot Apple Healthiin. GymTrackin iPhone-sovellus lukee ne sieltä ja lisää ne Ruoka-näkymään omiksi riveikseen (esim. <b>Yazio · Lounas</b>). Ruokaa ei tarvitse kirjata kahdesti.</p>
          ${native ? `<ol class="steps">
            ${step(true, 'Yhdistä Yazio Apple Healthiin', 'Yaziossa: <b>Profiili → Asetukset → Apple Health</b> (tai <i>Yhdistetyt sovellukset</i>) → yhdistä ja salli <b>ravintotiedot</b> kirjoitettavaksi.')}
            ${step(on, 'Salli GymTrackin lukea ravintotiedot', on ? 'Käytössä. Jos tietoja ei tule, tarkista oikeudet: <b>Terveys → profiilikuva → Sovellukset → GymTrack</b>.' : 'Napauta alta. iPhone kysyy lupaa lukea kalorit, proteiini, hiilihydraatit ja rasva.')}
            ${step(!!(last && last.count), 'Tiedot tulevat automaattisesti', 'Haku tehdään aina, kun avaat GymTrackin, ja se kattaa viimeiset 7 päivää. Yaziossa tehdyt muutokset päivittyvät seuraavalla haulla.')}
          </ol>
          ${on ? `<button class="btn btn-primary btn-block btn-lg" data-action="yazio-sync" ${VS.yazioBusy ? 'disabled' : ''}>${icon('swap')} ${VS.yazioBusy ? 'Haetaan…' : 'Hae nyt'}</button>`
               : `<button class="btn btn-primary btn-block btn-lg" data-action="yazio-enable">${icon('swap')} Ota Yazio-tuonti käyttöön</button>`}` : `
          <p class="sheet-text">Apple Healthin tietoja voi lukea vain GymTrackin <b>iPhone-sovellus</b>, ei selain. Kun otat tuonnin käyttöön iPhone-sovelluksessa (<b>Ruoka → valikko → Yazio-yhteys</b>), Yazio-ateriat tallentuvat tiliisi ja näkyvät automaattisesti myös täällä.</p>`}
        </section>

        ${last && native ? `<div class="section-title">Viimeisin haku</div>
        <section class="card">
          ${last.error ? `<p class="sheet-text">${icon('x', 'inline')} ${esc(last.error)}</p>` : `<p class="sheet-text"><b>${whenOf(last.at)}</b>: ${last.count} ateriaa ${last.days} päivältä (${kcal(last.kcal)} kcal).</p>`}
          ${!last.error && !last.count ? `<p class="muted sm">Apple Healthista ei löytynyt Yazion ravintotietoja. Tarkista, että Yazio on yhdistetty Apple Healthiin ja että GymTrackilla on lukuoikeus.${last.others && last.others.length ? ` Ravintotietoja löytyi muista lähteistä: ${last.others.map(esc).join(', ')}.` : ''}</p>` : ''}
        </section>` : ''}

        <div class="section-title">Viimeiset 7 päivää Yaziosta</div>
        <section class="card">
          ${week.length ? `<p class="sheet-text">${week.length} ateriaa · ${kcal(wt.kcal)} kcal · P ${g(wt.p)} · H ${g(wt.c)} · R ${g(wt.f)}</p>` : '<p class="muted sm">Ei vielä tuotuja aterioita.</p>'}
          <p class="muted sm">Tuodut rivit voi siirtää toiselle aterialle tai poistaa kuten muutkin. Poistettu rivi ei palaa seuraavassa haussa, ja muokattu rivi muuttuu omaksi merkinnäksesi.</p>
        </section>

        ${native && on ? `<section class="card">
          <button class="btn btn-soft btn-block" data-action="health-open">Avaa Terveys-appi</button>
          <button class="btn btn-danger-ghost btn-block" data-action="yazio-disable">Poista Yazio-tuonti käytöstä</button>
        </section>` : ''}
      </main>`;
  };

  /* ================= MUISTUTUKSET ================= */
  V.reminders = () => {
    const st = S();
    const list = st.reminders.slice().sort((a, b) => a.time.localeCompare(b.time));
    const t = L.today();
    const done = st.tasks.done[t] || {};
    return `
      ${header('Muistutukset', { large: true, right: `<button class="icon-btn" data-action="rem-menu" aria-label="Muistutusvalikko">${icon('plus')}</button>` })}
      <main class="content">
        ${tripCard()}
        ${pushBanner() || `<a class="card card-link notice ok" href="#/notifications">${icon('bell')}<div class="grow"><b>Ilmoitukset päällä</b><div class="muted sm">Muistutukset tulevat myös sovelluksen ollessa suljettuna.</div></div>${icon('chevron', 'muted')}</a>`}
        <ul class="list card rem-list">
          ${list.map(r => `<li class="list-row ${r.enabled === false ? 'off' : ''}">
            <div class="grow" data-action="rem-edit" data-id="${r.id}">
              <div class="rem-time">${time(r.time)}${done[r.id] ? `<span class="badge ok">${icon('check', 'inline')} tehty</span>` : ''}</div>
              <b>${esc(r.title)}</b>
              <div class="muted sm">${daysText(r.days)}${r.notify === false ? ' · ei ilmoitusta' : ''}</div>
            </div>
            <label class="toggle compact" aria-label="Käytössä"><input type="checkbox" data-bind="rem-enabled" data-id="${r.id}" ${r.enabled !== false ? 'checked' : ''}><i></i></label>
          </li>`).join('') || '<li class="list-row muted">Ei muistutuksia.</li>'}
        </ul>
        <button class="btn btn-soft btn-block" data-action="rem-new">${icon('plus')} Uusi muistutus</button>
        <button class="btn btn-ghost btn-block" data-action="rem-reset">Palauta oletusmuistutukset</button>
        <p class="muted sm center mt">Jokainen muistutus on myös päivän tehtävä. Kun kirjaat aterian, sitä vastaava ateriamuistutus merkitään tehdyksi eikä siitä enää muistuteta.</p>
      </main>`;
  };

  /* ================= ILMOITUKSET ================= */
  function step(ok, title, body, warn) {
    return `<li class="step ${ok ? 'ok' : warn ? 'warn' : ''}"><span class="step-ic">${ok ? icon('check') : warn ? '!' : '•'}</span><div class="grow"><b>${title}</b>${body ? `<div class="muted sm">${body}</div>` : ''}</div></li>`;
  }

  V.notifications = () => {
    const st = S();
    const ps = VS.pushStatus;
    if (!ps) { refreshPushStatus(); }
    const p = st.push;
    const installed = ps ? (!ps.ios || ps.standalone) : true;
    const perm = ps ? ps.permission : '…';
    const serverOk = !!(ps && ps.server);
    const subOk = !!(ps && ps.subscribed);
    const sv = VS.serverStatus;
    return `
      ${header('Ilmoitukset', { back: 'reminders', sub: 'Muistutukset' })}
      <main class="content">
        <section class="card">
          <ol class="steps">
            ${step(installed, 'Asennettu kotinäyttöön', ps && ps.ios && !ps.standalone ? 'Avaa sovellus Safarissa → Jaa-painike → <b>Lisää Koti-valikkoon</b>. Avaa sitten sovellus kotinäytön kuvakkeesta ja palaa tähän näkymään. iPhone näyttää verkkosovelluksen ilmoitukset vain kotinäytöltä avattuna (iOS 16.4 tai uudempi).' : ps && !ps.ios ? 'Selain tukee ilmoituksia ilman asennusta.' : '', ps && ps.ios && !ps.standalone)}
            ${step(serverOk, 'Ilmoituspalvelin', serverOk ? esc(ps.server.replace(/^https:\/\//, '')) : 'Palvelinta ei ole vielä otettu käyttöön. Ohjeet ovat sovelluksen README-tiedostossa (GitHub). Kun palvelin on käytössä, sen osoite tulee tähän automaattisesti tai voit liittää sen alle.', !serverOk)}
            ${step(perm === 'granted', 'Ilmoituslupa', perm === 'granted' ? 'Sallittu' : perm === 'denied' ? 'Estetty. Salli: iPhonen <b>Asetukset → Ilmoitukset → GymTrack → Salli ilmoitukset</b>. Palaa sitten tähän ja napauta "Ota ilmoitukset käyttöön".' : perm === 'unsupported' ? 'Tämä selain ei tue ilmoituksia tässä tilassa.' : 'Ei vielä pyydetty', perm === 'denied')}
            ${step(subOk, 'Push-tilaus palvelimella', subOk ? `Aktiivinen (${esc(ps.endpointHost || '')})${p.lastSync ? ' · synkronoitu ' + new Date(p.lastSync).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' }) : ''}` : 'Ei vielä', false)}
          </ol>
          ${p.lastError ? `<div class="hint err">${icon('x', 'inline')} ${esc(p.lastError)}</div>` : ''}
          ${subOk ? '' : `<button class="btn btn-primary btn-block btn-lg" data-action="push-enable" ${ps && ps.ios && !ps.standalone ? 'disabled' : ''}>${icon('bell')} Ota ilmoitukset käyttöön</button>`}
        </section>

        ${subOk ? `<div class="section-title">Testaa</div>
        <section class="card">
          <button class="btn btn-soft btn-block" data-action="push-test" data-v="0">${icon('bell')} Lähetä testi-ilmoitus nyt</button>
          <button class="btn btn-soft btn-block" data-action="push-test" data-v="60">${icon('timer')} Testi minuutin päästä</button>
          <p class="muted sm">Napauta "Testi minuutin päästä" ja sulje sovellus kokonaan (pyyhkäise ylös sovellusvaihtajassa). Ilmoituksen pitäisi tulla lukitusnäytölle noin minuutin kuluttua.</p>
          <button class="btn btn-ghost btn-block" data-action="push-status">Näytä palvelimen tila</button>
          ${sv ? `<div class="server-log">
            <div class="muted sm">Ajastin ajettu viimeksi: ${sv.lastRun ? new Date(sv.lastRun).toLocaleTimeString('fi-FI') : 'ei vielä'}</div>
            ${(sv.subscriptions || []).map(s => `<div class="muted sm">Laite ${esc(s.host)}: ${s.lastOk ? 'viimeksi toimitettu ' + new Date(s.lastOk).toLocaleString('fi-FI') : 'ei vielä toimituksia'}${s.lastError ? ' · virhe ' + esc(s.lastError) : ''}</div>`).join('')}
            ${(sv.pending || []).map(o => `<div class="muted sm">Odottaa: ${esc(o.title)} klo ${new Date(o.at).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}</div>`).join('')}
            <ul class="mini-hist">${(sv.log || []).map(l => `<li><span class="muted">${new Date(l.at).toLocaleString('fi-FI', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</span><span>${esc(l.title)} ${l.status > 0 ? '✓' : '✗ ' + esc(l.info || '')}</span></li>`).join('')}</ul>
          </div>` : ''}
        </section>` : ''}

        <div class="section-title">Palvelimen osoite</div>
        <section class="card">
          <label class="field"><span>Push-palvelimen osoite</span><input data-bind="push-server" value="${esc(p.server || '')}" placeholder="${esc(GT.PUSH_SERVER || 'https://gymtrack-push.<tunnus>.workers.dev')}" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="url"></label>
          <p class="muted sm">Jätä tyhjäksi, niin käytetään sovellukseen asetettua osoitetta${GT.PUSH_SERVER ? '' : ' (ei vielä asetettu)'}.</p>
          ${subOk ? `<button class="btn btn-danger-ghost btn-block" data-action="push-disable">Poista ilmoitukset käytöstä tällä laitteella</button>` : ''}
        </section>
      </main>`;
  };

  let refreshing = false;
  async function refreshPushStatus() {
    if (refreshing) return;
    refreshing = true;
    try { VS.pushStatus = await GT.push.status(); } catch (e) { VS.pushStatus = { permission: 'unsupported' }; }
    refreshing = false;
    GT.render && GT.render();
  }
  GT.refreshPushStatus = refreshPushStatus;

  /* ================= VIIKKORAPORTTI ================= */
  V.report = (ws) => {
    const st = S();
    const t = L.today();
    const cur = L.weekStartISO(t);
    // oletuksena viime viikko; sunnuntaina kuluva viikko
    const def = L.weekday(t) === 6 ? cur : L.addDays(cur, -7);
    const start = ws && /^\d{4}-\d{2}-\d{2}$/.test(ws) ? L.weekStartISO(ws) : def;
    const r = L.weeklyReport(st, start);
    const goals = st.food.goals;
    const items = r.days.map(d => ({ label: DAY2[L.weekday(d.date)], v: d.kcal }));
    const taskPct = r.tasksTotal ? Math.round(r.tasksDone / r.tasksTotal * 100) : null;
    const wk = (() => { const d = L.parseISO(start); const jan4 = new Date(d.getFullYear(), 0, 4); const w1 = L.parseISO(L.weekStartISO(L.iso(jan4))); return Math.round((d - w1) / 604800000) + 1; })();
    return `
      ${header('Viikkoraportti', { back: 'today', sub: `Viikko ${wk} · ${F.date(L.parseISO(start), { day: 'numeric', month: 'numeric' })}–${F.date(L.parseISO(r.weekEnd), { day: 'numeric', month: 'numeric' })}` })}
      <main class="content">
        <div class="date-nav">
          <a class="icon-btn" href="#/report/${L.addDays(start, -7)}" aria-label="Edellinen viikko">${icon('back')}</a>
          <b>${start === cur ? 'Tämä viikko' : start === L.addDays(cur, -7) ? 'Viime viikko' : 'Viikko ' + wk}</b>
          ${start < cur ? `<a class="icon-btn" href="#/report/${L.addDays(start, 7)}" aria-label="Seuraava viikko">${icon('chevron')}</a>` : '<span class="icon-btn ghost"></span>'}
        </div>
        <section class="stat-grid">
          <div class="card stat"><div class="card-label">Ruokaseuranta</div><div class="big sm">${r.logged}<small> / 7 pv</small></div><div class="muted sm">${r.past < 7 ? `${r.past} päivää kulunut` : Math.round(r.logged / 7 * 100) + ' % toteutuma'}</div></div>
          <div class="card stat"><div class="card-label">Ka. kalorit / pv</div><div class="big sm">${r.logged ? `<span data-count="${r.avgKcal}">${kcal(r.avgKcal)}</span>` : '–'}</div><div class="muted sm">Tavoite ${kcal(goals.kcal)} kcal</div></div>
          <div class="card stat"><div class="card-label">Ka. proteiini / pv</div><div class="big sm">${r.logged ? F.num(r.avgP, 0) : '–'}<small> g</small></div><div class="muted sm">Tavoite ${goals.protein} g</div></div>
          <div class="card stat"><div class="card-label">Paino</div><div class="big sm">${r.weight.last ? F.num(r.weight.last.value) + '<small> kg</small>' : '–'}</div><div class="muted sm">${r.weight.change !== null ? `${r.weight.change > 0 ? '+' : ''}${F.num(r.weight.change)} kg ${r.weight.prev ? 'edellisestä' : 'viikon aikana'}` : r.weight.last ? 'Yksi mittaus' : 'Ei mittauksia'}</div></div>
          <div class="card stat"><div class="card-label">Tehtävät</div><div class="big sm">${r.tasksDone}<small> / ${r.tasksTotal}</small></div><div class="muted sm">${taskPct === null ? '–' : taskPct + ' % suoritettu'}</div></div>
          <div class="card stat"><div class="card-label">Treenit</div><div class="big sm">${r.workouts}<small>${r.plannedWorkouts ? ' / ' + r.plannedWorkouts : ''}</small></div><div class="muted sm">Kuntosali</div></div>
        </section>
        <section class="card"><div class="card-label">Kalorit päivittäin</div>${C.bars(items, { goal: goals.kcal })}</section>
        <section class="card tips"><div class="card-label">${icon('up', 'inline')} Parannettavaa ensi viikolle</div>
          <ul class="guide">${r.tips.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>
      </main>`;
  };

  /* ================= KEHON MITAT: viikko- ja kuukausinäkymä ================= */
  /** Ryhmittelee mittaukset viikoittain tai kuukausittain (keskiarvo). */
  GT.groupMeasures = (list, mode) => {
    if (mode !== 'week' && mode !== 'month') return null;
    const groups = new Map();
    list.forEach(m => {
      const k = mode === 'week' ? L.weekStartISO(m.date) : m.date.slice(0, 7) + '-01';
      const gr = groups.get(k) || { key: k, sum: 0, n: 0 };
      gr.sum += m.value; gr.n++;
      groups.set(k, gr);
    });
    return Array.from(groups.values()).sort((a, b) => b.key.localeCompare(a.key)).map(gr => ({
      key: gr.key, value: Math.round(gr.sum / gr.n * 10) / 10, n: gr.n,
      label: mode === 'week' ? 'Vk ' + F.date(L.parseISO(gr.key), { day: 'numeric', month: 'numeric' }) : (s => s.charAt(0).toUpperCase() + s.slice(1))(L.parseISO(gr.key).toLocaleDateString('fi-FI', { month: 'long', year: 'numeric' }))
    }));
  };
})();
