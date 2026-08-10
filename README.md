# KMZ Infra Mapper

Aplikasi web sederhana untuk pemetaan koordinat infrastruktur:
- TIANG
- ODP Fiber Optik
- CLOSURE
- dan tipe custom lain sesuai kebutuhan

Backend menggunakan Flask dan database SQLite (tanpa Docker).

## Fitur

- Landing page publik
- Login page untuk akses dashboard
- Menu bar utama setelah login (Dashboard, Pengaturan, Logout)
- Peta interaktif (Leaflet + OpenStreetMap)
- Input titik koordinat via form atau klik peta
- Ambil koordinat langsung dari GPS handphone (geolocation browser)
- Master jenis infrastruktur dinamis (bisa tambah sendiri: TIANG, ODP, CLOSURE, dll)
- Master jenis aset per tipe infrastruktur (jenis aset menyesuaikan tipe terpilih)
- CRUD data infrastruktur (tambah, lihat, edit, hapus)
- Filter berdasarkan jenis infrastruktur
- Pengaturan data perusahaan
- Pengaturan tampilan landing page
- Panel manajemen ID teknisi/operator lapangan
- Jalur garis hubung antar titik infrastruktur (server, tiang, ODP, closure)
- Export KMZ berisi titik dan jalur koneksi
- Tampilan mobile responsif dengan hamburger menu dan bottom navigation
- Compact mode dashboard untuk layar handphone
- Penyimpanan data lokal di SQLite: `data/kmzinfra.db`

## Menjalankan di Windows

Prasyarat:
- Python 3.10+ terpasang

Langkah cepat:
1. Buka folder project ini.
2. Jalankan `start.bat`.
3. Buka browser ke `http://127.0.0.1:5000`.

Default login pertama:
- Username: `admin`
- Password: `admin123`

Halaman aplikasi:
- Landing page: `/`
- Login page: `/login`
- Dashboard (setelah login): `/dashboard`
- Backup & Restore (setelah login): `/backup`
- Pengaturan perusahaan & landing page (setelah login): `/settings`

## Install Cepat Debian/Ubuntu

Tersedia script installer otomatis: `install.sh`.

Contoh penggunaan:

```bash
chmod +x install.sh
./install.sh
```

Contoh opsi:

```bash
./install.sh --app-dir /opt/kmzinfra --port 5000 --domain mydomain.com
./install.sh --no-nginx
```

Yang dilakukan script:
1. Install dependency sistem (`python3`, `venv`, `pip`, `nginx`, dll).
2. Deploy source code ke folder target.
3. Buat virtual environment dan install requirements.
4. Buat service `systemd` bernama `kmzinfra`.
5. (Default) konfigurasi reverse proxy Nginx ke aplikasi.

## Fitur Jalur KMZ

Di dashboard tersedia panel Jalur Antar Infrastruktur:
1. Pilih Titik Asal dan Titik Tujuan.
2. Isi Nama Jalur (opsional).
3. Klik Tambah Jalur untuk membuat garis hubung di peta.
4. Klik Export KMZ Jalur untuk mengunduh file KMZ.

Output KMZ berisi:
- Folder Titik Infrastruktur
- Folder Jalur Infrastruktur (LineString antar titik)

## Akses Dari Semua IP (LAN)

Aplikasi default berjalan dengan bind `0.0.0.0`, jadi bisa diakses dari perangkat lain dalam jaringan yang sama.

Langkah:
1. Jalankan aplikasi di PC/laptop.
2. Cari IP perangkat (contoh Windows: `ipconfig`, ambil IPv4 Address).
3. Akses dari perangkat lain: `http://IP-PC:5000`.

Catatan:
- Jika tidak bisa diakses, izinkan port `5000` di Windows Firewall.
- Host/port bisa diubah via environment variable:
    - `KMZINFRA_HOST` (default `0.0.0.0`)
    - `KMZINFRA_PORT` (default `5000`)
    - `KMZINFRA_DEBUG` (default `1`)

