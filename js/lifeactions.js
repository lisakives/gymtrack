/* GymTrack – elämäntapatoimintojen tapahtumankäsittelijät */
(function () {
  'use strict';

  const ui = GT.ui, { esc, icon } = ui;
  const M = GT.model, F = GT.fmt, L = GT.life, Store = GT.Store, VS = GT.viewState;
  const S = () => Store.get();
  const render = () => GT.render();
  const sync = () => GT.push.scheduleSync();
  const kcal = v => Math.round(v || 0).toLocaleString('fi-FI');
  const fmtAmt = v => String(v).replace('.', ',');

  /* ---------- Ruoan lisäys ---------- */
  function addEntries(date, meal, items, { toast = true } = {}) {
    const now = new Date().toISOString();
    Store.update(s => {
      items.forEach(it => s.food.entries.push({
        id: M.uid('f'), date, meal, name: it.name, amount: it.amount, unit: it.unit || 'g',
        kcal: Math.round(+it.kcal || 0), p: +it.p || 0, c: +it.c || 0, f: +it.f || 0,
        per100: it.per100 || null, createdAt: now
      }));
      L.autoCompleteMeal(s, date, meal);
    });
    ui.haptic(12);
    if (toast) ui.toast(items.length === 1 ? `${esc(items[0].name)} lisätty (${kcal(items[0].kcal)} kcal)` : `${items.length} ruokaa lisätty`);
    sync();
  }

  function itemFromResult(x) {
    // tietokanta-/viimeisin-/suosikkirivi → lisättävä ruoka oletusmäärällä
    return L.scaleItem(x, x.amount) || x;
  }

  function foodSheet(date, meal) {
    date = date || L.today();
    meal = meal || (date === L.today() ? L.defaultMeal() : 'm1');
    let q = '';
    let results = [];
    return ui.sheet(`<div class="food-sheet">
        <h3 class="sheet-title">Lisää ruoka</h3>
        <div class="segmented meal-pick">${L.MEALS.map(m => `<button type="button" class="${m.key === meal ? 'on' : ''}" data-meal="${m.key}">${m.label}</button>`).join('')}</div>
        <div class="search-wrap">${icon('search')}<input class="search" type="search" placeholder="Hae ruokaa tai suosikkia…" autocomplete="off" enterkeyhint="search"></div>
        <div class="food-pane"></div>
        <div class="sheet-actions">
          <button type="button" class="btn btn-soft btn-block" data-x="custom">${icon('edit')} Oma ruoka (syötä arvot)</button>
          <button type="button" class="btn btn-ghost btn-block" data-sheet="done">Valmis</button>
        </div></div>`, {
      onMount(el, close) {
        const pane = el.querySelector('.food-pane');
        const input = el.querySelector('.search');
        const row = (x, i, kind) => {
          const it = kind === 'fav' ? { name: x.name, ...L.totals(x.items) } : itemFromResult(x);
          const sub = kind === 'fav' ? `${x.items.length > 1 ? x.items.length + ' ruokaa · ' : ''}${kcal(it.kcal)} kcal · P ${F.num(it.p, 0)} g`
            : `${fmtAmt(it.amount)} ${esc(it.unit)} · ${kcal(it.kcal)} kcal · P ${F.num(it.p, 0)} g`;
          return `<li><button type="button" class="fr-main" data-pick="${kind}:${i}"><b>${esc(x.name)}</b><span class="muted sm">${sub}</span></button>
            <button type="button" class="icon-btn sm fr-add" data-quick="${kind}:${i}" aria-label="Lisää heti">${icon('plus')}</button></li>`;
        };
        function list() {
          results = L.searchFoods(S(), q);
          const sec = (title, arr, kind) => arr.length ? `<div class="fr-title">${title}</div><ul class="fr-list">${arr.map((x, i) => row(x, i, kind)).join('')}</ul>` : '';
          const html = sec('Suosikit', results.favs, 'fav') + sec(q ? 'Aiemmin syödyt' : 'Viimeksi lisätyt', results.recent, 'recent') + sec('Ruokatietokanta', results.db.slice(0, 30), 'db');
          pane.innerHTML = html || `<p class="muted sm center">${q ? 'Ei osumia. Lisää ruoka omilla arvoilla alta.' : 'Hae ruokaa kirjoittamalla nimi, esim. "kana" tai "rahka".'}</p>`;
        }
        function get(ref) {
          const [kind, i] = ref.split(':');
          const arr = kind === 'fav' ? results.favs : kind === 'recent' ? results.recent : results.db;
          return { kind, x: arr[+i] };
        }
        function amountView(x) {
          const base = itemFromResult(x);
          const chips = [];
          if (x.por) { chips.push([`1 ${x.por[0]}`, x.por[1]]); chips.push([`2 ${x.por[0]}`, x.por[1] * 2]); }
          else if (!x.per100) { chips.push(['½ ×', base.amount / 2], ['1 ×', base.amount], ['2 ×', base.amount * 2]); }
          if (x.per100) [50, 100, 150, 200, 300].forEach(v => chips.push([v + ' ' + (x.unit || 'g'), v]));
          pane.innerHTML = `<div class="amount-view">
            <div class="row-between"><b>${esc(x.name)}</b><button type="button" class="link sm" data-back="1">Takaisin</button></div>
            <label class="field"><span>Määrä (${esc(base.unit)})</span><input class="amt" inputmode="decimal" value="${fmtAmt(base.amount)}" autocomplete="off"></label>
            <div class="chips">${chips.map(([l, v]) => `<button type="button" class="chip" data-amt="${v}">${l}</button>`).join('')}</div>
            <div class="amt-preview"></div>
            <button type="button" class="btn btn-primary btn-block btn-lg" data-confirm="1">${icon('plus')} Lisää</button></div>`;
          const amt = pane.querySelector('.amt');
          const prev = () => {
            const it = L.scaleItem(x, amt.value);
            pane.querySelector('.amt-preview').innerHTML = it ? `<b>${kcal(it.kcal)} kcal</b><span>P ${F.num(it.p)} g · H ${F.num(it.c)} g · R ${F.num(it.f)} g</span>` : '<span class="muted">Syötä määrä</span>';
            return it;
          };
          prev();
          amt.addEventListener('input', prev);
          pane.querySelector('.chips').addEventListener('click', e => { const b = e.target.closest('[data-amt]'); if (b) { amt.value = fmtAmt(Math.round(+b.dataset.amt * 10) / 10); prev(); } });
          pane.querySelector('[data-back]').addEventListener('click', list);
          pane.querySelector('[data-confirm]').addEventListener('click', () => {
            const it = prev();
            if (!it) return ui.toast('Syötä määrä', 'error');
            addEntries(date, meal, [it]);
            q = ''; input.value = ''; list();
          });
          setTimeout(() => { amt.focus(); amt.select(); }, 50);
        }
        el.querySelector('.meal-pick').addEventListener('click', e => {
          const b = e.target.closest('[data-meal]'); if (!b) return;
          meal = b.dataset.meal;
          el.querySelectorAll('.meal-pick button').forEach(x => x.classList.toggle('on', x === b));
        });
        input.addEventListener('input', () => { q = input.value; list(); });
        pane.addEventListener('click', e => {
          const quick = e.target.closest('[data-quick]');
          const pick = e.target.closest('[data-pick]');
          if (quick) {
            const { kind, x } = get(quick.dataset.quick);
            if (kind === 'fav') { addFavorite(x, date, meal); }
            else addEntries(date, meal, [itemFromResult(x)]);
            quick.classList.add('added'); GT.motion.pop(quick);
            return;
          }
          if (pick) {
            const { kind, x } = get(pick.dataset.pick);
            if (kind === 'fav') { addFavorite(x, date, meal); return; }
            amountView(x);
          }
        });
        el.querySelector('[data-x="custom"]').addEventListener('click', () => { close('custom'); });
        list();
      }
    }).then(r => {
      if (r === 'custom') return customFood(date, meal);
      render();
    });
  }

  async function customFood(date, meal, existing) {
    const e = existing || {};
    const v = await ui.form({
      title: existing ? 'Muokkaa ruokaa' : 'Oma ruoka', ok: existing ? 'Tallenna' : 'Lisää',
      fields: [
        { name: 'name', label: 'Ruoan nimi', value: e.name || '', required: true, placeholder: 'esim. Kanasalaatti' },
        { name: 'amount', label: 'Määrä', type: 'number', value: e.amount != null ? fmtAmt(e.amount) : '', required: true, half: true, placeholder: '100' },
        { name: 'unit', label: 'Yksikkö', value: e.unit || 'g', half: true },
        { name: 'kcal', label: 'Kalorit (kcal)', type: 'number', value: e.kcal != null ? e.kcal : '', required: true, half: true },
        { name: 'p', label: 'Proteiini (g)', type: 'number', value: e.p != null ? fmtAmt(e.p) : '', half: true },
        { name: 'c', label: 'Hiilihydraatit (g)', type: 'number', value: e.c != null ? fmtAmt(e.c) : '', half: true },
        { name: 'f', label: 'Rasva (g)', type: 'number', value: e.f != null ? fmtAmt(e.f) : '', half: true },
        ...(existing ? [] : [{ name: 'fav', label: 'Tallenna myös suosikiksi', type: 'checkbox' }])
      ],
      extra: existing ? '' : '<p class="muted sm">Arvot syötetään koko annokselle. Löydät ne pakkauksesta (per 100 g × määrä / 100).</p>'
    });
    if (!v || v.__action) return render();
    const item = { name: v.name, amount: v.amount, unit: v.unit || 'g', kcal: v.kcal || 0, p: v.p || 0, c: v.c || 0, f: v.f || 0 };
    if (existing) {
      Store.update(() => Object.assign(existing, item, { per100: null }));
      ui.toast('Ruoka päivitetty'); sync();
    } else {
      addEntries(date, meal, [item]);
      if (v.fav) saveFavorite(item.name, [item]);
    }
    render();
  }

  function saveFavorite(name, items) {
    const clean = items.map(i => ({ name: i.name, amount: i.amount, unit: i.unit || 'g', kcal: i.kcal, p: i.p, c: i.c, f: i.f, per100: i.per100 || null }));
    Store.update(s => s.food.favorites.push({ id: M.uid('fav'), name, items: clean, uses: 0, createdAt: new Date().toISOString() }));
    ui.toast(`Tallennettu suosikiksi: ${esc(name)}`);
  }

  function addFavorite(fav, date, meal) {
    date = date || L.today();
    meal = meal || (date === L.today() ? L.defaultMeal() : 'm1');
    addEntries(date, meal, fav.items, { toast: false });
    Store.update(s => { const f = s.food.favorites.find(x => x.id === fav.id); if (f) f.uses = (f.uses || 0) + 1; });
    ui.toast(`${esc(fav.name)} lisätty: ${L.mealLabel(meal)} (${kcal(L.totals(fav.items).kcal)} kcal)`);
  }

  // Muistutuksen 'meal'-tieto lomakkeelta: oletuksena ei mitään
  /* ---------- Muistutuslomake ---------- */
  function reminderSheet(existing) {
    const r = existing || { id: null, time: L.hm(new Date(Date.now() + 3600000)).slice(0, 3) + '00', title: '', body: '', days: [], enabled: true, notify: true };
    let days = r.days && r.days.length ? r.days.slice() : [0, 1, 2, 3, 4, 5, 6];
    return ui.sheet(`<form class="sheet-form rem-form" novalidate>
      <h3 class="sheet-title">${existing ? 'Muokkaa muistutusta' : 'Uusi muistutus'}</h3>
      <div class="fields">
        <label class="field half"><span>Kellonaika</span><input type="time" name="time" value="${r.time}" required></label>
        <label class="field half"><span>Otsikko</span><input name="title" value="${esc(r.title)}" placeholder="esim. Vettä" autocomplete="off" required></label>
        <label class="field"><span>Ilmoituksen teksti</span><input name="body" value="${esc(r.body || '')}" placeholder="Valinnainen" autocomplete="off"></label>
      </div>
      <div class="card-label mt-sm">Päivät</div>
      <div class="day-pick">${['ma', 'ti', 'ke', 'to', 'pe', 'la', 'su'].map((d, i) => `<button type="button" class="${days.includes(i) ? 'on' : ''}" data-d="${i}">${d}</button>`).join('')}</div>
      <label class="toggle"><span>Lähetä puhelimen ilmoitus</span><input type="checkbox" name="notify" ${r.notify !== false ? 'checked' : ''}><i></i></label>
      <div class="sheet-actions">
        <button class="btn btn-primary btn-block" type="submit">Tallenna</button>
        ${existing ? `<button type="button" class="btn btn-danger-ghost btn-block" data-sheet="delete">${icon('trash')} Poista muistutus</button>` : ''}
        <button type="button" class="btn btn-ghost btn-block" data-sheet="cancel">Peruuta</button>
      </div></form>`, {
      onMount(el, close) {
        const form = el.querySelector('form');
        el.querySelector('.day-pick').addEventListener('click', e => {
          const b = e.target.closest('[data-d]'); if (!b) return;
          const d = +b.dataset.d;
          days = days.includes(d) ? days.filter(x => x !== d) : days.concat(d).sort();
          b.classList.toggle('on', days.includes(d));
        });
        form.addEventListener('submit', e => {
          e.preventDefault();
          const time = form.elements.time.value, title = form.elements.title.value.trim();
          if (!/^\d{2}:\d{2}$/.test(time) || !title) { ui.toast('Anna kellonaika ja otsikko', 'error'); return; }
          if (!days.length) { ui.toast('Valitse vähintään yksi päivä', 'error'); return; }
          const out = { time, title, body: form.elements.body.value.trim(), days: days.length === 7 ? [] : days, notify: form.elements.notify.checked };
          close({ save: out });
        });
      }
    });
  }

  /* ---------- Tehtävä/muistutus-paneeli (myös ilmoituksesta avattaessa) ---------- */
  async function taskMenu(rid, fromNotification) {
    const st = S();
    const r = st.reminders.find(x => x.id === rid);
    if (!r) return;
    const t = L.today();
    const done = !!(st.tasks.done[t] || {})[rid];
    const res = await ui.sheet(`<div class="sheet-ic">${icon('bell')}</div>
      <h3 class="sheet-title">${esc(r.title)}</h3>
      <p class="sheet-text">${r.time.replace(':', '.')}${r.body ? ' · ' + esc(r.body) : ''}</p>
      <div class="sheet-actions">
        ${r.kind === 'meal' && !done ? `<button class="btn btn-primary btn-block" data-sheet="food">${icon('plus')} Kirjaa ateria</button>` : ''}
        ${r.kind === 'summary' ? `<button class="btn btn-soft btn-block" data-sheet="foodview">Avaa päivän ruokailut</button>` : ''}
        ${r.kind === 'report' ? `<button class="btn btn-soft btn-block" data-sheet="report">Avaa viikkoraportti</button>` : ''}
        <button class="btn ${done ? 'btn-soft' : r.kind === 'meal' ? 'btn-soft' : 'btn-primary'} btn-block" data-sheet="toggle">${done ? 'Merkitse tekemättömäksi' : icon('check') + ' Merkitse tehdyksi'}</button>
        ${done ? '' : `<div class="snooze-row"><span class="muted sm">Torkuta</span>
          <button class="chip" data-sheet="snz:10">10 min</button><button class="chip" data-sheet="snz:30">30 min</button><button class="chip" data-sheet="snz:60">1 h</button></div>`}
        <button class="btn btn-ghost btn-block" data-sheet="${fromNotification ? 'cancel' : 'edit'}">${fromNotification ? 'Sulje' : icon('edit') + ' Muokkaa muistutusta'}</button>
      </div>`);
    if (!res || res === 'cancel') return;
    if (res === 'toggle') {
      Store.update(s => L.setDone(s, rid, t, !done));
      if (!done) { ui.haptic(15); ui.toast(`${esc(r.title)} tehty`); }
      sync(); render();
      const tp = L.taskProgress(S(), t);
      if (!done && tp.total && tp.done === tp.total) GT.motion.celebrate();
    }
    else if (res.startsWith('snz:')) {
      const min = +res.slice(4);
      try {
        const until = await GT.push.snooze(r, min);
        ui.toast(`Torkutettu klo ${L.hm(new Date(until)).replace(':', '.')} asti${S().push.subscribed ? '' : ' (vain sovellus auki)'}`);
      } catch (e) { ui.toast('Torkku tallennettiin vain laitteelle: ' + esc(e.message), 'error', 4000); }
      render();
    }
    else if (res === 'food') { foodSheet(t, r.meal); }
    else if (res === 'foodview') GT.go('food');
    else if (res === 'report') GT.go('report');
    else if (res === 'edit') editReminder(rid);
  }

  async function editReminder(rid) {
    const r = rid ? S().reminders.find(x => x.id === rid) : null;
    const res = await reminderSheet(r);
    if (!res || res === 'cancel') return;
    if (res === 'delete') {
      const ok = await ui.confirm({ title: `Poistetaanko ${esc(r.title)}?`, ok: 'Poista', danger: true });
      if (!ok) return;
      Store.update(s => { s.reminders = s.reminders.filter(x => x.id !== rid); });
      ui.toast('Muistutus poistettu');
    } else if (res.save) {
      Store.update(s => {
        if (r) Object.assign(r, res.save);
        else s.reminders.push({ id: M.uid('r'), enabled: true, ...res.save });
      });
      ui.toast(r ? 'Muistutus tallennettu' : 'Muistutus lisätty');
    }
    sync(); render();
  }

  /* ---------- Toiminnot ---------- */
  GT.extraActions = {
    'task-toggle': el => {
      const t = L.today(), id = el.dataset.id;
      const was = !!(S().tasks.done[t] || {})[id];
      Store.update(s => L.setDone(s, id, t, !was));
      if (!was) ui.haptic(15);
      sync(); render();
      const btn = document.querySelector(`.task-check[data-id="${id}"]`);
      if (btn) GT.motion.pop(btn.closest('li'));
      const tp = L.taskProgress(S(), t);
      if (!was && tp.total && tp.done === tp.total) {
        const r = btn ? btn.getBoundingClientRect() : null;
        GT.motion.celebrate(r ? r.left + 15 : null, r ? r.top + 15 : null);
        ui.toast('Kaikki päivän tehtävät tehty! Hienoa!', '', 3200);
      }
    },
    'task-menu': el => taskMenu(el.dataset.id),
    'food-menu': el => ui.menu(el, [
      { label: 'Tavoitteet', icon: 'flag', action: 'food-goals' },
      { label: 'Suosikit', icon: 'trophy', href: '#/food-favs' },
      { label: 'Viikkoraportti', icon: 'note', href: '#/food-report/week' },
      { label: 'Kuukausiraportti', icon: 'chart', href: '#/food-report/month' }
    ]),
    'rem-menu': el => ui.menu(el, [
      { label: 'Uusi muistutus', icon: 'plus', action: 'rem-new' },
      { label: 'Palauta oletukset', icon: 'swap', action: 'rem-reset' }
    ]),
    'food-add': el => foodSheet(el.dataset.date, el.dataset.meal),
    'fav-add': el => { const f = S().food.favorites.find(x => x.id === el.dataset.id); if (f) { addFavorite(f, el.dataset.date); render(); } },
    'fav-delete': async el => {
      const f = S().food.favorites.find(x => x.id === el.dataset.id);
      if (!f || !(await ui.confirm({ title: `Poistetaanko suosikki ${esc(f.name)}?`, ok: 'Poista', danger: true }))) return;
      Store.update(s => { s.food.favorites = s.food.favorites.filter(x => x.id !== f.id); });
      render();
    },
    'food-entry': async el => {
      const e = S().food.entries.find(x => x.id === el.dataset.id);
      if (!e) return;
      const r = await ui.sheet(`<h3 class="sheet-title">${esc(e.name)}</h3><p class="sheet-text">${fmtAmt(e.amount)} ${esc(e.unit)} · ${kcal(e.kcal)} kcal · P ${F.num(e.p)} g · H ${F.num(e.c)} g · R ${F.num(e.f)} g</p>
        <div class="sheet-actions">
          <button class="btn btn-soft btn-block" data-sheet="amount">Muuta määrää</button>
          <div class="snooze-row"><span class="muted sm">Siirrä</span>${L.MEALS.filter(m => m.key !== e.meal).map(m => `<button class="chip" data-sheet="move:${m.key}">${m.label}</button>`).join('')}</div>
          <button class="btn btn-soft btn-block" data-sheet="fav">${icon('trophy')} Tallenna suosikiksi</button>
          <button class="btn btn-soft btn-block" data-sheet="edit">${icon('edit')} Muokkaa tietoja</button>
          <button class="btn btn-danger-ghost btn-block" data-sheet="delete">${icon('trash')} Poista</button>
          <button class="btn btn-ghost btn-block" data-sheet="cancel">Peruuta</button></div>`);
      if (r === 'amount') {
        const v = await ui.form({ title: 'Muuta määrää', fields: [{ name: 'amount', label: `Määrä (${e.unit})`, type: 'number', value: fmtAmt(e.amount), required: true }] });
        if (v && !v.__action) { const it = L.scaleItem(e, v.amount); if (it) { Store.update(() => Object.assign(e, it)); sync(); } }
      } else if (r && r.startsWith('move:')) { Store.update(s => { e.meal = r.slice(5); L.autoCompleteMeal(s, e.date, e.meal); }); sync(); }
      else if (r === 'fav') saveFavorite(e.name, [e]);
      else if (r === 'edit') return customFood(e.date, e.meal, e);
      else if (r === 'delete') { Store.update(s => { s.food.entries = s.food.entries.filter(x => x.id !== e.id); }); ui.toast('Poistettu'); sync(); }
      render();
    },
    'meal-menu': async el => {
      const { meal, date } = el.dataset;
      const list = L.entriesOn(S(), date).filter(e => e.meal === meal);
      const r = await ui.sheet(`<h3 class="sheet-title">${L.mealLabel(meal)}</h3><p class="sheet-text">${list.length} ruokaa · ${kcal(L.totals(list).kcal)} kcal</p>
        <div class="sheet-actions">
          <button class="btn btn-primary btn-block" data-sheet="fav">${icon('trophy')} Tallenna koko ateria suosikiksi</button>
          <button class="btn btn-danger-ghost btn-block" data-sheet="clear">${icon('trash')} Tyhjennä ateria</button>
          <button class="btn btn-ghost btn-block" data-sheet="cancel">Peruuta</button></div>`);
      if (r === 'fav') {
        const v = await ui.form({ title: 'Suosikkiaterian nimi', fields: [{ name: 'name', label: 'Nimi', value: list.map(x => x.name).slice(0, 2).join(' + '), required: true }] });
        if (v && !v.__action) saveFavorite(v.name, list);
      } else if (r === 'clear') {
        if (await ui.confirm({ title: 'Tyhjennetäänkö ateria?', ok: 'Tyhjennä', danger: true })) {
          const ids = new Set(list.map(x => x.id));
          Store.update(s => { s.food.entries = s.food.entries.filter(x => !ids.has(x.id)); });
          sync();
        }
      }
      render();
    },
    'meal-copy': el => {
      const { meal, from, date } = el.dataset;
      const list = L.entriesOn(S(), from).filter(e => e.meal === meal);
      addEntries(date, meal, list, { toast: false });
      ui.toast(`${L.mealLabel(meal)} kopioitu (${kcal(L.totals(list).kcal)} kcal)`);
      render();
    },
    'food-goals': async () => {
      const gl = S().food.goals;
      const v = await ui.form({ title: 'Päivän tavoitteet', fields: [
        { name: 'kcal', label: 'Kalorit (kcal)', type: 'number', int: true, value: gl.kcal, required: true, half: true },
        { name: 'protein', label: 'Proteiini (g)', type: 'number', int: true, value: gl.protein, required: true, half: true },
        { name: 'carbs', label: 'Hiilihydraatit (g)', type: 'number', int: true, value: gl.carbs, half: true },
        { name: 'fat', label: 'Rasva (g)', type: 'number', int: true, value: gl.fat, half: true },
        { name: 'weight', label: 'Tavoitepaino (kg, valinnainen)', type: 'number', value: gl.weight != null ? fmtAmt(gl.weight) : '' }
      ], extra: '<p class="muted sm">Suuntaa-antava proteiinitavoite lihasmassan kasvatukseen on noin 1,6–2,2 g painokiloa kohden.</p>' });
      if (!v || v.__action) return;
      Store.update(s => { Object.assign(s.food.goals, { kcal: Math.round(v.kcal), protein: Math.round(v.protein), carbs: Math.round(v.carbs || 0), fat: Math.round(v.fat || 0), weight: v.weight }); });
      ui.toast('Tavoitteet tallennettu'); sync(); render();
    },
    'report-shift': el => { VS.foodReportOffset = Math.min(0, VS.foodReportOffset + (+el.dataset.v)); render(); },

    'trip-start': async el => {
      const t = L.today();
      const start = L.addDays(t, +(el.dataset.offset || 0));
      const v = await ui.form({ title: 'Olen töissä', ok: 'Ota käyttöön', fields: [
        { name: 'from', label: 'Alkaa', type: 'date', value: start, required: true, half: true },
        { name: 'to', label: 'Päättyy', type: 'date', value: L.addDays(start, 6), required: true, half: true }],
        extra: '<p class="muted sm">Työpäivinä ateriamuistutukset kertovat työpäivän ohjeen. Muut muistutukset ja tehtävät säilyvät ennallaan.</p>' });
      if (!v || v.__action) return;
      if (!v.from || !v.to || v.to < v.from) return ui.toast('Tarkista päivämäärät', 'error');
      Store.update(s => { s.trip = { from: v.from, to: v.to }; });
      ui.toast('Merkitty töihin. Hyvää työpäivää!');
      sync(); render();
    },
    'trip-end': async () => {
      if (!(await ui.confirm({ title: 'Lopetetaanko työjakso?', text: 'Muistutukset palaavat normaaliin ohjeeseen.', ok: 'Lopeta' }))) return;
      Store.update(s => { s.trip = null; });
      ui.toast('Työjakso lopetettu');
      sync(); render();
    },
    'rem-new': () => editReminder(null),
    'rem-edit': el => editReminder(el.dataset.id),
    'rem-reset': async () => {
      if (!(await ui.confirm({ title: 'Palautetaanko oletusmuistutukset?', text: 'Omat muutokset ja lisätyt muistutukset korvataan oletuksilla (9.00, 12.00, 15.30, 19.30, 20.00, 21.00 ja sunnuntain viikkoraportti).', ok: 'Palauta' }))) return;
      Store.update(s => { s.reminders = L.defaultReminders(); });
      sync(); render();
    },

    'push-enable': async el => {
      el.disabled = true;
      try {
        await GT.push.enable();
        ui.toast('Ilmoitukset käytössä');
        try { await GT.push.test(0); } catch (e) { /* testi ei pakollinen */ }
      } catch (e) {
        Store.update(s => { s.push.lastError = e.message; });
        ui.toast(esc(e.message), 'error', 5000);
      }
      VS.pushStatus = null; render();
    },
    'push-disable': async () => {
      if (!(await ui.confirm({ title: 'Poistetaanko ilmoitukset käytöstä?', text: 'Muistutukset eivät enää tule tähän puhelimeen.', ok: 'Poista käytöstä', danger: true }))) return;
      await GT.push.disable(); VS.pushStatus = null; render();
    },
    'push-test': async el => {
      const d = +el.dataset.v;
      try {
        const r = await GT.push.test(d);
        if (d) ui.toast('Testi ajastettu. Sulje sovellus nyt kokonaan.', '', 4000);
        else ui.toast(r.ok ? 'Testi lähetetty' : 'Lähetys epäonnistui: ' + esc((r.results || []).map(x => x.status + ' ' + (x.error || '')).join(', ')), r.ok ? '' : 'error', 5000);
      } catch (e) { ui.toast(esc(e.message), 'error', 5000); }
    },
    'push-status': async () => {
      try { VS.serverStatus = await GT.push.serverStatus(); } catch (e) { ui.toast(esc(e.message), 'error'); }
      render();
    }
  };

  GT.extraBinds = {
    'rem-enabled': el => { Store.update(s => { const r = s.reminders.find(x => x.id === el.dataset.id); if (r) r.enabled = el.checked; }); sync(); render(); },
    'push-server': el => { Store.update(s => { s.push.server = el.value.trim(); }); VS.pushStatus = null; GT.push.writeSwConfig(); }
  };
  GT.extraChangeBinds = ['rem-enabled'];

  /* ---------- Ilmoituksesta avaaminen ---------- */
  GT.openReminder = rid => setTimeout(() => taskMenu(rid, true), 250);

  /* ---------- Varajärjestelmä sovelluksen ollessa auki ----------
   * Jos push-ilmoitukset eivät ole käytössä, muistutus näytetään sovelluksen
   * sisällä, kun sovellus on auki. Varsinainen toimitus tapahtuu palvelimelta. */
  const shown = new Set();
  function checkInApp() {
    const st = S();
    if (st.push && st.push.subscribed && 'Notification' in window && Notification.permission === 'granted') return;
    const now = new Date(), t = L.today(), hmNow = L.hm(now);
    const done = st.tasks.done[t] || {};
    st.reminders.forEach(r => {
      if (r.notify === false || !L.activeOn(r, t) || done[r.id] || r.time !== hmNow) return;
      const k = r.id + '|' + t + '|' + hmNow;
      if (shown.has(k)) return;
      shown.add(k);
      ui.toast(`${icon('bell')} <b>${esc(r.title)}</b>`, '', 5000);
      taskMenu(r.id, true);
    });
    Object.entries(st.snoozed || {}).forEach(([rid, until]) => {
      if (until <= Date.now() && !done[rid]) {
        Store.update(s => { delete s.snoozed[rid]; });
        taskMenu(rid, true);
      }
    });
  }
  setInterval(checkInApp, 15000);
})();
