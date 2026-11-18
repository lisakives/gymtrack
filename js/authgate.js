/* GymTrack – kirjautumissivu latausnäytön jälkeen
 *
 * Näytetään, kun pilvitili on käytettävissä eikä käyttäjä ole kirjautunut.
 * Välilehdet: Kirjaudu / Luo tili, sekä "Unohtuiko salasana?".
 * "Jatka ilman tiliä" muistetaan tällä laitteella; tilin voi luoda myöhemmin asetuksista.
 */
(function () {
  'use strict';

  const ui = GT.ui, { esc, icon } = ui;
  const C = GT.cloud, A = GT.accountView, Store = GT.Store;
  const S = () => Store.get();

  function shouldShow() {
    if (!C || !A || !C.available()) return false;
    const st = C.status();
    if (st.loggedIn && !st.needsLogin) return false;
    if (st.needsLogin) return true;
    return !(S().settings && S().settings.authSkipped);
  }

  let el = null, mode = 'login', prefill = '';

  const logo = `<div class="ag-logo"><svg viewBox="0 0 24 24"><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/></svg></div>
    <div class="ag-word">GYM<span>TRACK</span></div>`;

  const input = (name, label, type, ac, extra = '') =>
    `<label class="field"><span>${label}</span><input name="${name}" type="${type}" autocomplete="${ac}" ${extra} required></label>`;
  const userInput = () => input('username', 'Käyttäjänimi', 'text', 'username', `autocapitalize="none" autocorrect="off" spellcheck="false" value="${esc(prefill)}"`);

  function formHtml() {
    if (mode === 'forgot') {
      return `<form class="ag-form" data-mode="forgot" novalidate>
        <h2 class="ag-title">Unohtuiko salasana?</h2>
        <p class="muted sm">Anna käyttäjänimi ja tiliä luodessa saamasi palautuskoodi, ja valitse uusi salasana.</p>
        ${userInput()}
        ${input('code', 'Palautuskoodi', 'text', 'off', 'autocapitalize="characters" spellcheck="false" placeholder="XXXXX-XXXXX-XXXXX-XXXXX"')}
        ${input('password', 'Uusi salasana', 'password', 'new-password', 'minlength="8"')}
        ${input('password2', 'Uusi salasana uudelleen', 'password', 'new-password')}
        <button class="btn btn-primary btn-block" type="submit">Vaihda salasana</button>
        <button class="btn btn-ghost btn-block sm" type="button" data-ag="login">Takaisin kirjautumiseen</button>
        <p class="muted sm">Ilman palautuskoodia salasanaa ei voi vaihtaa, koska tietosi on salattu eikä palvelin pysty avaamaan niitä.</p>
      </form>`;
    }
    const reg = mode === 'register';
    return `<div class="ag-tabs" role="tablist">
        <button type="button" class="${reg ? '' : 'on'}" data-ag="login" role="tab" aria-selected="${!reg}">Kirjaudu</button>
        <button type="button" class="${reg ? 'on' : ''}" data-ag="register" role="tab" aria-selected="${reg}">Luo tili</button>
      </div>
      <form class="ag-form" data-mode="${mode}" novalidate>
        ${C.status().needsLogin && !reg ? '<p class="sm warn-text">Salasana on vaihdettu toisella laitteella. Kirjaudu uudelleen.</p>' : ''}
        ${userInput()}
        ${reg
          ? input('password', 'Salasana', 'password', 'new-password', 'minlength="8"') + input('password2', 'Salasana uudelleen', 'password', 'new-password')
          : input('password', 'Salasana', 'password', 'current-password')}
        ${reg ? '<p class="muted sm">Käyttäjänimi: 3–32 merkkiä (a–z, 0–9, . _ -). Salasana: vähintään 8 merkkiä.</p>' : ''}
        <button class="btn btn-primary btn-block" type="submit">${reg ? 'Luo tili' : 'Kirjaudu'}</button>
        ${reg ? '' : '<button class="btn btn-ghost btn-block sm" type="button" data-ag="forgot">Unohtuiko salasana?</button>'}
      </form>`;
  }

  function render() {
    if (!el) return;
    const body = el.querySelector('.ag-body');
    el.classList.remove('ag-wizard');
    if (mode === 'register' && GT.signup) {
      body.innerHTML = `<div class="ag-tabs" role="tablist">
          <button type="button" data-ag="login" role="tab" aria-selected="false">Kirjaudu</button>
          <button type="button" class="on" data-ag="register" role="tab" aria-selected="true">Luo tili</button>
        </div><div class="su-host"></div>`;
      GT.signup.start(body.querySelector('.su-host'), {
        prefill,
        onStep: i => { if (el) { el.classList.toggle('ag-wizard', i > 0); el.scrollTop = 0; } },
        onFinish: () => { close(); ui.toast('Tervetuloa! Tiedot varmuuskopioidaan nyt automaattisesti.'); }
      });
      return;
    }
    body.innerHTML = formHtml();
  }

  function close() {
    if (!el) return;
    const node = el; el = null;
    node.classList.add('out');
    setTimeout(() => node.remove(), 450);
    if (GT.render) GT.render();
  }

  async function submit(form) {
    const f = form.elements, m = form.dataset.mode;
    const v = name => (f[name] ? f[name].value.trim() : '');
    const btn = form.querySelector('button[type="submit"]');
    const missing = [...form.querySelectorAll('input[required]')].filter(i => !i.value.trim());
    form.querySelectorAll('input').forEach(i => i.classList.toggle('invalid', missing.includes(i)));
    if (missing.length) return ui.toast('Täytä kaikki kentät', 'error');
    if ((m === 'register' || m === 'forgot') && f.password.value !== f.password2.value) return ui.toast('Salasanat eivät täsmää', 'error');
    prefill = v('username');
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = m === 'register' ? 'Luodaan tiliä…' : m === 'forgot' ? 'Vaihdetaan…' : 'Kirjaudutaan…';
    try {
      if (m === 'register') {
        if (C.status().needsLogin) await C.logout();
        const code = await C.register(v('username'), f.password.value);
        close();
        await A.showRecoveryCode(code);
        ui.toast('Tili luotu. Tiedot varmuuskopioidaan nyt automaattisesti.');
      } else {
        if (C.status().needsLogin) await C.logout();
        const remote = m === 'forgot'
          ? await C.resetPassword(v('username'), v('code'), f.password.value)
          : await C.login(v('username'), f.password.value);
        close();
        if (m === 'forgot') ui.toast('Salasana vaihdettu');
        await A.afterLogin(remote);
      }
      if (GT.render) GT.render();
      await A.offerPasskey();
    } catch (e) {
      ui.toast(esc(e && e.message ? e.message : String(e)), 'error', 4200);
      btn.disabled = false; btn.textContent = label;
    }
  }

  async function passkey(btn) {
    btn.disabled = true;
    try {
      if (C.status().needsLogin) await C.logout();
      const remote = await C.passkeyLogin();
      close();
      await A.afterLogin(remote);
      if (GT.render) GT.render();
    } catch (e) { ui.toast(esc(e && e.message ? e.message : String(e)), 'error', 4200); }
    btn.disabled = false;
  }

  /** Face ID- ja Google-painikkeet näytetään vain, jos ne ovat käytettävissä. */
  async function setupAlt() {
    const alt = el && el.querySelector('.ag-alt');
    if (!alt) return;
    const [pk, gid] = await Promise.all([C.passkeySupported(), C.googleClientId()]);
    if (!el) return;
    if (pk) alt.querySelector('.ag-passkey').hidden = false;
    if (gid) {
      const g = alt.querySelector('[data-g]');
      g.hidden = false; alt.querySelector('.ag-gnote').hidden = false;
      alt.hidden = false;
      A.googleButton(g, credential => A.googleFlow(credential, () => close())).catch(() => { g.hidden = true; alt.querySelector('.ag-gnote').hidden = true; });
    }
    if (pk || gid) alt.hidden = false;
  }

  function open(startMode) {
    if (el) return;
    const st = C.status();
    mode = startMode || (S().sessions.some(x => x.endedAt) || st.needsLogin ? 'login' : 'register');
    prefill = (S().account && S().account.username) || '';
    el = document.createElement('div');
    el.id = 'authgate';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = `<div class="ag-inner">
        <div class="ag-head">${logo}</div>
        <p class="ag-lead">Kirjaudu, niin treenit, ruoat ja mittaukset tallentuvat pilveen automaattisesti ja palautuvat uuteen puhelimeen.</p>
        <div class="ag-body"></div>
        <div class="ag-alt" hidden>
          <div class="ag-or"><span>tai</span></div>
          <button type="button" class="btn btn-soft btn-block ag-passkey" data-ag="passkey" hidden>${icon('lock')} Kirjaudu Face ID:llä</button>
          <div class="g-btn" data-g hidden></div>
          <p class="muted sm ag-gnote" hidden>${esc(A.GOOGLE_NOTE)}</p>
        </div>
        <p class="muted sm ag-privacy">${icon('lock')} ${esc(A.PRIVACY)}</p>
        <button type="button" class="btn btn-ghost btn-block sm ag-skip" data-ag="skip">Jatka ilman tiliä</button>
      </div>`;
    document.body.appendChild(el);
    render();
    setupAlt();
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-ag]');
      if (!b) return;
      e.preventDefault();
      const a = b.dataset.ag;
      if (a === 'passkey') { passkey(b); return; }
      if (a === 'skip') {
        Store.update(s => { s.settings.authSkipped = true; });
        close();
        ui.toast('Voit luoda tilin myöhemmin asetuksista');
        return;
      }
      const u = el.querySelector('input[name="username"]');
      if (u) prefill = u.value.trim();
      mode = a; render();
    });
    el.addEventListener('submit', e => { e.preventDefault(); submit(e.target); });
  }

  GT.authGate = { open, close, shouldShow };
  if (shouldShow()) open();
})();
