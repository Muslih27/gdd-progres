const crypto = require('crypto');
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const H = 'gdd:progres';
const s = (v, n) => String(v == null ? '' : v).slice(0, n);
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
const ST = ['Belum', 'Proses', 'Selesai'];

async function redis(cmd) {
  const r = await fetch(URL_, { method: 'POST', headers: { Authorization: 'Bearer ' + TOK }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!URL_ || !TOK) return res.status(500).json({ error: 'Database belum terhubung' });
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const guru = !!process.env.TEACHER_KEY && b.teacherKey === process.env.TEACHER_KEY;

    if (req.method === 'GET') {
      const a = (await redis(['HGETALL', H])) || [];
      const out = [];
      for (let i = 0; i < a.length; i += 2) { const o = JSON.parse(a[i + 1]); delete o.pinHash; out.push(o); }
      return res.json(out);
    }
    if (req.method === 'DELETE') {
      if (!guru) return res.status(401).json({ error: 'Kunci guru salah' });
      await redis(['HDEL', H, s(b.id, 40)]);
      return res.json({ ok: true });
    }
    if (req.method === 'POST') {
      if (b.teacherKey && !guru) return res.status(401).json({ error: 'Kunci guru salah' });
      if (guru && !b.id) return res.json({ ok: true });
      if (guru && b.id) {
        const raw = await redis(['HGET', H, s(b.id, 40)]);
        if (!raw) return res.status(404).json({ error: 'Data tidak ditemukan' });
        const o = JSON.parse(raw);
        o.feedback = s(b.feedback, 500); o.nilai = s(b.nilai, 3);
        await redis(['HSET', H, o.id, JSON.stringify(o)]);
        return res.json({ ok: true });
      }
      const name = s(b.name, 40).trim(), kelas = s(b.kelas, 20).trim();
      if (!name || !/^\d{4,6}$/.test(b.pin || '')) return res.status(400).json({ error: 'Isi nama dan PIN (4-6 angka)' });
      const id = hash(name.toLowerCase() + '|' + kelas.toLowerCase()).slice(0, 12);
      const old = await redis(['HGET', H, id]);
      const prev = old ? JSON.parse(old) : null;
      const ph = hash(id + b.pin);
      if (prev && prev.pinHash !== ph) return res.status(403).json({ error: 'PIN salah untuk nama ini' });
      const st = b.st || [], ct = b.ct || [];
      const rec = {
        id, name, kelas, game: s(b.game, 60), pertemuan: s(b.pertemuan, 3),
        st: Array.from({ length: 10 }, (_, i) => (ST.includes(st[i]) ? st[i] : 'Belum')),
        ct: Array.from({ length: 10 }, (_, i) => s(ct[i], 150)),
        kendala: s(b.kendala, 300), target: s(b.target, 300),
        updated: Date.now(), feedback: prev ? prev.feedback : '', nilai: prev ? prev.nilai : '', pinHash: ph,
        hist: prev && Array.isArray(prev.hist) ? prev.hist.slice() : []
      };
      const pn = parseInt(rec.pertemuan, 10);
      if (pn >= 1 && pn <= 99) {
        const pc = Math.round(rec.st.reduce((n, x) => n + (x === 'Selesai' ? 1 : x === 'Proses' ? 0.5 : 0), 0) * 10);
        rec.hist = rec.hist.filter(h => h.k !== pn).concat([{ k: pn, p: pc }]).sort((x, y) => x.k - y.k);
      }
      await redis(['HSET', H, id, JSON.stringify(rec)]);
      return res.json({ ok: true });
    }
    res.status(405).json({ error: 'Metode tidak didukung' });
  } catch (e) {
    res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
};
