# 🦖 Rhino Rex

Game aksi 3D di browser: kamu adalah **T-Rex** yang diserbu kawanan **badak penyeruduk**.
Semburkan api, gigit, dan sabetkan ekor untuk bertahan gelombang demi gelombang.

**Main sekarang → https://havban.github.io/rhino-rex/**

![Rhino Rex](docs/screenshot.png)

## Fitur

- **Sudut pandang orang ketiga** dari belakang T-Rex, kamera mengikuti sedikit dari bahu.
- **Tiga serangan**
  - 🔥 **Semburan api** — kerucut api jarak jauh, memberi efek terbakar (damage over time).
  - 🦷 **Gigitan** — cepat, kerusakan besar di depan moncong.
  - 🌀 **Pukulan ekor** — sapuan hampir 360°, melempar dan membuat badak pusing.
- **Badak yang menyeruduk** — mereka mengais tanah dulu (aba-aba), lalu menerjang lurus.
  Menepilah; kalau mereka menabrak pohon atau batu mereka pusing dan menerima kerusakan ekstra.
- **Empat jenis badak**: anakan yang gesit, banteng, badak berbaju zirah, dan **Matriark** raksasa
  yang muncul tiap gelombang kelima.
- **Tema cerah**: padang rumput hijau, langit biru, bunga warna-warni, awan, dan perbukitan.
- Gelombang tanpa akhir, skor + combo, buah semangka penyembuh, skor terbaik tersimpan lokal.
- Jalan di desktop dan ponsel (joystick sentuh), dengan pilihan kualitas grafis.

## Kontrol

| Aksi | Tombol |
| --- | --- |
| Bergerak | `W A S D` (relatif kamera) |
| Kamera | Gerakkan mouse (klik kanvas untuk mengunci pointer) |
| Lari | `Shift` |
| Lompat | `Spasi` |
| Gigit | Klik kiri / `J` |
| Semburan api | Klik kanan (tahan) / `F` |
| Pukulan ekor | Klik tengah / `K` |
| Jeda | `Esc` |

Di ponsel: joystick di kiri, geser separuh layar kanan untuk memutar kamera,
tombol bulat di kanan untuk menyerang.

## Teknis

- [Three.js](https://threejs.org) r160, di-*vendor* ke `vendor/three.module.js` (tanpa CDN, tanpa build step).
- Semua model dibuat prosedural dari primitif (box, cone, sphere) dan dianimasikan dengan tangan
  — tidak ada aset 3D eksternal.
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
js/fx.js            # partikel, angka kerusakan, guncangan kamera
js/camera.js        # kamera orang ketiga
js/input.js         # keyboard/mouse/sentuh
js/audio.js         # sound effect prosedural
```

Objek `window.__game` diekspos untuk debugging (`state`, `rex`, `rhinos`, `cfg`, ...).

## Lisensi

MIT
