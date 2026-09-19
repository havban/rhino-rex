# 🦖 Rhino Rex

Game aksi 3D di browser: kamu adalah **T-Rex** yang diserbu kawanan **badak penyeruduk**.
Semburkan api, gigit, dan sabetkan ekor untuk bertahan gelombang demi gelombang.

**Main sekarang → https://havban.github.io/rhino-rex/**

![Rhino Rex](docs/screenshot.png)

## Fitur

- **Sudut pandang orang ketiga** dari belakang T-Rex. Kamera mengekor sendiri ke belakang
  setelah kamu berhenti menggeser layar — makin cepat saat berlari — tapi geseran bebas
  tetap bisa memutar sudut pandang ke mana pun, termasuk dari depan atau dari atas.
- **Empat serangan**
  - 🔥 **Semburan api** — kerucut api jarak jauh, memberi efek terbakar (damage over time).
  - 🦷 **Gigitan** — cepat, kerusakan besar di depan moncong.
  - 🌀 **Pukulan ekor** — T-Rex otomatis berputar menghadap badak terdekat, memutar badan
    satu putaran penuh sehingga ekornya menyapu 360°, lalu kembali ke arah semula.
  - ☄️ **Bola api** — lemparan melengkung yang meledak: kerusakan langsung + ledakan area
    yang melempar dan membakar. Membidik sendiri ke badak yang ada di depanmu, memakai
    40 meteran api, jeda 3 detik.
- **Badak yang menyeruduk** — mereka mengais tanah dulu (aba-aba), lalu menerjang lurus.
  Menepilah; kalau mereka menabrak pohon atau batu mereka pusing dan menerima kerusakan ekstra.
- **Empat jenis badak**: anakan yang gesit, banteng, badak berbaju zirah, dan **Matriark** raksasa
  yang muncul tiap gelombang kelima.
- **Tema cerah**: padang rumput hijau, langit biru, bunga warna-warni, awan, dan perbukitan.
- **Model halus**: T-Rex bertulang (SkinnedMesh) dengan tengkorak dalam bergigi, tangan
  kecil bercakar, dan kaki digitigrade; badak bertubuh tong dengan dua tanduk.
- Gelombang tanpa akhir, skor + combo, buah semangka penyembuh.
- **🏆 Papan skor** sepuluh besar dengan nama pemain. Disimpan di `localStorage`, jadi
  **hanya per perangkat** — tidak ada server, tidak ada akun, tidak ada data yang dikirim
  ke mana pun. (Papan skor global butuh backend; belum ada.)
- **🩸 Tetesan darah** yang memercik dari badak dan meninggalkan noda di rumput, memudar
  perlahan. Bisa dimatikan lewat tombol *Darah: ON/OFF* di menu.
- **Responsif**: satu build jalan di ponsel, tablet, dan laptop. Kontrol sentuh muncul
  otomatis di layar sentuh (dan laptop layar-sentuh tetap bisa pakai keyboard + mouse),
  HUD merapat di layar pendek, bidang pandang melebar di mode potret, resolusi render
  turun-naik sendiri kalau perangkat mulai tersengal.

## Kontrol

| Aksi | Tombol |
| --- | --- |
| Bergerak | `W A S D` (relatif kamera) |
| Kamera | Gerakkan mouse (klik kanvas untuk mengunci pointer) atau tahan-seret |
| Lari | `Shift` |
| Lompat | `Spasi` |
| Gigit | Klik kiri / `J` |
| Semburan api | Klik kanan (tahan) / `F` |
| Pukulan ekor | Klik tengah / `K` |
| Bola api | `R` atau `E` |
| Jeda | `Esc`, atau tombol **II** di tengah atas layar |

Di ponsel/tablet: joystick di kiri, geser separuh layar kanan untuk memutar kamera,
tombol bulat di kanan untuk menyerang, lompat, dan lari, tombol **II** di atas untuk jeda.
Layar masuk mode layar-penuh saat permainan dimulai, dan kembali penuh saat kamu menekan
"Lanjut" setelah jeda. Di laptop ada tombol **⛶ Layar penuh** di menu. Mode lanskap paling lega, tapi potret tetap jalan.

## Statistik & analitik

Ada dua lapis, dan keduanya terpisah.