## Backup dan Restore

Menu Backup & Restore tersedia di menu bar setelah login (halaman `/backup`).

Fitur:
1. `Buat Backup Sekarang`: membuat snapshot SQLite ke folder `backups/`.
2. `Refresh Daftar Backup`: memuat ulang daftar file backup.
3. `Download Backup`: mengunduh file backup terpilih.
4. `Restore Backup`: memulihkan database dari file backup terpilih.

Catatan keamanan data:
- Saat restore, aplikasi otomatis membuat backup pengaman dengan prefix `pre_restore_` sebelum mengganti database aktif.

## Akses dari Handphone + GPS

1. Pastikan laptop/PC dan handphone berada di jaringan Wi-Fi yang sama.
2. Jalankan aplikasi di laptop/PC.
3. Di handphone, buka `http://IP-LAPTOP:5000`.
4. Tekan tombol `Ambil GPS Saya` atau `GPS + Fokus Peta`.
5. Izinkan akses lokasi saat browser meminta permission.

Catatan:
- Browser mobile (Chrome/Safari) umumnya menolak geolocation jika aplikasi dibuka lewat HTTP pada IP LAN (contoh: http://192.168.x.x:5000).
- Geolocation biasanya hanya diizinkan pada HTTPS atau localhost.
- Untuk penggunaan produksi/public, jalankan aplikasi di domain HTTPS (misalnya melalui Nginx + SSL di Proxmox).

Troubleshooting:
- Jika muncul pesan `Python tidak ditemukan`, install Python 3.10+ dari python.org lalu centang `Add Python to PATH` saat instalasi.
- Setelah install Python, tutup lalu buka lagi terminal/VS Code, kemudian jalankan ulang `start.bat`.

## Menjalankan manual (opsional)

```bash
py -3 -m venv .venv   # jika py tersedia
# atau
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

## Struktur Project

```text
kmzinfra/
├─ app.py
├─ requirements.txt
├─ start.bat
├─ data/
│  └─ kmzinfra.db (otomatis dibuat)
├─ templates/
│  └─ index.html
└─ static/
   ├─ style.css
   └─ app.js
```

## Deploy ke Proxmox (VM / LXC, tanpa Docker)

Contoh asumsi:
- OS guest: Ubuntu 22.04
- Aplikasi diletakkan di: `/opt/kmzinfra`
- User service: `www-data`
- Port internal app: `5000`

### 1) Install dependency sistem

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nginx
```

### 2) Deploy source code

```bash
sudo mkdir -p /opt/kmzinfra
sudo chown -R $USER:$USER /opt/kmzinfra
# copy source code ke /opt/kmzinfra
cd /opt/kmzinfra
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 3) Uji jalan lokal di server

```bash
source /opt/kmzinfra/.venv/bin/activate
python /opt/kmzinfra/app.py
```

### 4) Buat systemd service Gunicorn

Buat file `/etc/systemd/system/kmzinfra.service`:

```ini
[Unit]
Description=KMZ Infra Mapper (Flask + Gunicorn)
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/opt/kmzinfra
Environment="PATH=/opt/kmzinfra/.venv/bin"
ExecStart=/opt/kmzinfra/.venv/bin/gunicorn -w 2 -b 127.0.0.1:5000 app:app
Restart=always

[Install]
WantedBy=multi-user.target
```

Aktifkan service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable kmzinfra
sudo systemctl start kmzinfra
sudo systemctl status kmzinfra
```

### 5) Reverse proxy Nginx

Buat file `/etc/nginx/sites-available/kmzinfra`:

```nginx
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Aktifkan konfigurasi:

```bash
sudo ln -s /etc/nginx/sites-available/kmzinfra /etc/nginx/sites-enabled/kmzinfra
sudo nginx -t
sudo systemctl reload nginx
```

Selesai. Aplikasi dapat diakses via IP VM/LXC Proxmox.
