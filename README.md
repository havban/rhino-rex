# 🦖 Rhino Rex

Game aksi 3D di browser: kamu adalah **T-Rex** yang diserbu kawanan **badak penyeruduk**.
Semburkan api, gigit, dan sabetkan ekor untuk bertahan gelombang demi gelombang.

**Main sekarang → https://havban.github.io/rhino-rex/**

![Rhino Rex](docs/screenshot.png)

## Fitur

- **Sudut pandang orang ketiga** dari belakang T-Rex. Kamera mengekor sendiri ke belakang
  setelah kamu berhenti menggeser layar — makin cepat saat berlari — tapi geseran bebas
  tetap bisa memutar sudut pandang ke mana pun, termasuk dari depan atau dari atas.
- **Tiga serangan**
  - 🔥 **Semburan api** — kerucut api jarak jauh, memberi efek terbakar (damage over time).
  - 🦷 **Gigitan** — cepat, kerusakan besar di depan moncong.
  - 🌀 **Pukulan ekor** — T-Rex otomatis berputar menghadap badak terdekat, memutar badan
    satu putaran penuh sehingga ekornya menyapu 360°, lalu kembali ke arah semula.
- **Badak yang menyeruduk** — mereka mengais tanah dulu (aba-aba), lalu menerjang lurus.
  Menepilah; kalau mereka menabrak pohon atau batu mereka pusing dan menerima kerusakan ekstra.
- **Empat jenis badak**: anakan yang gesit, banteng, badak berbaju zirah, dan **Matriark** raksasa
  yang muncul tiap gelombang kelima.
- **Tema cerah**: padang rumput hijau, langit biru, bunga warna-warni, awan, dan perbukitan.
- **Model halus**: T-Rex bertulang (SkinnedMesh) dengan tengkorak dalam bergigi, tangan
  kecil bercakar, dan kaki digitigrade; badak bertubuh tong dengan dua tanduk.
- Gelombang tanpa akhir, skor + combo, buah semangka penyembuh, skor terbaik tersimpan lokal.
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
| Jeda | `Esc` |

Di ponsel/tablet: joystick di kiri, geser separuh layar kanan untuk memutar kamera,
tombol bulat di kanan untuk menyerang, lompat, dan lari. Layar akan masuk mode
layar-penuh saat permainan dimulai. Mode lanskap paling lega, tapi potret tetap jalan.

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
js/fx.js            # partikel, angka kerusakan, guncangan kamera
js/camera.js        # kamera orang ketiga
js/input.js         # keyboard/mouse/sentuh
js/audio.js         # sound effect prosedural
```

Objek `window.__game` diekspos untuk debugging (`state`, `rex`, `rhinos`, `cfg`, ...).

## Lisensi

MIT
