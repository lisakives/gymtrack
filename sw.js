/* GymTrack – service worker
 *  - offline-tuki (verkko ensin, välimuisti varalla)
 *  - push-ilmoitusten vastaanotto ja näyttäminen myös sovelluksen ollessa suljettuna
 *  - ilmoituksen napautus avaa sovelluksen oikeaan kohtaan
 * Kun muutat sovelluksen tiedostoja, kasvata VERSION-numeroa, jotta
 * puhelin hakee uuden version. */
const VERSION = 'gymtrack-v9';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/motion.js',
  './js/storage.js',
  './js/model.js',
  './js/ui.js',
  './js/charts.js',
  './js/views.js',
  './js/config.js',
  './js/foods.js',
  './js/life.js',
  './js/openfood.js',
  './js/push.js',
  './js/lifeviews.js',
  './js/lifeactions.js',
  './js/cloud.js',
  './js/account.js',
  './js/app.js',
  './js/splash.js',
  './js/authgate.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== 'gt-push-config').map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Verkko ensin, välimuisti varalla: päivitykset tulevat heti kun verkko on saatavilla.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});

/* ---------------- Push-ilmoitukset ---------------- */
self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = { title: 'GymTrack', body: e.data ? e.data.text() : '' }; }
  const title = data.title || 'GymTrack';
  const opts = {
    body: data.body || '',
    tag: data.tag || 'gymtrack',
    renotify: true,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    timestamp: Date.now(),
    data: { url: data.url || './index.html#/today', rid: data.rid || null }
  };
  // Painikkeet näkyvät Androidilla ja tietokoneella; iPhone avaa sovelluksen, jossa valitaan Tehty/Torku.
  if (data.rid) opts.actions = [{ action: 'done', title: 'Tehty' }, { action: 'snooze', title: 'Torkuta 15 min' }];
  // iOS vaatii, että jokainen push näyttää ilmoituksen, muuten tilaus perutaan.
  e.waitUntil(self.registration.showNotification(title, opts));
});

async function pushConfig() {
  try {
    const c = await caches.open('gt-push-config');
    const r = await c.match('push-config');
    return r ? await r.json() : null;
  } catch (e) { return null; }
}

async function openApp(url) {
  const target = new URL(url, self.registration.scope).href;
  const hash = new URL(target).hash;
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const c of list) {
    if (c.url.startsWith(self.registration.scope)) {
      await c.focus();
      c.postMessage({ type: 'open', hash });
      return;
    }
  }
  await self.clients.openWindow(target);
}

self.addEventListener('notificationclick', e => {
  const n = e.notification;
  const d = n.data || {};
  n.close();
  if (e.action === 'snooze' && d.rid) {
    e.waitUntil(pushConfig().then(cfg => {
      if (!cfg || !cfg.server) return openApp(d.url);
      return fetch(cfg.server + '/api/snooze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: cfg.userId, secret: cfg.secret, rid: d.rid, minutes: 15, title: n.title, body: n.body })
      }).catch(() => openApp(d.url));
    }));
    return;
  }
  let url = d.url || './index.html#/today';
  if (e.action === 'done' && d.rid) url = './index.html#/today?r=' + encodeURIComponent(d.rid);
  e.waitUntil(openApp(url));
});

// Selain voi vaihtaa tilauksen (esim. avainten uusiminen). Sovellus päivittää sen palvelimelle seuraavalla avauksella.
self.addEventListener('pushsubscriptionchange', () => { /* käsitellään sovelluksen käynnistyksessä (GT.push.verify) */ });
