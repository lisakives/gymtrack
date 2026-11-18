/* GymTrack – käyttäjätilin ja pilvivarmuuskopion näkymät ja toiminnot */
(function () {
  'use strict';

  const ui = GT.ui, { esc, icon } = ui;
  const F = GT.fmt, Store = GT.Store, C = GT.cloud;
  const S = () => Store.get();
  const render = () => GT.render && GT.render();
  const err = e => ui.toast(esc(e && e.message ? e.message : String(e)), 'error', 4200);

  function when(ms) {
    if (!ms) return 'ei vielä';
    const d = new Date(ms);
    const hm = d.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
    return F.relDay(d.toISOString()).toLowerCase() + ' klo ' + hm;
  }
  const counts = st => `${(st.sessions || []).filter(x => x.endedAt).length} treeniä · ${(st.measurements || []).length} mittausta · ${((st.food && st.food.entries) || []).length} ruokakirjausta`;

  const GOOGLE_G = '<svg class="ic g-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.2 1.5-5 2.3-8.2 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';
  const GOOGLE_NOTE = 'Google-kirjautumisessa salausavain säilytetään palvelimella, jotta kirjautuminen onnistuu ilman salasanaa. Palvelin voisi silloin teknisesti avata varmuuskopion. Google ei näe tietojasi, eikä sähköpostiasi tallenneta.';
  const PRIVACY = 'Tiedot salataan puhelimessa ennen lähetystä. Palvelin ei näe salasanaasi eikä tietojasi, eikä sähköpostia kysytä.';

  /* ---------- Näkymät ---------- */
  /** Asetusnäkymän osio */
  function section() {
    const c = C.status();
    if (!c.available) {
      return `<section class="card"><p class="muted sm">${GT.EMBEDDED
        ? 'Automaattinen pilvivarmuuskopio ja käyttäjätili toimivat puhelimeen asennetussa sovelluksessa. Täällä tiedot tallentuvat tähän näkymään; voit siirtää ne tiedostona.'
        : 'Pilvivarmuuskopio tarvitsee palvelimen. Ota palvelin käyttöön README-ohjeen mukaan.'}</p></section>`;
    }
    if (!c.loggedIn) {
      return `<section class="card cloud-card">
        <div class="cloud-head">${icon('cloud')}<div class="grow"><b>Tallenna tiedot pilveen automaattisesti</b>
          <div class="muted sm">Luo tili, niin treenit, ruoat ja mittaukset varmuuskopioituvat itsestään ja palautuvat uuteen puhelimeen kirjautumalla.</div></div></div>
        <p class="muted sm">${icon('lock')} ${PRIVACY}</p>
        <button class="btn btn-primary btn-block" data-action="acc-register">${icon('user')} Luo tili</button>
        <button class="btn btn-soft btn-block" data-action="acc-login">Kirjaudu sisään</button>
        <button class="btn btn-ghost btn-block sm" data-action="acc-forgot">Unohtuiko salasana?</button>
      </section>`;
    }
    const bad = c.lastError;
    return `<section class="card cloud-card">
      <div class="cloud-head">${icon('user')}<div class="grow"><b>${esc(c.username)}</b>
        <div class="muted sm">Automaattinen varmuuskopio päällä</div></div>
        <span class="badge ${bad ? '' : 'ok'}">${bad ? 'Odottaa' : 'Ajan tasalla'}</span></div>
      <p class="sm ${bad ? 'warn-text' : 'muted'}" data-cloud-status>${bad ? esc(bad) : 'Viimeisin varmuuskopio: ' + esc(when(c.lastOkAt))}</p>
      <p class="muted sm">${icon('lock')} Salattu puhelimessa. Palvelin säilyttää 30 päivän versiot, mutta ei pysty lukemaan niitä.</p>
      ${c.needsLogin ? `<button class="btn btn-primary btn-block" data-action="acc-relogin">Kirjaudu uudelleen</button>` : `<button class="btn btn-soft btn-block" data-action="acc-sync">${icon('upload')} Varmuuskopioi nyt</button>`}
      <button class="btn btn-soft btn-block" data-action="acc-versions">${icon('history')} Palauta aiempi versio</button>
      <div class="card-label mt">Kirjautumistavat</div>
      ${window.PublicKeyCredential && !GT.NATIVE ? (S().account.passkey
        ? `<div class="method-row">${icon('lock')}<span class="grow">Face ID</span><span class="badge ok">Käytössä</span></div>`
        : `<button class="btn btn-soft btn-block" data-action="acc-passkey">${icon('lock')} Ota Face ID -kirjautuminen käyttöön</button>`) : ''}
      ${C.googleReady() ? (S().account.google
        ? `<div class="method-row">${GOOGLE_G}<span class="grow">Google</span><button class="btn btn-ghost sm" data-action="acc-google-unlink">Poista</button></div>`
        : `<button class="btn btn-soft btn-block" data-action="acc-google-link">${GOOGLE_G} Yhdistä Google-tili</button>`) : ''}
      ${/^google-/.test(c.username) ? '' : '<button class="btn btn-ghost btn-block" data-action="acc-password">Vaihda salasana</button>'}
      <button class="btn btn-ghost btn-block" data-action="acc-logout">Kirjaudu ulos</button>
      <button class="btn btn-danger-ghost btn-block" data-action="acc-delete">${icon('trash')} Poista tili ja pilvikopiot</button>
    </section>`;
  }

  /** Tänään-näkymän kehotus, jos tiliä ei ole vielä luotu */
  function banner() {
    const st = S();
    if (!C.available() || C.loggedIn() || (st.settings && st.settings.cloudBannerHidden) || !C.hasLocalData(st)) return '';
    return `<div class="card notice cloud-banner">${icon('cloud')}<a class="grow" href="#/settings"><b>Varmuuskopioi tiedot automaattisesti</b><div class="muted sm">Luo tili asetuksissa, niin tiedot eivät katoa puhelimen vaihtuessa.</div></a>
      <button class="icon-btn sm" data-action="acc-banner-hide" aria-label="Piilota">${icon('x')}</button></div>`;
  }

  /* ---------- Paneelit ---------- */
  const userField = (value = '') => ({ name: 'username', label: 'Käyttäjänimi', value, required: true, autocomplete: 'username', attrs: 'autocapitalize="none" autocorrect="off" spellcheck="false"' });

  async function showRecoveryCode(code) {
    await ui.sheet(`
      <h3 class="sheet-title">Tallenna palautuskoodi</h3>
      <p class="sheet-text">Tarvitset tätä koodia, jos unohdat salasanan. Tallenna se esimerkiksi salasanojen hallintaan tai ota kuvakaappaus. Koodia ei näytetä uudelleen.</p>
      <div class="recovery-code" data-code>${esc(code)}</div>
      <div class="sheet-actions">
        <button class="btn btn-soft btn-block" type="button" data-copy>Kopioi koodi</button>
        ${navigator.share ? '<button class="btn btn-soft btn-block" type="button" data-share>Jaa tai tallenna…</button>' : ''}
        <button class="btn btn-primary btn-block" data-sheet="ok">Olen tallentanut koodin</button>
      </div>`, {
      dismissable: false,
      onMount(el) {
        el.querySelector('[data-copy]').addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(code); ui.toast('Koodi kopioitu'); } catch (e) { ui.toast('Kopiointi ei onnistunut – kirjoita koodi muistiin', 'error'); }
        });
        const sh = el.querySelector('[data-share]');
        if (sh) sh.addEventListener('click', () => navigator.share({ title: 'GymTrack-palautuskoodi', text: 'GymTrack-palautuskoodi (käyttäjä ' + S().account.username + '): ' + code }).catch(() => {}));
      }
    });
  }

  /** Kirjautumisen jälkeen: otetaanko pilven tiedot vai tämän laitteen tiedot. */
  async function afterLogin(remote) {
    if (!remote) {
      await C.upload(true).catch(() => {});
      ui.toast('Kirjauduttu. Tiedot varmuuskopioidaan automaattisesti.');
      return;
    }
    if (C.hasLocalData()) {
      const r = await ui.sheet(`
        <h3 class="sheet-title">Kumpi tiedot otetaan käyttöön?</h3>
        <p class="sheet-text"><b>Pilvessä</b> (${esc(when(remote.at))}): ${esc(counts(remote.state))}</p>
        <p class="sheet-text"><b>Tällä laitteella</b>: ${esc(counts(S()))}</p>
        <div class="sheet-actions">
          <button class="btn btn-primary btn-block" data-sheet="remote">Käytä pilven tietoja</button>
          <button class="btn btn-soft btn-block" data-sheet="local">Pidä tämän laitteen tiedot</button>
        </div>
        <p class="muted sm center">Pilven aiemmat päivät säilyvät joka tapauksessa versioissa.</p>`, { dismissable: false });
      if (r === 'local') { await C.upload(true).catch(() => {}); ui.toast('Tämän laitteen tiedot tallennettu pilveen'); return; }
    }
    C.applyRemote(remote.state, remote.hash);
    ui.toast('Tiedot palautettu pilvestä');
    location.hash = '#/today';
  }

  /** Tarjoaa Face ID:n käyttöönottoa kerran kirjautumisen jälkeen. */
  async function offerPasskey() {
    const a = S().account;
    if (!a || a.passkey || a.passkeyOffered || !(await C.passkeySupported())) return;
    Store.update(s => { s.account.passkeyOffered = true; });
    const ok = await ui.confirm({ title: 'Kirjaudu jatkossa Face ID:llä?', text: 'Seuraavalla kerralla (myös uudessa iPhonessa, jossa on sama Apple ID) kirjautuminen onnistuu pelkällä Face ID:llä. Salaus säilyy: palvelin ei näe tietojasi.', ok: 'Ota Face ID käyttöön', cancel: 'Ei nyt' });
    if (!ok) return;
    try { await C.enablePasskey(); ui.toast('Face ID otettu käyttöön'); } catch (e) { err(e); }
    render();
  }

  /** Google-painike: lataa Googlen kirjautumiskirjaston ja piirtää painikkeen. */
  let gisLoading = null;
  function loadGis() {
    if (window.google && google.accounts && google.accounts.id) return Promise.resolve();
    if (!gisLoading) gisLoading = new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true;
      sc.onload = resolve; sc.onerror = () => { gisLoading = null; reject(new Error('Googlen kirjautumista ei voitu ladata')); };
      document.head.appendChild(sc);
    });
    return gisLoading;
  }
  let gisCallback = null;
  async function googleButton(container, onCredential) {
    const id = await C.googleClientId();
    if (!id || !container) return false;
    await loadGis();
    gisCallback = onCredential;
    if (!loadGis.inited) {
      google.accounts.id.initialize({ client_id: id, callback: r => gisCallback && gisCallback(r.credential), auto_select: false, cancel_on_tap_outside: true, ux_mode: 'popup', itp_support: true });
      loadGis.inited = true;
    }
    container.innerHTML = '';
    google.accounts.id.renderButton(container, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', locale: 'fi', width: Math.min(400, container.clientWidth || 320) });
    return true;
  }

  /** Google-tunnisteella kirjautuminen tai uuden tilin luonti. */
  async function googleFlow(credential, onDone) {
    try {
      const r = await C.googleLogin(credential);
      if (r.needsSignup) {
        const ok = await ui.confirm({ title: 'Luodaanko uusi tili Googlella?', text: 'Tähän Google-tiliin ei ole vielä yhdistetty GymTrack-tiliä. Jos sinulla on jo tili, kirjaudu ensin salasanalla ja yhdistä Google asetuksista.<br><br>' + esc(GOOGLE_NOTE), ok: 'Luo tili Googlella' });
        if (!ok) return false;
        const code = await C.googleSignup(credential);
        onDone && onDone();
        await showRecoveryCode(code);
        ui.toast('Tili luotu. Tiedot varmuuskopioidaan nyt automaattisesti.');
      } else {
        onDone && onDone();
        await afterLogin(r.remote);
      }
      render();
      return true;
    } catch (e) { err(e); return false; }
  }

  async function busy(label, fn) {
    ui.toast(label, '', 1600);
    return fn();
  }

  async function loginFlow(prefill = '') {
    const v = await ui.form({
      title: 'Kirjaudu sisään', ok: 'Kirjaudu',
      fields: [userField(prefill), { name: 'password', label: 'Salasana', type: 'password', required: true, autocomplete: 'current-password' }],
      extra: '<button class="btn btn-ghost btn-block sm" type="button" data-sheet="forgot">Unohtuiko salasana?</button>'
    });
    if (!v) return;
    if (v.__action === 'forgot') return forgotFlow(prefill);
    try {
      const remote = await busy('Kirjaudutaan…', () => C.login(v.username, v.password));
      await afterLogin(remote);
      await offerPasskey();
    } catch (e) { err(e); }
    render();
  }

  async function forgotFlow(prefill = '') {
    const v = await ui.form({
      title: 'Unohtuiko salasana?', ok: 'Vaihda salasana',
      fields: [
        userField(prefill),
        { name: 'code', label: 'Palautuskoodi', required: true, placeholder: 'XXXXX-XXXXX-XXXXX-XXXXX', attrs: 'autocapitalize="characters" spellcheck="false"', hint: 'Sait koodin tiliä luodessa.' },
        { name: 'password', label: 'Uusi salasana', type: 'password', required: true, autocomplete: 'new-password', hint: 'Vähintään 8 merkkiä' },
        { name: 'password2', label: 'Uusi salasana uudelleen', type: 'password', required: true, autocomplete: 'new-password' }
      ],
      extra: '<p class="muted sm">Ilman palautuskoodia salasanaa ei voi vaihtaa, koska tietosi on salattu eikä palvelin pysty avaamaan niitä.</p>'
    });
    if (!v || v.__action) return;
    if (v.password !== v.password2) return err('Salasanat eivät täsmää');
    try {
      const remote = await busy('Vaihdetaan salasana…', () => C.resetPassword(v.username, v.code, v.password));
      ui.toast('Salasana vaihdettu');
      await afterLogin(remote);
    } catch (e) { err(e); }
    render();
  }

  async function registerFlow() {
    const v = await ui.form({
      title: 'Luo tili', ok: 'Luo tili',
      fields: [
        Object.assign(userField(), { hint: '3–32 merkkiä: a–z, 0–9, . _ -. Ei tarvitse olla oikea nimi.' }),
        { name: 'password', label: 'Salasana', type: 'password', required: true, autocomplete: 'new-password', hint: 'Vähintään 8 merkkiä' },
        { name: 'password2', label: 'Salasana uudelleen', type: 'password', required: true, autocomplete: 'new-password' }
      ],
      extra: `<p class="muted sm">${icon('lock')} ${PRIVACY}</p>`
    });
    if (!v || v.__action) return;
    if (v.password !== v.password2) return err('Salasanat eivät täsmää');
    try {
      const code = await busy('Luodaan tiliä…', () => C.register(v.username, v.password));
      render();
      await showRecoveryCode(code);
      ui.toast('Tili luotu. Tiedot varmuuskopioidaan nyt automaattisesti.');
      await offerPasskey();
    } catch (e) { err(e); }
    render();
  }

  GT.accountView = { section, banner, afterLogin, showRecoveryCode, offerPasskey, googleButton, googleFlow, PRIVACY, GOOGLE_NOTE, GOOGLE_G };

  Object.assign(GT.extraActions = GT.extraActions || {}, {
    'acc-register': () => (GT.authGate ? GT.authGate.open('register') : registerFlow()),
    'acc-login': () => (GT.authGate ? GT.authGate.open('login') : loginFlow()),
    'acc-relogin': async () => { if (GT.authGate) return GT.authGate.open('login'); const u = S().account && S().account.username; await C.logout(); await loginFlow(u || ''); },
    'acc-forgot': () => (GT.authGate ? GT.authGate.open('forgot') : forgotFlow()),
    'acc-banner-hide': () => { Store.update(s => { s.settings.cloudBannerHidden = true; }); render(); },
    'acc-sync': async () => {
      try { await C.upload(true); ui.toast('Varmuuskopioitu'); } catch (e) { err(e); }
      render();
    },
    'acc-versions': async () => {
      let list;
      try { list = await C.list(); } catch (e) { return err(e); }
      if (!list.length) return ui.toast('Pilvessä ei ole vielä varmuuskopioita');
      const r = await ui.sheet(`<h3 class="sheet-title">Palauta aiempi versio</h3>
        <p class="sheet-text">Kultakin päivältä säilyy päivän viimeisin tila 30 päivän ajan.</p>
        <ul class="list card">${list.map(b => `<li><button class="list-row link-row" data-sheet="day:${esc(b.day)}"><div class="grow"><b>${esc(F.date(b.day))}</b><div class="muted sm">klo ${new Date(b.at).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })} · ${(b.size / 1024).toFixed(0)} kt salattuna</div></div>${icon('chevron', 'muted')}</button></li>`).join('')}</ul>
        <div class="sheet-actions"><button class="btn btn-ghost btn-block" data-sheet="cancel">Peruuta</button></div>`);
      if (!r || !r.startsWith('day:')) return;
      try {
        const remote = await C.fetchRemote(r.slice(4));
        const ok = await ui.confirm({ title: 'Palautetaanko tämä versio?', text: `${esc(F.date(remote.day))}: ${esc(counts(remote.state))}. Nykyiset tiedot korvataan, mutta tämän päivän versio jää talteen ennen palautusta.`, ok: 'Palauta' });
        if (!ok) return;
        await C.upload().catch(() => {});
        C.applyRemote(remote.state, remote.hash);
        await C.upload(true).catch(() => {});
        ui.toast('Versio palautettu');
        location.hash = '#/today';
      } catch (e) { err(e); }
      render();
    },
    'acc-password': async () => {
      const v = await ui.form({ title: 'Vaihda salasana', ok: 'Vaihda', fields: [
        { name: 'old', label: 'Nykyinen salasana', type: 'password', required: true, autocomplete: 'current-password' },
        { name: 'password', label: 'Uusi salasana', type: 'password', required: true, autocomplete: 'new-password', hint: 'Vähintään 8 merkkiä' },
        { name: 'password2', label: 'Uusi salasana uudelleen', type: 'password', required: true, autocomplete: 'new-password' }
      ] });
      if (!v || v.__action) return;
      if (v.password !== v.password2) return err('Salasanat eivät täsmää');
      try { await busy('Vaihdetaan…', () => C.changePassword(v.old, v.password)); ui.toast('Salasana vaihdettu'); } catch (e) { err(e); }
    },
    'acc-logout': async () => {
      const ok = await ui.confirm({ title: 'Kirjaudutaanko ulos?', text: 'Tiedot jäävät tähän puhelimeen, mutta niitä ei enää varmuuskopioida. Pilven kopiot säilyvät, ja saat ne takaisin kirjautumalla.', ok: 'Kirjaudu ulos' });
      if (!ok) return;
      await C.upload().catch(() => {});
      await C.logout();
      ui.toast('Kirjauduttu ulos');
      render();
    },
    'acc-delete': async () => {
      const ok = await ui.confirm({ title: 'Poistetaanko tili?', text: 'Tili, kirjautumistavat ja kaikki pilven varmuuskopiot poistetaan palvelimelta pysyvästi. Tämän puhelimen tiedot säilyvät.', ok: 'Poista tili pysyvästi', danger: true });
      if (!ok) return;
      try { await C.deleteAccount(); ui.toast('Tili ja pilvikopiot poistettu'); } catch (e) { err(e); }
      render();
    },
    'acc-passkey': async () => {
      try { await C.enablePasskey(); ui.toast('Face ID otettu käyttöön'); } catch (e) { err(e); }
      render();
    },
    'acc-google-link': async () => {
      await ui.sheet(`<h3 class="sheet-title">Yhdistä Google-tili</h3>
        <p class="sheet-text">Voit jatkossa kirjautua myös Googlella.</p>
        <p class="muted sm">${esc(GOOGLE_NOTE)}</p>
        <div class="g-btn" data-g></div>
        <div class="sheet-actions"><button class="btn btn-ghost btn-block" data-sheet="cancel">Peruuta</button></div>`, {
        onMount(el, close) {
          googleButton(el.querySelector('[data-g]'), async credential => {
            try { await C.googleLink(credential); close('ok'); ui.toast('Google-tili yhdistetty'); render(); } catch (e) { err(e); }
          }).catch(err);
        }
      });
    },
    'acc-google-unlink': async () => {
      if (!(await ui.confirm({ title: 'Poistetaanko Google-yhteys?', text: 'Googlella ei voi enää kirjautua, ja palvelimelle tallennettu salausavaimen kopio poistetaan.', ok: 'Poista yhteys' }))) return;
      try { await C.googleUnlink(); ui.toast('Google-yhteys poistettu'); } catch (e) { err(e); }
      render();
    }
  });

  // Päivitä tila-teksti asetuksissa, kun lähetys valmistuu
  C.onChange(() => { if (location.hash.startsWith('#/settings')) render(); });

  // Käynnistyksessä: hae toisen laitteen muutokset / lähetä odottavat
  setTimeout(() => {
    C.check();
    if (C.available()) C.info().then(() => { if (C.googleReady() && location.hash.startsWith('#/settings')) render(); });
  }, 1200);
})();
