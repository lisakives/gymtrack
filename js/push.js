/* GymTrack – push-ilmoitusten asiakaspuoli
 *  - ilmoitusluvan pyytäminen ja Web Push -tilaus
 *  - tilauksen ja muistutusaikojen tallennus palvelimelle
 *  - torkku ja testi-ilmoitukset
 *  - tilannetiedot ilmoitusasetusnäkymään (asennus, lupa, palvelin)
 */
(function () {
  'use strict';

  const L = GT.life;
  const S = () => GT.Store.get();

  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
  const rand = n => b64u(crypto.getRandomValues(new Uint8Array(n)));

  function server() {
    const p = S().push || {};
    return (p.server || GT.PUSH_SERVER || '').replace(/\/+$/, '');
  }

  function identity() {
    const p = S().push;
    if (!p.userId || !p.secret) {
      GT.Store.update(s => { s.push.userId = 'u_' + rand(16); s.push.secret = rand(24); });
      GT.Store.saveNow();
    }
    return { userId: S().push.userId, secret: S().push.secret };
  }

  async function api(path, body, method = 'POST') {
    const base = server();
    if (!base) throw new Error('Ilmoituspalvelinta ei ole määritetty');
    const res = await fetch(base + path, method === 'GET' ? {} : {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...identity(), ...(GT.PUSH_APP_KEY ? { appKey: GT.PUSH_APP_KEY } : {}), ...body })
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* */ }
    if (!res.ok) throw new Error(data.error || ('Palvelinvirhe ' + res.status));
    return data;
  }

  /** Service worker lukee palvelimen osoitteen ja tunnisteen tästä (torkku ilmoituksen painikkeesta). */
  async function writeSwConfig() {
    try {
      const c = await caches.open('gt-push-config');
      await c.put('push-config', new Response(JSON.stringify({ server: server(), ...identity() }), { headers: { 'Content-Type': 'application/json' } }));
    } catch (e) { /* */ }
  }

  async function registration() {
    if (!('serviceWorker' in navigator)) return null;
    try { return await navigator.serviceWorker.ready; } catch (e) { return null; }
  }

  async function currentSubscription() {
    const reg = await registration();
    if (!reg || !reg.pushManager) return null;
    try { return await reg.pushManager.getSubscription(); } catch (e) { return null; }
  }

  /** Tilannekuva näkymää varten. */
  async function status() {
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    const sub = supported() ? await currentSubscription() : null;
    return { ios, standalone: standalone(), supported: supported(), permission: perm, server: server(), subscribed: !!sub && !!S().push.subscribed, endpointHost: sub ? new URL(sub.endpoint).host : null };
  }

  /** Ottaa ilmoitukset käyttöön. Kutsuttava suoraan napautuksesta (iOS vaatii). */
  async function enable() {
    if (!supported()) {
      if (ios && !standalone()) throw new Error('Lisää sovellus ensin Koti-valikkoon (Jaa → Lisää Koti-valikkoon) ja avaa se kotinäytöltä.');
      throw new Error('Tämä selain ei tue push-ilmoituksia.');
    }
    // Lupa pyydetään ensimmäisenä, jotta pyyntö on yhä osa käyttäjän napautusta.
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error(perm === 'denied'
      ? 'Ilmoitukset on estetty. Salli ne: Asetukset → Ilmoitukset → GymTrack → Salli ilmoitukset.'
      : 'Ilmoituslupaa ei annettu.');
    if (!server()) throw new Error('Lupa annettu, mutta ilmoituspalvelinta ei ole vielä otettu käyttöön. Katso ohjeet alta.');
    const reg = await registration();
    const { publicKey } = await api('/api/vapid', null, 'GET');
    let sub = await reg.pushManager.getSubscription();
    // Jos palvelimen avain on vaihtunut, vanha tilaus ei kelpaa
    if (sub && sub.options && sub.options.applicationServerKey && b64u(sub.options.applicationServerKey) !== publicKey) {
      await sub.unsubscribe(); sub = null;
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(publicKey) });
    await api('/api/subscribe', { subscription: sub.toJSON(), ua: navigator.userAgent, state: L.serverState(S()) });
    GT.Store.update(s => { s.push.subscribed = true; s.push.endpoint = sub.endpoint; s.push.lastSync = new Date().toISOString(); s.push.lastError = null; });
    lastSent = JSON.stringify(L.serverState(S()));
    await writeSwConfig();
    return true;
  }

  async function disable() {
    const sub = await currentSubscription();
    if (sub) {
      try { await api('/api/unsubscribe', { endpoint: sub.endpoint }); } catch (e) { /* palvelin ei vastaa: poistetaan silti */ }
      try { await sub.unsubscribe(); } catch (e) { /* */ }
    }
    GT.Store.update(s => { s.push.subscribed = false; s.push.endpoint = null; });
  }

  /* ---------- Synkronointi ---------- */
  let timer = null, lastSent = null, inflight = false;
  function scheduleSync(delay = 2500) {
    if (!server() || !S().push.subscribed) return;
    clearTimeout(timer);
    timer = setTimeout(syncNow, delay);
  }
  async function syncNow(force) {
    if (!server() || !S().push.subscribed || inflight) return;
    const state = L.serverState(S());
    const key = JSON.stringify(state);
    if (!force && key === lastSent) return;
    inflight = true;
    try {
      await api('/api/sync', { state });
      lastSent = key;
      GT.Store.update(s => { s.push.lastSync = new Date().toISOString(); s.push.lastError = null; });
    } catch (e) {
      GT.Store.update(s => { s.push.lastError = e.message; });
      clearTimeout(timer); timer = setTimeout(syncNow, 60000); // yritetään uudelleen
    } finally { inflight = false; }
  }

  async function snooze(r, minutes) {
    const until = Date.now() + minutes * 60000;
    GT.Store.update(s => { s.snoozed = s.snoozed || {}; s.snoozed[r.id] = until; });
    if (server() && S().push.subscribed) {
      await api('/api/snooze', { rid: r.id, minutes, title: r.title, body: (r.body || '') + ' (torkutettu)' });
    }
    return until;
  }

  const test = (delaySeconds = 0) => api('/api/test', { delaySeconds });
  const serverStatus = () => api('/api/status', {});

  /** Käynnistyksessä: tarkistaa, että tilaus on yhä voimassa, ja palauttaa sen tarvittaessa. */
  async function verify() {
    if (!supported() || !server()) return;
    await writeSwConfig();
    if (!S().push.subscribed) return;
    if (Notification.permission !== 'granted') { GT.Store.update(s => { s.push.subscribed = false; }); return; }
    const sub = await currentSubscription();
    if (!sub || sub.endpoint !== S().push.endpoint) {
      try { await enable(); } catch (e) { GT.Store.update(s => { s.push.lastError = e.message; }); }
    } else syncNow(true);
  }

  GT.push = { ios, standalone, supported, server, status, enable, disable, scheduleSync, syncNow, snooze, test, serverStatus, verify, writeSwConfig };
})();
