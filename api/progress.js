const crypto = require('crypto');
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const H = 'gdd:progres';
const s = (v, n) => String(v == null ? '' : v).slice(0, n);
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
const ST = ['Belum', 'Proses', 'Selesai'];
const ip = req => String(req.headers['x-forwarded-for'] || 'x').split(',')[0].trim();

async function redis(cmd) {
  const r = await fetch(URL_, { method: 'POST', headers: { Authorization: 'Bearer ' + TOK }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
const locked = async k => parseInt((await redis(['GET', k])) || 0, 10) >= 5;
const fail = async k => { if ((await redis(['INCR', k])) === 1) await redis(['EXPIRE', k, 600]); };
const E = (res, c, m) => res.status(c).json({ error: m });
const LOCK = 'Terlalu banyak percobaan salah. Coba lagi 10 menit lagi.';
const strip = o => { const c = { ...o }; delete c.pinHash; return c; };
const pub = o => { const c = strip(o); delete c.feedback; delete c.nilai; delete c.rub; delete c.gc; return c; };
async function all() {
  const a = (await redis(['HGETALL', H])) || [], out = [];
  for (let i = 0; i < a.length; i += 2) out.push(JSON.parse(a[i + 1]));
  return out;
}
async function auth(b) {
  const name = s(b.name, 40).trim(), kelas = s(b.kelas, 20).trim();
  if (!name || !/^\d{4,6}$/.test(b.pin || '')) return { err: [400, 'Isi nama dan PIN (4-6 angka)'] };
  const id = hash(name.toLowerCase() + '|' + kelas.toLowerCase()).slice(0, 12);
  const fk = 'gdd:fail:s:' + id;
  if (await locked(fk)) return { err: [429, LOCK] };
  const raw = await redis(['HGET', H, id]);
  const prev = raw ? JSON.parse(raw) : null;
  const ph = hash(id + b.pin);
  if (prev && prev.pinHash !== ph) { await fail(fk); return { err: [403, 'PIN salah untuk nama ini'] }; }
  await redis(['DEL', fk]);
  return { id, name, kelas, prev, ph };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!URL_ || !TOK) return E(res, 500, 'Database belum terhubung');
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    let guru = false;
    if (b.teacherKey) {
      const gk = 'gdd:fail:g:' + ip(req);
      if (await locked(gk)) return E(res, 429, LOCK);
      guru = !!process.env.TEACHER_KEY && b.teacherKey === process.env.TEACHER_KEY;
      if (!guru) { await fail(gk); return E(res, 401, 'Kunci guru salah'); }
      await redis(['DEL', gk]);
    }
    if (req.method === 'GET') return res.json((await all()).map(pub));
    if (req.method === 'DELETE') {
      if (!guru) return E(res, 401, 'Kunci guru salah');
      await redis(['HDEL', H, s(b.id, 40)]);
      return res.json({ ok: true });
    }
    if (req.method !== 'POST') return E(res, 405, 'Metode tidak didukung');

    if (guru) {
      if (b.action === 'list') return res.json((await all()).map(strip));
      const raw = b.id ? await redis(['HGET', H, s(b.id, 40)]) : null;
      if (!raw) return b.id ? E(res, 404, 'Data tidak ditemukan') : res.json({ ok: true });
      const o = JSON.parse(raw);
      if (b.action === 'resetpin') {
        if (!/^\d{4,6}$/.test(b.newPin || '')) return E(res, 400, 'PIN baru harus 4-6 angka');
        o.pinHash = hash(o.id + b.newPin);
        await redis(['DEL', 'gdd:fail:s:' + o.id]);
      } else {
        const W = [30, 25, 20, 15, 10], r = Array.isArray(b.rub) ? b.rub : [], g = Array.isArray(b.gc) ? b.gc : [], st = Array.isArray(b.st) ? b.st : [];
        o.feedback = s(b.feedback, 500);
        o.rub = W.map((w, i) => { const n = parseInt(r[i], 10); return n >= 0 ? Math.min(n, w) : 0; });
        o.nilai = o.rub.some(x => x > 0) ? String(o.rub.reduce((a, x) => a + x, 0)) : '';
        o.gc = Array.from({ length: 10 }, (_, i) => s(g[i], 150));
        o.st = Array.from({ length: 10 }, (_, i) => (ST.includes(st[i]) ? st[i] : o.st[i]));
      }
      await redis(['HSET', H, o.id, JSON.stringify(o)]);
      return res.json({ ok: true });
    }

    const a = await auth(b);
    if (a.err) return E(res, a.err[0], a.err[1]);
    if (b.action === 'me') {
      if (!a.prev) return E(res, 404, 'Belum ada data');
      return res.json({ feedback: a.prev.feedback || '', nilai: a.prev.nilai || '', gc: a.prev.gc || [] });
    }
    const prev = a.prev, st = b.st || [], ct = b.ct || [], lk = s(b.link, 200).trim();
    const rec = {
      id: a.id, name: a.name, kelas: a.kelas, game: s(b.game, 60), pertemuan: s(b.pertemuan, 3),
      link: /^https?:\/\/[^\s"'<>]+$/i.test(lk) ? lk : '',
      st: Array.from({ length: 10 }, (_, i) => (ST.includes(st[i]) ? st[i] : 'Belum')),
      ct: Array.from({ length: 10 }, (_, i) => s(ct[i], 150)),
      kendala: s(b.kendala, 300), target: s(b.target, 300), updated: Date.now(),
      feedback: prev ? prev.feedback : '', nilai: prev ? prev.nilai : '', rub: prev ? prev.rub : undefined, gc: prev ? prev.gc : undefined,
      pinHash: a.ph, hist: prev && Array.isArray(prev.hist) ? prev.hist.slice() : []
    };
    const pn = parseInt(rec.pertemuan, 10);
    if (pn >= 1 && pn <= 99) {
      const pc = Math.round(rec.st.reduce((n, x) => n + (x === 'Selesai' ? 1 : x === 'Proses' ? 0.5 : 0), 0) * 10);
      rec.hist = rec.hist.filter(h => h.k !== pn).concat([{ k: pn, p: pc }]).sort((x, y) => x.k - y.k);
    }
    await redis(['HSET', H, a.id, JSON.stringify(rec)]);
    return res.json({ ok: true });
  } catch (e) {
    return E(res, 500, 'Terjadi kesalahan server');
  }
};
