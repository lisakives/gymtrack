// Push-palvelimen testit: node --test test/
// D1 korvataan node:sqlite-pohjaisella shimillä ja push-palvelu
// fetch-mockilla, joka purkaa salatun viestin vastaanottajan avaimella.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker, { encryptPayload, b64u, unb64u, localParts, dueReminders, runSchedule, buildBody } from '../src/index.js';

/* ---------- D1-shim ---------- */
function makeD1() {
  const db = new DatabaseSync(':memory:');
  const stmt = (sql) => {
    let args = [];
    const s = {
      bind(...a) { args = a; return s; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; }
    };
    return s;
  };
  return { prepare: stmt, async batch(list) { for (const s of list) await s.run(); } };
}

/* ---------- Vastaanottajan puoli (RFC 8291) ---------- */
const enc = new TextEncoder();
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}
async function decrypt(body, uaKeys, uaPublicRaw, authSecret) {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const ct = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaKeys.privateKey, 256));
  const info = new Uint8Array([...enc.encode('WebPush: info\0'), ...uaPublicRaw, ...asPublic]);
  const ikm = await hkdf(authSecret, shared, info, 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const k = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, k, ct));
  let end = pt.length - 1;
  while (pt[end] === 0) end--;
  assert.equal(pt[end], 2, 'viimeisen tietueen erotin');
  return new TextDecoder().decode(pt.slice(0, end));
}

async function makeSubscriber(endpoint) {
  const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));
  const authSecret = crypto.getRandomValues(new Uint8Array(16));
  return { keys, pub, authSecret, subscription: { endpoint, keys: { p256dh: b64u(pub), auth: b64u(authSecret) } } };
}

/** Mock-push-palvelu: tarkistaa VAPID-allekirjoituksen ja purkaa viestin. */
function installPushMock(subscribers, vapidPublicKeyRef) {
  const received = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const sub = subscribers.find(s => s.subscription.endpoint === url);
    if (!sub) return new Response('gone', { status: 410 });
    const authz = init.headers.Authorization;
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(authz);
    assert.ok(m, 'VAPID-otsake');
    const [, h, c, sig, k] = m;
    const claims = JSON.parse(new TextDecoder().decode(unb64u(c)));
    assert.equal(claims.aud, new URL(url).origin);
    assert.ok(claims.exp > Date.now() / 1000 && claims.exp < Date.now() / 1000 + 24 * 3600);
    assert.match(claims.sub, /^(https:|mailto:)/);
    if (vapidPublicKeyRef.value) assert.equal(k, vapidPublicKeyRef.value);
    const pubKey = await crypto.subtle.importKey('raw', unb64u(k), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pubKey, unb64u(sig), enc.encode(h + '.' + c));
    assert.ok(ok, 'VAPID-allekirjoitus kelpaa');
    assert.equal(init.headers['Content-Encoding'], 'aes128gcm');
    assert.ok(+init.headers.TTL > 0);
    const text = await decrypt(new Uint8Array(init.body), sub.keys, sub.pub, sub.authSecret);
    received.push({ endpoint: url, payload: JSON.parse(text) });
    return new Response('', { status: 201 });
  };
  return { received, restore: () => { globalThis.fetch = origFetch; } };
}

const call = async (env, path, body, method = 'POST') => {
  const res = await worker.fetch(new Request('https://push.example' + path, method === 'GET' ? { method } : { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }), env);
  return { status: res.status, body: await res.json() };
};

