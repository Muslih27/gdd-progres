# Papan Progres Gim XII RPL

Situs statis (`public/index.html`) + satu API (`api/progress.js`). Tanpa build, tanpa dependensi.

## Deploy ke Vercel
1. Upload folder ini ke repository GitHub, lalu di Vercel: Add New > Project > pilih repo. Framework Preset: **Other**. Klik Deploy.
2. Di dashboard proyek: **Storage** > buat/hubungkan **Upstash Redis** (Marketplace). Variabel `KV_REST_API_URL` dan `KV_REST_API_TOKEN` terisi otomatis.
3. **Settings > Environment Variables**: tambah `TEACHER_KEY` = kata sandi guru pilihanmu.
4. **Deployments > Redeploy** agar variabel terbaca.

## Cara pakai
- Siswa: klik "Isi / perbarui progresku", isi nama, kelas, PIN 4-6 angka, status 10 bagian GDD. Untuk memperbarui, pakai nama, kelas, dan PIN yang sama.
- Guru: klik "Mode guru", masukkan `TEACHER_KEY`. Muncul kolom umpan balik, nilai, dan tombol hapus di tiap siswa.
- Semua isian (kecuali PIN) tampil ke siapa pun yang membuka situs.
