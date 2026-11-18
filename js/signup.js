/* GymTrack – vaiheittainen tilinluonti
 *  1. Käyttäjänimi (saatavuus tarkistetaan kirjoittaessa)
 *  2. Salasana (vahvuusmittari, näytä/piilota)
 *  3. Palautuskoodi (kopioi / jaa, vahvistus ennen jatkamista)
 *  4. Face ID (jos laite tukee)
 *  5. Valmis
 */
(function () {
  'use strict';

  const ui = GT.ui, { esc, icon } = ui;
  const C = GT.cloud;
  const S = () => GT.Store.get();

  const COMMON = ['salasana', 'password', '12345678', '123456789', 'qwertyui', 'qwerty123', 'salasana1', 'password1', '11111111', 'gymtrack', 'iloveyou', 'abcdefgh'];

  /** Salasanan vahvuus 0–4 ja kuvaus */
  function strength(pw, username) {
    if (!pw) return { score: 0, label: '' };
    if (pw.length < 8) return { score: 0, label: 'Liian lyhyt – vähintään 8 merkkiä' };
    const low = pw.toLowerCase();
    if (COMMON.includes(low) || (username && low.includes(username.toLowerCase()))) return { score: 1, label: 'Helppo arvata' };
    let score = 1;
    if (pw.length >= 12) score++;
    if (pw.length >= 16) score++;
    const kinds = [/[a-zåäö]/, /[A-ZÅÄÖ]/, /\d/, /[^A-Za-z0-9åäöÅÄÖ]/].filter(r => r.test(pw)).length;
    if (kinds >= 3) score++;
    if (/^(.)\1+$/.test(pw)) score = 1;
    score = Math.min(4, score);
    return { score, label: ['', 'Heikko', 'Kohtalainen', 'Hyvä', 'Vahva'][score] };
  }

  const STEPS = ['Käyttäjänimi', 'Salasana', 'Palautuskoodi', 'Face ID', 'Valmis'];
  const eye = '<svg class="ic" viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const eyeOff = '<svg class="ic" viewBox="0 0 24 24"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.3 4.2M6.6 6.6C3.9 8.3 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

  /**
   * Käynnistää ohjatun tilinluonnin annettuun elementtiin.
   * opts: { prefill, onStep(i), onFinish(), onCancel() }
   */
  function start(host, opts = {}) {
    const st = { step: 0, username: opts.prefill || '', password: '', code: '', saved: false, faceId: null, busy: false };
    let checkTimer = null, checkSeq = 0, avail = null, passkeyOk = false;
    C.passkeySupported().then(v => { passkeyOk = v; });

    const progress = () => {
      const steps = passkeyOk ? STEPS : STEPS.filter(x => x !== 'Face ID');
      const idx = steps.indexOf(STEPS[st.step]);
      return `<div class="su-progress" aria-label="Vaihe ${idx + 1}/${steps.length}">
        <div class="su-bar"><i style="width:${((idx + 1) / steps.length) * 100}%"></i></div>
        <div class="su-meta"><span>Vaihe ${idx + 1}/${steps.length}</span><b>${STEPS[st.step]}</b></div></div>`;
    };

    function view() {
      switch (st.step) {
        case 0: return `
          <form class="su-step" data-step="0" novalidate>
            <div class="su-ic">${icon('user')}</div>
            <h2 class="su-title">Valitse käyttäjänimi</h2>
            <p class="su-text">Tällä nimellä kirjaudut. Sen ei tarvitse olla oikea nimesi, eikä sähköpostia kysytä.</p>
            <label class="field su-field"><span>Käyttäjänimi</span>
              <div class="su-input"><input name="username" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="32" value="${esc(st.username)}" placeholder="esim. roni_salilla" required><span class="su-state" data-state></span></div>
            </label>
            <p class="su-hint" data-hint>3–32 merkkiä: kirjaimet a–z, numerot sekä . _ -</p>
            <button class="btn btn-primary btn-block" type="submit" data-next disabled>Jatka</button>
          </form>`;
        case 1: return `
          <form class="su-step" data-step="1" novalidate>
            <input class="su-hidden-user" type="text" name="username" autocomplete="username" value="${esc(st.username)}" tabindex="-1" aria-hidden="true">
            <div class="su-ic">${icon('lock')}</div>
            <h2 class="su-title">Luo salasana</h2>
            <p class="su-text">Salasana ei koskaan lähde puhelimesta. Siitä muodostetaan avain, jolla tietosi salataan.</p>
            <label class="field su-field"><span>Salasana</span>
              <div class="su-input"><input name="password" type="password" autocomplete="new-password" value="${esc(st.password)}" required><button type="button" class="su-eye" data-eye aria-label="Näytä salasana">${eye}</button></div>
            </label>
            <div class="su-meter" data-meter><i></i><i></i><i></i><i></i></div>
            <p class="su-hint" data-strength>Vähintään 8 merkkiä. Pitkä lause on helppo muistaa ja vaikea arvata.</p>
            <label class="field su-field"><span>Salasana uudelleen</span>
              <div class="su-input"><input name="password2" type="password" autocomplete="new-password" required><span class="su-state" data-match></span></div>
            </label>
            <button class="btn btn-primary btn-block" type="submit" data-next disabled>Luo tili</button>
            <button class="btn btn-ghost btn-block sm" type="button" data-back>Takaisin</button>
          </form>`;
        case 2: return `
          <div class="su-step" data-step="2">
            <div class="su-ic ok">${icon('check')}</div>
            <h2 class="su-title">Tili luotu! Tallenna palautuskoodi</h2>
            <p class="su-text">Jos unohdat salasanan, tarvitset tämän koodin. Koska tietosi on salattu, kukaan muu ei voi palauttaa tiliä puolestasi.</p>
            <div class="recovery-code su-code" data-code>${esc(st.code)}</div>
            <div class="su-row">
              <button type="button" class="btn btn-soft" data-copy>Kopioi</button>
              ${navigator.share ? '<button type="button" class="btn btn-soft" data-share>Jaa…</button>' : ''}
            </div>
            <label class="su-check"><input type="checkbox" data-saved ${st.saved ? 'checked' : ''}><i></i><span>Olen tallentanut koodin turvalliseen paikkaan</span></label>
            <button class="btn btn-primary btn-block" type="button" data-next ${st.saved ? '' : 'disabled'}>Jatka</button>
          </div>`;
        case 3: return `
          <div class="su-step" data-step="3">
            <div class="su-ic faceid"><svg class="ic" viewBox="0 0 24 24"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9.5v1M15 9.5v1M12 9.5v3.5h-1M9.5 15.5a3.5 3.5 0 0 0 5 0"/></svg></div>
            <h2 class="su-title">Kirjaudu jatkossa Face ID:llä</h2>
            <p class="su-text">Ei salasanan kirjoittamista. Toimii myös uudessa iPhonessa, jossa on sama Apple ID. Salaus säilyy: palvelin ei näe tietojasi.</p>
            <button class="btn btn-primary btn-block" type="button" data-faceid>Ota Face ID käyttöön</button>
            <button class="btn btn-ghost btn-block sm" type="button" data-skip>Ei nyt</button>
          </div>`;
        default: return `
          <div class="su-step su-done" data-step="4">
            <div class="su-burst">${icon('check')}</div>
            <h2 class="su-title">Valmista, ${esc(st.username)}!</h2>
            <ul class="su-list">
              <li>${icon('cloud')}<span>Tiedot varmuuskopioituvat automaattisesti</span></li>
              <li>${icon('lock')}<span>Salattu puhelimessa – vain sinä voit avata ne</span></li>
              <li>${icon('upload')}<span>Uudessa puhelimessa riittää kirjautuminen</span></li>
              ${st.faceId ? `<li>${icon('user')}<span>Face ID käytössä</span></li>` : ''}
            </ul>
            <button class="btn btn-primary btn-block" type="button" data-finish>Aloita</button>
          </div>`;
      }
    }

    function render(dir = 1) {
      host.innerHTML = `<div class="su">${progress()}<div class="su-stage ${dir < 0 ? 'back' : ''}">${view()}</div></div>`;
      opts.onStep && opts.onStep(st.step);
      bind();
      const first = host.querySelector('.su-stage input:not([type=checkbox]):not(.su-hidden-user)');
      if (first && !('ontouchstart' in window)) setTimeout(() => first.focus(), 250);
    }
    const go = (n, dir = 1) => { st.step = n; render(dir); };

    function bind() {
      const q = sel => host.querySelector(sel);
      const form = q('form.su-step');
      if (form) form.addEventListener('submit', e => { e.preventDefault(); const b = q('[data-next]'); if (b && !b.disabled) b.click(); });
      const back = q('[data-back]');
      if (back) back.addEventListener('click', () => go(st.step - 1, -1));

      if (st.step === 0) {
        const inp = q('input[name=username]'), stEl = q('[data-state]'), hint = q('[data-hint]'), next = q('[data-next]');
        const set = (cls, text, ok) => { stEl.className = 'su-state ' + cls; hint.textContent = text; hint.className = 'su-hint ' + (cls === 'bad' ? 'warn-text' : cls === 'ok' ? 'ok-text' : ''); next.disabled = !ok; };
        const check = () => {
          const v = inp.value.trim().toLowerCase();
          st.username = v; avail = null;
          clearTimeout(checkTimer);
          if (!v) return set('', '3–32 merkkiä: kirjaimet a–z, numerot sekä . _ -', false);
          if (!/^[a-z0-9._-]*$/.test(v)) return set('bad', 'Sallittuja ovat vain a–z, 0–9 sekä . _ -', false);
          if (v.length < 3) return set('', 'Vielä ' + (3 - v.length) + ' merkkiä', false);
          set('wait', 'Tarkistetaan…', false);
          const seq = ++checkSeq;
          checkTimer = setTimeout(async () => {
            try {
              const r = await C.usernameAvailable(v);
              if (seq !== checkSeq) return;
              avail = r.available;
              set(r.available ? 'ok' : 'bad', r.available ? 'Käyttäjänimi on vapaana' : (r.reason || 'Käyttäjänimi on jo käytössä'), r.available);
            } catch (e) { if (seq === checkSeq) set('bad', e.message, false); }
          }, 350);
        };
        inp.addEventListener('input', check);
        if (st.username) check();
        next.addEventListener('click', () => { if (avail) go(1); });
      }

      if (st.step === 1) {
        const pw = q('input[name=password]'), pw2 = q('input[name=password2]'), meter = q('[data-meter]'), label = q('[data-strength]'), match = q('[data-match]'), next = q('[data-next]');
        const upd = () => {
          st.password = pw.value;
          const s = strength(pw.value, st.username);
          meter.dataset.score = s.score;
          label.textContent = s.label || 'Vähintään 8 merkkiä. Pitkä lause on helppo muistaa ja vaikea arvata.';
          label.className = 'su-hint ' + (pw.value && s.score <= 1 ? 'warn-text' : s.score >= 3 ? 'ok-text' : '');
          const same = pw2.value && pw2.value === pw.value;
          match.className = 'su-state ' + (!pw2.value ? '' : same ? 'ok' : 'bad');
          next.disabled = !(pw.value.length >= 8 && same && s.score >= 1);
        };
        pw.addEventListener('input', upd); pw2.addEventListener('input', upd);
        q('[data-eye]').addEventListener('click', e => {
          const show = pw.type === 'password';
          pw.type = pw2.type = show ? 'text' : 'password';
          e.currentTarget.innerHTML = show ? eyeOff : eye;
          e.currentTarget.setAttribute('aria-label', show ? 'Piilota salasana' : 'Näytä salasana');
        });
        upd();
        next.addEventListener('click', async () => {
          if (st.busy) return;
          st.busy = true; next.disabled = true;
          next.innerHTML = '<span class="su-spin"></span> Luodaan salattua tiliä…';
          try {
            if (C.status().needsLogin || C.loggedIn()) await C.logout();
            st.code = await C.register(st.username, st.password);
            st.password = '';
            opts.onCreated && opts.onCreated();
            go(2);
          } catch (e) {
            ui.toast(esc(e.message), 'error', 4200);
            next.disabled = false; next.textContent = 'Luo tili';
            if (/käytössä/.test(e.message)) go(0, -1);
          } finally { st.busy = false; }
        });
      }

      if (st.step === 2) {
        const next = q('[data-next]'), box = q('[data-saved]');
        box.addEventListener('change', () => { st.saved = box.checked; next.disabled = !box.checked; });
        q('[data-copy]').addEventListener('click', async e => {
          try { await navigator.clipboard.writeText(st.code); e.currentTarget.textContent = 'Kopioitu ✓'; } catch (err) { ui.toast('Kopiointi ei onnistunut – kirjoita koodi muistiin', 'error'); }
        });
        const sh = q('[data-share]');
        if (sh) sh.addEventListener('click', () => navigator.share({ title: 'GymTrack-palautuskoodi', text: 'GymTrack-palautuskoodi (käyttäjä ' + st.username + '): ' + st.code }).catch(() => {}));
        next.addEventListener('click', () => go(passkeyOk ? 3 : 4));
      }

      if (st.step === 3) {
        const b = q('[data-faceid]');
        b.addEventListener('click', async () => {
          b.disabled = true; b.innerHTML = '<span class="su-spin"></span> Odotetaan Face ID:tä…';
          try { await C.enablePasskey(); st.faceId = true; go(4); }
          catch (e) { ui.toast(esc(e.message), 'error', 4200); b.disabled = false; b.textContent = 'Ota Face ID käyttöön'; }
        });
        q('[data-skip]').addEventListener('click', () => { GT.Store.update(s => { s.account.passkeyOffered = true; }); go(4); });
      }

      if (st.step === 4) {
        if (GT.motion && GT.motion.celebrate) setTimeout(() => GT.motion.celebrate(), 200);
        q('[data-finish]').addEventListener('click', () => opts.onFinish && opts.onFinish());
      }
    }

    render();
    return { get step() { return st.step; } };
  }

  GT.signup = { start, strength };
})();
