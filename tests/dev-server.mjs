// Paikallinen palvelin selaintesteihin ilman Cloudflare-tiliä:
// ajaa push-server/src/index.js:n Nodessa, D1 korvataan node:sqlite-muistitietokannalla.
//   node tests/dev-server.mjs   (portti 8787, tai PORT=...)
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import worker from '../push-server/src/index.js';

const db = new DatabaseSync(':memory:');
const stmt = sql => {
  let args = [];
  const s = {
    bind(...a) { args = a; return s; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; }
  };
  return s;
};
const env = { DB: { prepare: stmt, async batch(list) { for (const x of list) await x.run(); } }, VAPID_SUBJECT: 'mailto:test@example.com', APP_ORIGINS: process.env.APP_ORIGINS || 'http://localhost:8000' };

const port = +process.env.PORT || 8787;
http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const r = await worker.fetch(new Request('http://localhost:' + port + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env);
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(port, () => console.log('GymTrack-testipalvelin http://localhost:' + port));
