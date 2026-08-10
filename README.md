# KMZ Infra Mapper

Aplikasi web pemetaan koordinat infrastruktur fiber berbasis Flask + SQLite (tanpa Docker).

## Fitur Utama

- Landing page publik dan login dashboard
- Dashboard pemetaan titik infrastruktur
- Master jenis infrastruktur dinamis (TIANG, ODP, CLOSURE, dll)
- Master jenis aset per tipe infrastruktur
- Jalur garis hubung antar titik (server/tiang/ODP)
- Export KMZ (titik + jalur)
- Backup dan restore database dari menu aplikasi
- Panel ID teknisi/operator lapangan
- Panel pengaturan data perusahaan dan konten landing page
- Panel cek update dari GitHub + tombol update aplikasi
- Tampilan mobile responsif (hamburger menu, bottom nav, compact mode)

## Menjalankan di Windows

Prasyarat:
- Python 3.10+

Langkah cepat:
1. Buka folder project.
2. Jalankan `start.bat`.
3. Buka `http://127.0.0.1:5000`.

Default login awal:
- Username: `admin`
- Password: `admin123`

## Install Otomatis Debian/Ubuntu

Installer otomatis tersedia di file `install.sh`.

### 1) Jalankan installer

```bash
chmod +x install.sh
./install.sh
```

### 2) Opsi installer yang tersedia

```bash
./install.sh --app-dir /opt/kmzinfra --port 5000 --domain mydomain.com
./install.sh --no-nginx
```

Opsi:
- `--app-dir`: folder deploy aplikasi (default `/opt/kmzinfra`)
- `--app-user`: user service (default `www-data`)
- `--app-group`: group service (default `www-data`)
- `--port`: port internal gunicorn (default `5000`)
- `--domain`: nilai `server_name` nginx (default `_`)
- `--no-nginx`: lewati konfigurasi nginx

### 3) Apa yang dilakukan install.sh

1. Install dependency sistem (python3, python3-venv, pip, rsync, nginx, dll).
2. Copy source code ke folder deploy.
3. Buat virtualenv dan install `requirements.txt`.
4. Buat environment file `/etc/default/kmzinfra`.
5. Buat service systemd `kmzinfra`.
6. Konfigurasi nginx (kecuali pakai `--no-nginx`).

### 4) Verifikasi setelah install

```bash
sudo systemctl status kmzinfra
sudo journalctl -u kmzinfra -n 100 --no-pager
```

Jika nginx aktif:

```bash
sudo nginx -t
sudo systemctl status nginx
```

## Halaman Aplikasi

- Landing page: `/`
- Login: `/login`
- Dashboard: `/dashboard`
- Backup Restore: `/backup`
- Pengaturan: `/settings`

## Akses Dari Jaringan LAN

Aplikasi bind ke `0.0.0.0` saat mode development Windows (`start.bat`), sehingga bisa diakses perangkat lain pada jaringan yang sama.

Contoh akses:
- `http://IP-PC:5000`

Catatan:
- Jika tidak bisa diakses, buka port 5000 di firewall.

## Catatan GPS Handphone

Browser mobile biasanya menolak geolocation jika aplikasi diakses via HTTP dengan IP LAN.

Gunakan salah satu:
- HTTPS (direkomendasikan produksi)
- localhost

## Backup dan Restore

Menu Backup Restore ada di halaman `/backup`.

Fitur:
1. Buat backup database SQLite
2. Refresh daftar backup
3. Download file backup
4. Restore dari backup terpilih

Saat restore, aplikasi otomatis membuat backup pengaman `pre_restore_...`.

## Panel Update Dari GitHub

Panel update tersedia di halaman `/settings`.

Fitur:
1. Cek update (bandingkan local commit vs remote)
2. Update sekarang (git pull dari server)

### Enable tombol Update Sekarang

Secara default update via web dinonaktifkan untuk keamanan.

Edit file environment:

```bash
sudo nano /etc/default/kmzinfra
```

Tambahkan/ubah:

```bash
KMZINFRA_ENABLE_WEB_UPDATE=1
KMZINFRA_UPDATE_REMOTE=origin
KMZINFRA_UPDATE_BRANCH=main
```

Lalu restart service:

```bash
sudo systemctl restart kmzinfra
```

## Menjalankan Manual (Opsional)

Windows:

```bash
py -3 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

## Struktur Project (Terbaru)

```text
kmzinfra/
├─ app.py
├─ install.sh
├─ start.bat
├─ requirements.txt
├─ data/
├─ backups/
├─ static/
│  ├─ app.js
│  ├─ backup.js
│  ├─ nav.js
│  ├─ settings.js
│  └─ style.css
└─ templates/
   ├─ landing.html
   ├─ login.html
   ├─ dashboard.html
   ├─ backup.html
   └─ settings.html
```