/* ---------- Testit ---------- */
test('RFC 8291 -testivektori (salaus vastaa standardin esimerkkiä)', async () => {
  const asPub = unb64u('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
  const jwk = { kty: 'EC', crv: 'P-256', d: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', x: b64u(asPub.slice(1, 33)), y: b64u(asPub.slice(33, 65)), ext: true };
  const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publicKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
  const out = await encryptPayload('When I grow up, I want to be a watermelon',
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    'BTBZMqHH6r4Tts7J_aSIgg',
    { salt: unb64u('DGv6ra1nlYgDCS1FRnbzlw'), asKeyPair: { privateKey, publicKey } });
  assert.equal(b64u(out), 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
});

test('paikallinen aika Helsingissä (kesä- ja talviaika)', () => {
  assert.deepEqual(localParts(Date.UTC(2026, 0, 15, 7, 0), 'Europe/Helsinki'), { date: '2026-01-15', hm: '09:00', wd: 3 });
  assert.deepEqual(localParts(Date.UTC(2026, 6, 15, 6, 0), 'Europe/Helsinki'), { date: '2026-07-15', hm: '09:00', wd: 2 });
});

test('erääntyvät muistutukset: päivät, tehdyt ja pois päältä', () => {
  const data = { tz: 'Europe/Helsinki', reminders: [
    { id: 'a', time: '09:00', title: 'A' },
    { id: 'b', time: '09:00', title: 'B', days: [5, 6] },
    { id: 'c', time: '09:00', title: 'C', enabled: false },
    { id: 'd', time: '09:00', title: 'D' },
    { id: 'e', time: '09:01', title: 'E' }
  ], done: { '2026-01-15': ['d'] } };
  const t = Date.UTC(2026, 0, 15, 7, 0); // to 15.1. klo 9.00
  const due = dueReminders(data, t - 60000, t).map(d => d.rem.id);
  assert.deepEqual(due, ['a']);
  // väliin jääneet minuutit otetaan kiinni
  const due2 = dueReminders(data, t - 60000, t + 60000).map(d => d.rem.id);
  assert.deepEqual(due2, ['a', 'e']);
});

test('yhteenvedon teksti käyttää päivän lukuja', () => {
  const body = buildBody({ kind: 'summary', body: '' }, { summary: { date: '2026-01-15', kcal: 1850.4, protein: 121, goalKcal: 2400, goalProtein: 160, tasksDone: 3, tasksTotal: 6 } }, '2026-01-15');
  assert.equal(body, 'Tänään 1850 / 2400 kcal, proteiinia 121 / 160 g, tehtäviä 3/6.');
  assert.match(buildBody({ kind: 'summary' }, { summary: null }, '2026-01-15'), /Et ole vielä kirjannut/);
});

test('koko ketju: rekisteröinti, tilaus, synkronointi, ajastettu lähetys, torkku ja testi', async () => {
  const env = { DB: makeD1() };
  const vapidRef = { value: null };
  const s1 = await makeSubscriber('https://web.push.apple.com/QAbc123');
  const s2 = await makeSubscriber('https://fcm.googleapis.com/fcm/send/xyz');
  const mock = installPushMock([s1], vapidRef); // s2 "vanhentunut" → 410
  try {
    const v = await call(env, '/api/vapid', null, 'GET');
    assert.equal(unb64u(v.body.publicKey).length, 65);
    vapidRef.value = v.body.publicKey;
    const v2 = await call(env, '/api/vapid', null, 'GET');
    assert.equal(v2.body.publicKey, v.body.publicKey, 'avaimet pysyvät samoina');

    const ident = { userId: 'u_' + 'a'.repeat(20), secret: 'b'.repeat(32) };
    let r = await call(env, '/api/subscribe', { ...ident, subscription: s1.subscription });
    assert.equal(r.status, 200);
    r = await call(env, '/api/subscribe', { ...ident, subscription: s2.subscription });
    assert.equal(r.status, 200);
    r = await call(env, '/api/sync', { userId: ident.userId, secret: 'x'.repeat(32), state: {} });
    assert.equal(r.status, 403, 'väärä salaisuus hylätään');

    const now = Date.now();
    const lp = localParts(now + 60000, 'Europe/Helsinki');
    r = await call(env, '/api/sync', { ...ident, state: {
      tz: 'Europe/Helsinki',
      reminders: [
        { id: 'r_meal', time: lp.hm, title: 'Ensimmäinen ateria', body: 'Muista syödä' },
        { id: 'r_sum', time: lp.hm, title: 'Yhteenveto', kind: 'summary' },
        { id: 'r_done', time: lp.hm, title: 'Tehty jo' }
      ],
      done: { [lp.date]: ['r_done'] },
      summary: { date: lp.date, kcal: 1200, protein: 90, goalKcal: 2400, goalProtein: 160, tasksDone: 1, tasksTotal: 3 }
    } });
    assert.equal(r.body.subscriptions, 2);

    // Cron-ajo, jonka minuutti osuu muistutusten aikaan
    const tick = Math.floor((now + 60000) / 60000) * 60000;
    await runSchedule(env, tick - 60000);
    const res = await runSchedule(env, tick);
    assert.equal(res.sent, 2);
    const titles = mock.received.map(x => x.payload.title).sort();
    assert.deepEqual(titles, ['Ensimmäinen ateria', 'Yhteenveto']);
    const sum = mock.received.find(x => x.payload.title === 'Yhteenveto');
    assert.match(sum.payload.body, /Tänään 1200 \/ 2400 kcal/);
    assert.equal(mock.received[0].payload.url.startsWith('./index.html#/today?r='), true);

    // Vanhentunut tilaus poistettiin (410)
    const st = await call(env, '/api/status', ident);
    assert.equal(st.body.subscriptions.length, 1);

    // Sama minuutti uudelleen → ei tuplalähetyksiä
    await runSchedule(env, tick + 1000);
    assert.equal(mock.received.length, 2);

    // Torkku: lähetetään vasta ajan tultua
    r = await call(env, '/api/snooze', { ...ident, rid: 'r_meal', minutes: 10, title: 'Ensimmäinen ateria', body: 'Torkutettu' });
    assert.equal(r.status, 200);
    await runSchedule(env, Date.now() + 5 * 60000);
    assert.equal(mock.received.length, 2);
    await runSchedule(env, Date.now() + 11 * 60000);
    assert.equal(mock.received.length, 3);
    assert.equal(mock.received[2].payload.body, 'Torkutettu');

    // Torkku perutaan, kun tehtävä merkitään tehdyksi
    await call(env, '/api/snooze', { ...ident, rid: 'r_meal', minutes: 10, title: 'x' });
    await call(env, '/api/sync', { ...ident, state: { done: { [lp.date]: ['r_done', 'r_meal'] } } });
    await runSchedule(env, Date.now() + 12 * 60000);
    assert.equal(mock.received.length, 3);

    // Testi heti ja viiveellä
    r = await call(env, '/api/test', ident);
    assert.equal(r.body.ok, true);
    assert.equal(mock.received.length, 4);
    r = await call(env, '/api/test', { ...ident, delaySeconds: 60 });
    assert.ok(r.body.scheduledAt);
    await runSchedule(env, Date.now() + 2 * 60000);
    assert.equal(mock.received.length, 5);
    assert.equal(mock.received[4].payload.title, 'GymTrack-testi');

    const st2 = await call(env, '/api/status', ident);
    assert.ok(st2.body.log.length >= 4);
  } finally {
    mock.restore();
  }
});

test('syötteen tarkistus', async () => {
  const env = { DB: makeD1() };
  let r = await call(env, '/api/sync', { userId: 'short', secret: 'x' });
  assert.equal(r.status, 400);
  r = await call(env, '/api/subscribe', { userId: 'u_' + 'a'.repeat(20), secret: 'b'.repeat(32), subscription: { endpoint: 'http://evil', keys: {} } });
  assert.equal(r.status, 400);
  r = await call(env, '/api/status', { userId: 'u_' + 'z'.repeat(20), secret: 'b'.repeat(32) });
  assert.equal(r.status, 404);
  const env2 = { DB: makeD1(), APP_KEY: 'k1' };
  r = await call(env2, '/api/sync', { userId: 'u_' + 'a'.repeat(20), secret: 'b'.repeat(32) });
  assert.equal(r.status, 403);
});