**1. Statistik lokal (selalu aktif, tidak pernah keluar dari perangkat).**
Buka `?stats=1` — misalnya <https://havban.github.io/rhino-rex/?stats=1> — atau ketik
`__stats()` di konsol. Panel kecil di pojok kiri-bawah menampilkan jumlah permainan,
total waktu main, badak dikalahkan, matriark, skor terbaik, rata-rata gelombang, dan
proporsi pemakaian tiap senjata. Tersimpan di `localStorage` (`rr.stats`), ada tombol
reset. Pemain biasa tidak akan pernah melihat panel ini.

**2. Kiriman agregat ke layanan analitik (mati secara bawaan).**
`js/analytics.js` tidak melakukan permintaan jaringan apa pun selama `ENDPOINT` kosong.

Rekomendasi: **[GoatCounter](https://www.goatcounter.com)** — gratis untuk pemakaian
non-komersial (100rb tampilan/bulan), tanpa cookie, tanpa data pribadi, jadi tidak perlu
banner persetujuan, dan mendukung *custom event* sehingga bisa melihat sebaran gelombang
dan skor, bukan cuma jumlah pengunjung.

```
1. daftar di goatcounter.com, pilih kode misalnya "rhino-rex"
2. di js/analytics.js isi:
   export const ENDPOINT = 'https://rhino-rex.goatcounter.com/count';
3. dasbor ada di https://rhino-rex.goatcounter.com
   -> Settings -> centang "private" supaya hanya kamu yang bisa membacanya
```

Yang dikirim hanya pencacah: satu tampilan halaman per kunjungan, lalu per permainan
selesai `run-start`, `wave-<rentang>`, `score-<rentang>`, `weapon-<terfavorit>`, dan
`boss-killed`. Tanpa id, tanpa cookie, tanpa data pribadi, dan tidak mengirim apa pun
kalau peramban mengaktifkan *Do Not Track*. Nilai skor sengaja dikelompokkan ke rentang
supaya dasbornya berupa sebaran, bukan ribuan angka unik.

Alternatif gratis: **Cloudflare Web Analytics** (tanpa batas, tapi hanya kunjungan —
tidak ada custom event) dan **Umami Cloud** (dasbor lebih kaya, 10rb event/bulan).
Mau pakai layanan lain? Biarkan `ENDPOINT` kosong dan pasang
`window.__rrTrack = (path, title, isEvent) => { ... }` sebelum game dimuat.

## Teknis

- [Three.js](https://threejs.org) r160, di-*vendor* ke `vendor/three.module.js` (tanpa CDN, tanpa build step).
- Semua model dibuat prosedural — tidak ada aset 3D eksternal. Tubuh T-Rex dan badak adalah
  permukaan halus yang disapu sepanjang tulang punggung (penampang elips dengan profil jari-jari
  Catmull-Rom), bukan tumpukan kotak. T-Rex memakai `SkinnedMesh` dengan rangka tulang, sehingga
  leher dan ekor melengkung mulus saat berlari dan menyabet.
- Kepala, kaki, dan tanduk dibentuk dari elipsoid dan kapsul ber-*smooth shading* dengan bahan
  Phong, jadi siluetnya membulat, bukan bersudut.
- Efek api/debu memakai satu sistem partikel `THREE.Points` dengan shader kustom.
- Suara disintesis lewat Web Audio API (tanpa file audio).
- Situs statis murni: cukup buka `index.html` lewat web server apa pun.

### Menjalankan secara lokal

```bash
git clone git@github.com:havban/rhino-rex.git
cd rhino-rex
python3 -m http.server 8777
# lalu buka http://localhost:8777
```

### Struktur

```
index.html          # HUD, menu, importmap
css/style.css       # tema cerah
js/config.js        # semua angka penyetelan (damage, kecepatan, gelombang)
js/main.js          # loop utama, gelombang, resolusi serangan
js/rex.js           # model + animasi + gerak T-Rex
js/rhino.js         # model + AI badak (kejar → aba-aba → seruduk → pusing)
js/world.js         # arena, langit, pohon, batu, rumput
js/geom.js          # pembangun permukaan halus (sapuan tabung, elipsoid, kapsul)
js/fireball.js      # proyektil bola api (lintasan melengkung + ledakan)
js/scores.js        # papan skor lokal (localStorage)
js/analytics.js     # statistik lokal + kiriman agregat opsional (mati bawaan)
js/fx.js            # partikel, angka kerusakan, guncangan kamera
js/camera.js        # kamera orang ketiga
js/input.js         # keyboard/mouse/sentuh
js/audio.js         # sound effect prosedural
```

Objek `window.__game` diekspos untuk debugging (`state`, `rex`, `rhinos`, `cfg`, ...).

## Lisensi

MIT
