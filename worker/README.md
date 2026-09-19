# Papan skor global — Cloudflare Worker + D1

API kecil untuk papan skor Rhino Rex. Peramban tidak pernah memegang kredensial
basis data: Worker inilah satu-satunya yang boleh menulis.

```
POST /run     -> { token }           token bertanda tangan saat permainan mulai
POST /scores  -> { ok, rank }        kirim hasil permainan
GET  /scores  -> { scores: [...] }   20 teratas (di-cache 20 detik di edge)
GET  /health  -> { ok }
```

## Cara pasang (sekali saja, ~10 menit)

```bash
cd worker
npm install -g wrangler        # atau pakai "npx wrangler ..." di tiap perintah
wrangler login                 # membuka peramban, pilih akun Cloudflare-mu

# 1. buat basis datanya, lalu salin database_id yang dicetak ke wrangler.toml
wrangler d1 create rhino-rex

# 2. buat tabelnya di basis data sungguhan
wrangler d1 execute rhino-rex --remote --file=./schema.sql

# 3. rahasia untuk menandatangani token permainan + menggarami hash IP
#    (isi dengan teks acak panjang, mis. keluaran: openssl rand -hex 32)
wrangler secret put RUN_SECRET

# 4. terbitkan
wrangler deploy
```

Perintah terakhir mencetak URL seperti
`https://rhino-rex-scores.<subdomain>.workers.dev`. Tempelkan ke
`js/leaderboard.js`:

```js
export const API = 'https://rhino-rex-scores.<subdomain>.workers.dev';
```

Selesai — tab **Global** di papan skor langsung hidup. Selama `API` kosong,
permainan tetap jalan memakai papan lokal saja dan tidak menghubungi apa pun.

## Rute multiplayer

Worker yang sama juga memperantarai jabat tangan WebRTC untuk mode co-op:

```
POST /mp/room        -> { code }    tuan rumah membuka room
POST /mp/join/:code  -> { peer }    tamu mengetuk pintu
GET  /mp/peers/:code -> { peers }   tuan rumah melihat siapa yang menunggu
POST /mp/sdp/:peer   -> { ok }      kirim offer (tuan rumah) atau answer (tamu)
GET  /mp/sdp/:peer   -> { offer, answer, closed }
POST /mp/close/:code -> { ok }
```

Semuanya polling HTTP biasa — tanpa WebSocket dan tanpa Durable Objects — jadi tetap muat
di paket gratis. Barisnya berumur pendek dan dibersihkan sendiri setelah 2 jam. Setelah
jabat tangan selesai, seluruh lalu lintas permainan langsung antar-peramban dan tidak
menyentuh Worker sama sekali.

Jangan lupa jalankan ulang `schema.sql` setelah menarik pembaruan ini: ada dua tabel baru
(`rooms` dan `peers`).

## Batas gratis

Worker gratis: 100.000 permintaan/hari. D1 gratis: 5 GB, 5 juta baris dibaca dan
100.000 baris ditulis per hari. Satu kunjungan papan skor = 1 baca, satu kiriman
skor = 1 tulis, jadi angka itu jauh di atas kebutuhan. Tidak ada yang tertidur.

## Soal kecurangan

Game yang berjalan di peramban tidak bisa dibuat jujur — yang bisa dilakukan
adalah membuat curang jadi merepotkan. Yang sudah ada:

- **Token permainan.** `/run` mengeluarkan token ber-HMAC saat permainan mulai.
  Kiriman tanpa token yang sah ditolak, dan durasi yang diklaim tidak boleh
  melebihi umur token — jadi skor tidak bisa dikirim lebih cepat daripada waktu
  bermain sungguhan.
- **Uji kewajaran.** Jumlah badak tidak boleh melebihi yang pernah muncul sampai
  gelombang itu, skor tidak boleh melampaui batas teoretis dari gelombang dan
  jumlah badak (mengikuti rumus di `js/config.js`), dan gelombang tinggi tidak
  bisa selesai dalam hitungan detik.
- **Pembatasan laju** 6 kiriman per jam per IP (disimpan sebagai hash bergaram,
  alamat aslinya tidak pernah disimpan).

Yang belum: token masih bisa dipakai ulang dalam jendela waktunya (dibatasi oleh
pembatasan laju), dan pemain yang sungguh gigih tetap bisa memalsukan permainan
yang wajar. Untuk papan skor hobi, ini cukup.

## Perawatan

```bash
# lihat isi papan
wrangler d1 execute rhino-rex --remote \
  --command "SELECT id, name, score, wave, kills, seconds FROM scores ORDER BY score DESC LIMIT 20"

# hapus satu baris palsu
wrangler d1 execute rhino-rex --remote --command "DELETE FROM scores WHERE id = 42"

# kosongkan papan
wrangler d1 execute rhino-rex --remote --command "DELETE FROM scores"
```

`ALLOW_ORIGIN` di `wrangler.toml` membatasi asal yang boleh memanggil API
(pisahkan dengan koma untuk beberapa asal, atau `"*"` saat menguji). Mengganti
`RUN_SECRET` akan membatalkan semua token yang beredar dan mengatur ulang
penghitung pembatasan laju.

## Menguji tanpa akun Cloudflare

Repo ini punya harness kecil yang menjalankan kode Worker yang sama di Node
dengan D1 ditiru di atas `node:sqlite`, dipakai saat pengembangan:

```bash
node --experimental-sqlite /tmp/worker-dev.js     # lihat riwayat commit
curl -X POST http://localhost:8788/run
```

Atau pakai `wrangler dev --local` kalau wrangler sudah terpasang.
