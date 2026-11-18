/* GymTrack – käyttäjätili ja automaattinen, salattu pilvivarmuuskopio
 *
 * Tietosuoja:
 *  - Salasana ja palautuskoodi eivät lähde laitteelta. Niistä johdetaan PBKDF2:lla
 *    (150 000 kierrosta) kirjautumisavain, jonka tiivisteen palvelin tallentaa,
 *    ja salausavain, joka pysyy laitteella.
 *  - Tiedot pakataan ja salataan laitteella (AES-256-GCM) satunnaisella
 *    tietoavaimella ennen lähetystä. Palvelin näkee vain salattua dataa.
 *  - Tietoavain on palvelimella vain salasanalla ja palautuskoodilla lukittuna.
 *    Jos sekä salasana että palautuskoodi katoavat, pilvikopiota ei voi avata.
 *  - Sähköpostia ei kysytä.
 *
 * Synkronointi: muutokset lähetetään muutaman sekunnin viiveellä ja sovelluksen
 * siirtyessä taustalle. Käynnistyessä tarkistetaan, onko toinen laite tallentanut
 * uudemman version, ja se otetaan käyttöön (uudempi voittaa).
 */
(function () {
  'use strict';

  const enc = new TextEncoder(), dec = new TextDecoder();
  const META_KEY = 'gymtrack.cloud';
  const ITER = 150000;
  const RC_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  /* ---------- Salaus (myös testattavissa Nodessa) ---------- */
  const b64u = buf => {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const unb64u = s => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
  const subtle = () => crypto.subtle;

  const normUser = u => String(u || '').trim().toLowerCase();
  const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  /** Johtaa salaisuudesta kirjautumisavaimen (lähetetään) ja salausavaimen (ei lähetetä). */
  async function derive(secret, username, purpose) {
    const base = await subtle().importKey('raw', enc.encode(String(secret).normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('gymtrack:' + purpose + ':' + normUser(username)), iterations: ITER }, base, 512));
    const kek = await subtle().importKey('raw', bits.slice(32), 'AES-GCM', false, ['encrypt', 'decrypt']);
    return { authKey: b64u(bits.slice(0, 32)), kek };
  }

  async function aesEncrypt(key, bytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, bytes));
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
    return out;
  }
  async function aesDecrypt(key, bytes) {
    return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12)));
  }
  const dekKey = raw => subtle().importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

  const wrapKey = async (dekRaw, kek) => b64u(await aesEncrypt(kek, dekRaw));
  async function unwrapKey(wrapped, kek) {
    try { return await aesDecrypt(kek, unb64u(wrapped)); }
    catch (e) { throw new Error('Salausavaimen avaus epäonnistui'); }
  }

  async function pipe(bytes, stream) {
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  }
  /** Muoto: [1 tavu: 1 = gzip, 0 = pakkaamaton] + iv + salattu data, base64url */
  async function encryptText(text, dekRaw) {
    let bytes = enc.encode(text), flag = 0;
    if (typeof CompressionStream !== 'undefined') { bytes = await pipe(bytes, new CompressionStream('gzip')); flag = 1; }
    const sealed = await aesEncrypt(await dekKey(dekRaw), bytes);
    const out = new Uint8Array(1 + sealed.length); out[0] = flag; out.set(sealed, 1);
    return b64u(out);
  }
  async function decryptText(data, dekRaw) {
    const all = unb64u(data);
    let bytes;
    try { bytes = await aesDecrypt(await dekKey(dekRaw), all.slice(1)); }
    catch (e) { throw new Error('Varmuuskopion avaus epäonnistui'); }
    if (all[0] === 1) bytes = await pipe(bytes, new DecompressionStream('gzip'));
    return dec.decode(bytes);
  }
  async function keyedHash(text, dekRaw) {
    const k = await subtle().importKey('raw', dekRaw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return b64u(await subtle().sign('HMAC', k, enc.encode(text))).slice(0, 32);
  }

  function recoveryCode() {
    let out = '';
    while (out.length < 20) {
      const b = crypto.getRandomValues(new Uint8Array(32));
      for (const x of b) if (x < 248 && out.length < 20) out += RC_ALPHABET[x % 31];
    }
    return out.match(/.{5}/g).join('-');
  }

  const crypt = { derive, wrapKey, unwrapKey, encryptText, decryptText, keyedHash, recoveryCode, normCode, normUser, b64u, unb64u };
  const root = typeof window !== 'undefined' ? window : globalThis;
  root.GT = root.GT || {};
  root.GT.cloudCrypto = crypt;
  if (typeof document === 'undefined' || !root.GT.Store) return; // palvelimen testit käyttävät vain salausosaa

  /* ---------- Paikallinen tila (ei kuulu varmuuskopioon) ---------- */
  function meta() { try { return JSON.parse(localStorage.getItem(META_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function setMeta(patch) {
    const m = patch === null ? {} : Object.assign(meta(), patch);
    try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) { /* */ }
    return m;
  }

  const S = () => GT.Store.get();
  const server = () => (GT.push && GT.push.server ? GT.push.server() : (GT.PUSH_SERVER || '').replace(/\/+$/, ''));
  const available = () => !GT.EMBEDDED && !!server() && !!(window.crypto && crypto.subtle);
  const loggedIn = () => !!(S().account && S().account.username && meta().dek);

  async function api(path, body) {
    const base = server();
    if (!base) throw new Error('Palvelinta ei ole määritetty');
    let res;
    try {
      res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch (e) { const err = new Error('Ei yhteyttä palvelimeen'); err.offline = true; throw err; }
    let data = {};
    try { data = await res.json(); } catch (e) { /* */ }
    if (!res.ok) { const err = new Error(data.error || ('Palvelinvirhe ' + res.status)); err.status = res.status; throw err; }
    return data;
  }

  function ensureIdentity() {
    const p = S().push || {};
    if (!p.userId || !p.secret) {
      const rand = n => b64u(crypto.getRandomValues(new Uint8Array(n)));
      GT.Store.update(s => { s.push = s.push || {}; s.push.userId = 'u_' + rand(16); s.push.secret = rand(24); });
      GT.Store.saveNow();
    }
    return { userId: S().push.userId, secret: S().push.secret };
  }
  const ident = () => ({ userId: S().push.userId, secret: S().push.secret });

  /** Varmuuskopioitava kopio: laitekohtaiset tiedot (push) jätetään pois. */
  function snapshot() {
    const copy = Object.assign({}, S());
    delete copy.push; delete copy.account;
    const updatedAt = copy.updatedAt; delete copy.updatedAt;
    const body = JSON.stringify(copy);
    return { body, full: JSON.stringify(Object.assign(copy, { updatedAt })) };
  }

  /** Ottaa pilvestä haetun tilan käyttöön säilyttäen tämän laitteen ilmoitusasetukset ja tilin. */
  function applyRemote(remote, hash) {
    const local = S();
    const merged = Object.assign({}, remote, { push: local.push, account: local.account });
    setMeta({ uploadedHash: hash, remoteHash: hash });
    GT.Store.importJSON(JSON.stringify(merged));
  }

  function hasLocalData(st = S()) {
    return (st.sessions || []).some(x => x.endedAt) || (st.measurements || []).length > 0 || ((st.food && st.food.entries) || []).length > 0;
  }

  /* ---------- Lähetys ja haku ---------- */
  let timer = null, busy = null, notify = () => {};

  async function upload(force) {
    if (!available() || !loggedIn()) return null;
    if (busy) { await busy.catch(() => {}); }
    const run = (async () => {
      const m = meta();
      const dek = unb64u(m.dek);
      const snap = snapshot();
      const hash = await keyedHash(snap.body, dek);
      if (!force && hash === m.uploadedHash) return { skipped: true };
      const data = await encryptText(snap.full, dek);
      const r = await api('/api/backup/put', { ...ident(), data, hash });
      setMeta({ uploadedHash: hash, remoteHash: hash, lastOkAt: r.at, lastError: null });
      return r;
    })();
    busy = run;
    try { return await run; }
    catch (e) { handleError(e); throw e; }
    finally { if (busy === run) busy = null; notify(); }
  }

  function handleError(e) {
    if (e.status === 403 || e.status === 404) {
      setMeta({ lastError: 'Kirjaudu uudelleen: salasana on vaihdettu toisella laitteella.', needsLogin: true });
    } else setMeta({ lastError: e.offline ? 'Ei verkkoyhteyttä – lähetetään, kun yhteys palaa.' : e.message });
  }

  function schedule(delay = 5000) {
    if (!available() || !loggedIn()) return;
    clearTimeout(timer);
    timer = setTimeout(() => { upload().catch(() => { clearTimeout(timer); timer = setTimeout(() => schedule(0), 60000); }); }, delay);
  }

  async function fetchRemote(day) {
    const r = await api('/api/backup/get', { ...ident(), ...(day ? { day } : {}) });
    const text = await decryptText(r.data, unb64u(meta().dek));
    return { state: JSON.parse(text), hash: r.hash, at: r.at, day: r.day };
  }

  /** Käynnistyksessä ja sovellukseen palatessa: hakee toisen laitteen tekemät muutokset. */
  async function check() {
    if (!available() || !loggedIn()) return;
    try {
      const m = meta();
      const head = (await api('/api/backup/head', ident())).latest;
      const dek = unb64u(m.dek);
      const localHash = await keyedHash(snapshot().body, dek);
      const localDirty = localHash !== m.uploadedHash;
      if (head && head.hash && head.hash !== m.remoteHash && head.hash !== localHash) {
        const remote = await fetchRemote();
        const remoteNewer = !localDirty || String(remote.state.updatedAt || '') > String(S().updatedAt || '');
        if (remoteNewer) {
          applyRemote(remote.state, remote.hash);
          setMeta({ lastOkAt: remote.at, lastError: null });
          if (GT.ui) GT.ui.toast('Tiedot päivitetty pilvestä');
          if (GT.render) GT.render();
          return;
        }
      }
      if (localDirty || !head) await upload();
      else setMeta({ lastError: null });
    } catch (e) { handleError(e); }
    finally { notify(); }
  }

  /* ---------- Tilitoiminnot ---------- */
  function checkPassword(pw) {
    if (String(pw || '').length < 8) throw new Error('Salasanassa pitää olla vähintään 8 merkkiä');
  }
  function checkUsername(u) {
    if (!/^[a-z0-9._-]{3,32}$/.test(normUser(u))) throw new Error('Käyttäjänimessä saa olla 3–32 merkkiä: a–z, 0–9, piste, viiva tai alaviiva');
  }

  async function register(username, password) {
    checkUsername(username); checkPassword(password);
    const user = normUser(username);
    const code = recoveryCode();
    const [pw, rc] = await Promise.all([derive(password, user, 'pw'), derive(normCode(code), user, 'rc')]);
    const dek = crypto.getRandomValues(new Uint8Array(32));
    await api('/api/account/register', {
      ...ensureIdentity(), username: user, pwKey: pw.authKey, recoveryKey: rc.authKey,
      pwWrap: await wrapKey(dek, pw.kek), rcWrap: await wrapKey(dek, rc.kek)
    });
    setMeta(null);
    setMeta({ dek: b64u(dek) });
    GT.Store.update(s => { s.account = { username: user, since: new Date().toISOString() }; });
    GT.Store.saveNow();
    await upload(true).catch(() => {});
    return code;
  }

  /** Vaihtaa laitteen tunnisteen tilin tunnisteeseen ja palauttaa pilvikopion tiedot (ei vielä käyttöön). */
  async function adopt(res, dek) {
    const wasSubscribed = !!(S().push && S().push.subscribed);
    setMeta(null);
    setMeta({ dek: b64u(dek) });
    GT.Store.update(s => {
      s.push = s.push || {};
      s.push.userId = res.userId; s.push.secret = res.secret;
      s.account = { username: res.username, since: new Date().toISOString() };
    });
    GT.Store.saveNow();
    if (wasSubscribed && GT.push && GT.push.enable) GT.push.enable().catch(() => {});
    if (GT.push && GT.push.writeSwConfig) GT.push.writeSwConfig();
    let remote = null;
    try { remote = await fetchRemote(); } catch (e) { if (e.status !== 404) throw e; }
    return remote;
  }

  async function login(username, password) {
    checkUsername(username);
    if (!password) throw new Error('Kirjoita salasana');
    const user = normUser(username);
    const pw = await derive(password, user, 'pw');
    const res = await api('/api/account/login', { username: user, pwKey: pw.authKey });
    const dek = await unwrapKey(res.wrap, pw.kek);
    return adopt(res, dek);
  }

  async function resetPassword(username, code, newPassword) {
    checkUsername(username); checkPassword(newPassword);
    const user = normUser(username);
    if (normCode(code).length !== 20) throw new Error('Palautuskoodissa on 20 merkkiä');
    const rc = await derive(normCode(code), user, 'rc');
    const { wrap } = await api('/api/account/recover', { username: user, recoveryKey: rc.authKey });
    const dek = await unwrapKey(wrap, rc.kek);
    const pw = await derive(newPassword, user, 'pw');
    const res = await api('/api/account/reset', { username: user, recoveryKey: rc.authKey, newPwKey: pw.authKey, newPwWrap: await wrapKey(dek, pw.kek) });
    return adopt(res, dek);
  }

  async function changePassword(oldPassword, newPassword) {
    checkPassword(newPassword);
    const user = S().account.username;
    const [oldK, newK] = await Promise.all([derive(oldPassword, user, 'pw'), derive(newPassword, user, 'pw')]);
    await api('/api/account/password', { username: user, pwKey: oldK.authKey, newPwKey: newK.authKey, newPwWrap: await wrapKey(unb64u(meta().dek), newK.kek) });
  }

  /** Kirjautuu ulos: tiedot jäävät laitteelle, mutta laite saa uuden tunnisteen eikä enää lähetä tilille. */
  async function logout() {
    const wasSubscribed = !!(S().push && S().push.subscribed);
    clearTimeout(timer);
    setMeta(null);
    GT.Store.update(s => { s.account = null; s.push.userId = null; s.push.secret = null; });
    ensureIdentity();
    if (wasSubscribed && GT.push && GT.push.enable) await GT.push.enable().catch(() => {});
    if (GT.push && GT.push.writeSwConfig) GT.push.writeSwConfig();
  }

  async function deleteAccount(password) {
    const user = S().account.username;
    if (password) {
      const pw = await derive(password, user, 'pw');
      await api('/api/account/delete', { username: user, pwKey: pw.authKey });
    } else await api('/api/account/delete', ident());
    await logout();
  }

  /* ---------- Face ID (pääsyavain) ---------- */
  const PRF_SALT = enc.encode('gymtrack-prf-salt-v1-000000000000').slice(0, 32);
  const rpId = () => location.hostname;

  async function passkeySupported() {
    try {
      return !!(window.PublicKeyCredential && navigator.credentials && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    } catch (e) { return false; }
  }
  async function prfKey(first) {
    const base = await subtle().importKey('raw', new Uint8Array(first), 'HKDF', false, ['deriveKey']);
    return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('gymtrack'), info: enc.encode('passkey-kek') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  const prfUnsupported = () => new Error('Tämä laite ei tue Face ID -salausta. Päivitä iOS 18:aan tai uudempaan, tai kirjaudu salasanalla.');
  const webauthnError = e => (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) ? new Error('Face ID peruttiin') : e;

  /** Ottaa Face ID -kirjautumisen käyttöön kirjautuneelle tilille. */
  async function enablePasskey() {
    if (!loggedIn()) throw new Error('Kirjaudu ensin');
    const { challenge, username } = await api('/api/passkey/challenge', { ...ident(), purpose: 'register' });
    let cred;
    try {
      cred = await navigator.credentials.create({ publicKey: {
        rp: { name: 'GymTrack', id: rpId() },
        user: { id: enc.encode(username), name: username, displayName: username },
        challenge: unb64u(challenge),
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
        attestation: 'none', timeout: 120000,
        extensions: { prf: { eval: { first: PRF_SALT } } }
      } });
    } catch (e) { throw webauthnError(e); }
    const ext = cred.getClientExtensionResults ? cred.getClientExtensionResults() : {};
    let first = ext.prf && ext.prf.results && ext.prf.results.first;
    if (!first) {
      if (ext.prf && ext.prf.enabled === false) throw prfUnsupported();
      // Osa laitteista antaa PRF-arvon vasta kirjautuessa: haetaan se heti
      let a;
      try {
        a = await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rpId: rpId(), allowCredentials: [{ type: 'public-key', id: cred.rawId }], userVerification: 'required', extensions: { prf: { eval: { first: PRF_SALT } } } } });
      } catch (e) { throw webauthnError(e); }
      const r = a.getClientExtensionResults().prf;
      first = r && r.results && r.results.first;
      if (!first) throw prfUnsupported();
    }
    const resp = cred.response;
    const publicKey = resp.getPublicKey ? resp.getPublicKey() : null;
    if (!publicKey) throw new Error('Selain ei tue pääsyavaimia');
    await api('/api/passkey/register', {
      ...ident(), credId: b64u(cred.rawId), clientDataJSON: b64u(resp.clientDataJSON),
      publicKey: b64u(publicKey), alg: resp.getPublicKeyAlgorithm(), name: /iPhone/.test(navigator.userAgent) ? 'iPhone' : 'Face ID',
      prfWrap: await wrapKey(unb64u(meta().dek), await prfKey(first))
    });
    GT.Store.update(s => { s.account.passkey = true; });
    return true;
  }

  async function passkeyLogin() {
    const { challenge } = await api('/api/passkey/challenge', { purpose: 'login' });
    let a;
    try {
      a = await navigator.credentials.get({ publicKey: { challenge: unb64u(challenge), rpId: rpId(), userVerification: 'required', timeout: 120000, extensions: { prf: { eval: { first: PRF_SALT } } } } });
    } catch (e) { throw webauthnError(e); }
    const r = a.getClientExtensionResults().prf;
    const first = r && r.results && r.results.first;
    if (!first) throw prfUnsupported();
    const res = await api('/api/passkey/login', {
      credId: b64u(a.rawId), clientDataJSON: b64u(a.response.clientDataJSON),
      authenticatorData: b64u(a.response.authenticatorData), signature: b64u(a.response.signature)
    });
    const dek = await unwrapKey(res.wrap, await prfKey(first));
    const remote = await adopt(res, dek);
    GT.Store.update(s => { s.account.passkey = true; });
    return remote;
  }

  const methods = () => api('/api/passkey/list', ident());
  const deletePasskey = credId => api('/api/passkey/delete', { ...ident(), credId });

  /* ---------- Google ---------- */
  let serverInfo = null;
  async function info() {
    if (serverInfo) return serverInfo;
    try { serverInfo = await (await fetch(server() + '/api/health')).json(); } catch (e) { serverInfo = {}; }
    return serverInfo;
  }
  async function googleClientId() { return (await info()).googleClientId || null; }
  const googleReady = () => !!(serverInfo && serverInfo.googleClientId);

  /** Kirjautuu Google-tunnisteella. Palauttaa { needsSignup: true }, jos Google-tiliä ei ole vielä yhdistetty. */
  async function googleLogin(credential) {
    const res = await api('/api/google/login', { credential });
    if (!res.linked) return { needsSignup: true };
    const remote = await adopt(res, unb64u(res.dek));
    GT.Store.update(s => { s.account.google = true; });
    return { remote };
  }

  /** Luo uuden tilin Google-tunnisteella. Palauttaa palautuskoodin. */
  async function googleSignup(credential) {
    const user = 'google-' + Array.from(crypto.getRandomValues(new Uint8Array(3)), b => b.toString(16).padStart(2, '0')).join('');
    const code = recoveryCode();
    const rc = await derive(normCode(code), user, 'rc');
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const res = await api('/api/google/signup', { ...ensureIdentity(), credential, username: user, recoveryKey: rc.authKey, rcWrap: await wrapKey(dek, rc.kek), dek: b64u(dek) });
    setMeta(null);
    setMeta({ dek: b64u(dek) });
    GT.Store.update(s => { s.account = { username: res.username, since: new Date().toISOString(), google: true }; });
    GT.Store.saveNow();
    await upload(true).catch(() => {});
    return code;
  }

  async function googleLink(credential) {
    await api('/api/google/link', { ...ident(), credential, dek: meta().dek });
    GT.Store.update(s => { s.account.google = true; });
  }
  async function googleUnlink() {
    await api('/api/google/unlink', ident());
    GT.Store.update(s => { s.account.google = false; });
  }

  const list = async () => (await api('/api/backup/list', ident())).backups || [];

  function status() {
    const m = meta(), a = S().account;
    return { available: available(), loggedIn: loggedIn(), username: a && a.username, lastOkAt: m.lastOkAt || null, lastError: m.lastError || null, needsLogin: !!m.needsLogin };
  }

  /* ---------- Kytkentä tallennukseen ---------- */
  GT.Store.registerSync({ name: 'cloud', push() { schedule(); } });
  document.addEventListener('visibilitychange', () => {
    if (!loggedIn()) return;
    if (document.visibilityState === 'hidden') { clearTimeout(timer); upload().catch(() => {}); }
    else check();
  });
  window.addEventListener('online', () => schedule(0));

  GT.cloud = Object.assign(crypt, {
    available, loggedIn, status, register, login, resetPassword, changePassword, logout, deleteAccount,
    passkeySupported, enablePasskey, passkeyLogin, methods, deletePasskey, googleClientId, googleReady, info, googleLogin, googleSignup, googleLink, googleUnlink,
    upload, check, list, fetchRemote, applyRemote, hasLocalData, onChange(fn) { notify = fn; }
  });
})();
