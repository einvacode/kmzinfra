from __future__ import annotations

from datetime import datetime
from functools import wraps
import io
import json
import os
import shutil
import sqlite3
import subprocess
from pathlib import Path
from typing import Any
import zipfile

from flask import Flask, g, jsonify, redirect, render_template, request, send_file, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "kmzinfra.db"
BACKUP_DIR = BASE_DIR / "backups"

app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("KMZINFRA_SECRET_KEY", "change-this-in-production")
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

DEFAULT_INFRA_TYPES = ["TIANG", "ODP_FIBER_OPTIK", "CLOSURE"]
DEFAULT_ADMIN_USERNAME = os.getenv("KMZINFRA_ADMIN_USER", "admin")
DEFAULT_ADMIN_PASSWORD = os.getenv("KMZINFRA_ADMIN_PASS", "admin123")

DEFAULT_SITE_SETTINGS: dict[str, str] = {
    "company_name": "PT GeoFiber Nusantara",
    "company_address": "Jl. Infrastruktur No. 1",
    "company_phone": "+62-000-0000",
    "company_email": "info@geofiber.local",
    "landing_title": "Platform Pemetaan Infrastruktur Fiber",
    "landing_tagline": "Kelola titik TIANG, ODP, CLOSURE, dan aset lain dalam satu dashboard.",
    "landing_description": "Aplikasi ini membantu tim lapangan mencatat, memperbarui, dan memantau posisi infrastruktur fiber secara cepat dari desktop maupun handphone.",
    "landing_button_text": "Masuk Ke Dashboard",
    "landing_button_url": "/login",
}
DEFAULT_ASSETS: dict[str, list[str]] = {
    "TIANG": ["TIANG_7M", "TIANG_9M", "TIANG_BETON"],
    "ODP_FIBER_OPTIK": ["ODP_POLE", "ODP_WALL", "ODP_CLOSURE"],
    "CLOSURE": ["CLOSURE_INLINE", "CLOSURE_DOME"],
}

UPDATE_REMOTE = os.getenv("KMZINFRA_UPDATE_REMOTE", "origin")
UPDATE_BRANCH = os.getenv("KMZINFRA_UPDATE_BRANCH", "main")
ENABLE_WEB_UPDATE = os.getenv("KMZINFRA_ENABLE_WEB_UPDATE", "0") == "1"


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


def ensure_dirs() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    BACKUP_DIR.mkdir(exist_ok=True)


@app.teardown_appcontext
def close_db(_: Any) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    ensure_dirs()
    db = get_db()
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS field_staff (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            staff_id TEXT NOT NULL UNIQUE,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL,
            password_hash TEXT NOT NULL DEFAULT '',
            phone TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    staff_columns = db.execute("PRAGMA table_info(field_staff)").fetchall()
    staff_column_names = {col[1] for col in staff_columns}
    if "password_hash" not in staff_column_names:
        db.execute("ALTER TABLE field_staff ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''")

    db.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            must_change_password INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    user_columns = db.execute("PRAGMA table_info(users)").fetchall()
    user_column_names = {col[1] for col in user_columns}
    if "must_change_password" not in user_column_names:
        db.execute("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0")

    db.execute(
        """
        CREATE TABLE IF NOT EXISTS site_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            company_name TEXT NOT NULL,
            company_address TEXT NOT NULL,
            company_phone TEXT NOT NULL,
            company_email TEXT NOT NULL,
            landing_title TEXT NOT NULL,
            landing_tagline TEXT NOT NULL,
            landing_description TEXT NOT NULL,
            landing_button_text TEXT NOT NULL,
            landing_button_url TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    db.execute(
        """
        INSERT OR IGNORE INTO site_settings (
            id,
            company_name,
            company_address,
            company_phone,
            company_email,
            landing_title,
            landing_tagline,
            landing_description,
            landing_button_text,
            landing_button_url
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            DEFAULT_SITE_SETTINGS["company_name"],
            DEFAULT_SITE_SETTINGS["company_address"],
            DEFAULT_SITE_SETTINGS["company_phone"],
            DEFAULT_SITE_SETTINGS["company_email"],
            DEFAULT_SITE_SETTINGS["landing_title"],
            DEFAULT_SITE_SETTINGS["landing_tagline"],
            DEFAULT_SITE_SETTINGS["landing_description"],
            DEFAULT_SITE_SETTINGS["landing_button_text"],
            DEFAULT_SITE_SETTINGS["landing_button_url"],
        ),
    )

    has_any_user = db.execute("SELECT id FROM users LIMIT 1").fetchone()
    if not has_any_user:
        db.execute(
            """
            INSERT INTO users (username, password_hash, must_change_password)
            VALUES (?, ?, 1)
            """,
            (DEFAULT_ADMIN_USERNAME, generate_password_hash(DEFAULT_ADMIN_PASSWORD)),
        )

    # Paksa ganti password untuk akun yang masih memakai password default.
    default_rows = db.execute("SELECT id, password_hash FROM users").fetchall()
    for row in default_rows:
        if check_password_hash(row["password_hash"], DEFAULT_ADMIN_PASSWORD):
            db.execute("UPDATE users SET must_change_password = 1 WHERE id = ?", (row["id"],))

    db.execute(
        """
        CREATE TABLE IF NOT EXISTS infra_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            infra_type TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    infra_type_count = db.execute("SELECT COUNT(1) AS total FROM infra_types").fetchone()["total"]
    if infra_type_count == 0:
        for infra_type in DEFAULT_INFRA_TYPES:
            db.execute(
                """
                INSERT INTO infra_types (infra_type)
                VALUES (?)
                """,
                (infra_type,),
            )

    db.execute(
        """
        CREATE TABLE IF NOT EXISTS infrastructure (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            infra_type TEXT NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            address TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            status TEXT DEFAULT 'AKTIF',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    db.execute(
        """
        CREATE TABLE IF NOT EXISTS infra_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_infra_id INTEGER NOT NULL,
            to_infra_id INTEGER NOT NULL,
            line_name TEXT DEFAULT '',
            route_geometry TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(from_infra_id, to_infra_id),
            FOREIGN KEY(from_infra_id) REFERENCES infrastructure(id) ON DELETE CASCADE,
            FOREIGN KEY(to_infra_id) REFERENCES infrastructure(id) ON DELETE CASCADE
        )
        """
    )

    link_columns = db.execute("PRAGMA table_info(infra_links)").fetchall()
    link_column_names = {col[1] for col in link_columns}
    if "route_geometry" not in link_column_names:
        db.execute("ALTER TABLE infra_links ADD COLUMN route_geometry TEXT NOT NULL DEFAULT '[]'")

    # Migrasi penamaan lama RIANG -> TIANG pada data titik.
    db.execute("UPDATE infrastructure SET infra_type = 'TIANG' WHERE infra_type = 'RIANG'")

    db.execute(
        """
        CREATE TABLE IF NOT EXISTS asset_types (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            infra_type TEXT NOT NULL,
            asset_name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(infra_type, asset_name)
        )
        """
    )

    # Migrasi penamaan lama RIANG -> TIANG pada master aset.
    db.execute(
        """
        INSERT OR IGNORE INTO asset_types (infra_type, asset_name)
        SELECT 'TIANG', asset_name
        FROM asset_types
        WHERE infra_type = 'RIANG'
        """
    )
    db.execute("DELETE FROM asset_types WHERE infra_type = 'RIANG'")

    columns = db.execute("PRAGMA table_info(infrastructure)").fetchall()
    column_names = {col[1] for col in columns}
    if "asset_name" not in column_names:
        db.execute("ALTER TABLE infrastructure ADD COLUMN asset_name TEXT NOT NULL DEFAULT 'UMUM'")

    # Pastikan data lama yang null/blank mendapat nilai default.
    db.execute("UPDATE infrastructure SET asset_name = 'UMUM' WHERE asset_name IS NULL OR TRIM(asset_name) = ''")

    asset_type_count = db.execute("SELECT COUNT(1) AS total FROM asset_types").fetchone()["total"]
    if asset_type_count == 0:
        for infra_type, assets in DEFAULT_ASSETS.items():
            for asset_name in assets:
                db.execute(
                    """
                    INSERT INTO asset_types (infra_type, asset_name)
                    VALUES (?, ?)
                    """,
                    (infra_type, asset_name),
                )

    db.commit()


def _error(message: str, status_code: int = 400):
    return jsonify({"ok": False, "message": message}), status_code


def get_site_settings() -> dict[str, Any]:
    init_db()
    db = get_db()
    row = db.execute(
        """
        SELECT
            company_name,
            company_address,
            company_phone,
            company_email,
            landing_title,
            landing_tagline,
            landing_description,
            landing_button_text,
            landing_button_url,
            updated_at
        FROM site_settings
        WHERE id = 1
        """
    ).fetchone()

    if not row:
        return dict(DEFAULT_SITE_SETTINGS)

    return dict(row)


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            if request.path.startswith("/api/"):
                return _error("Sesi login tidak valid. Silakan login ulang.", 401)
            return redirect(url_for("login", next=request.path))

        auth_source = session.get("auth_source", "users")

        if auth_source == "field_staff":
            db = get_db()
            staff_row = db.execute(
                "SELECT id, is_active FROM field_staff WHERE id = ?",
                (session.get("user_id"),),
            ).fetchone()
            if not staff_row:
                session.clear()
                if request.path.startswith("/api/"):
                    return _error("Akun teknisi/operator tidak ditemukan. Silakan login ulang.", 401)
                return redirect(url_for("login", next=request.path))
            if int(staff_row["is_active"]) != 1:
                session.clear()
                if request.path.startswith("/api/"):
                    return _error("Akun teknisi/operator nonaktif.", 403)
                return redirect(url_for("login", next=request.path))
            return fn(*args, **kwargs)

        db = get_db()
        user_row = db.execute(
            "SELECT id, must_change_password FROM users WHERE id = ?",
            (session.get("user_id"),),
        ).fetchone()
        if not user_row:
            session.clear()
            if request.path.startswith("/api/"):
                return _error("Akun tidak ditemukan. Silakan login ulang.", 401)
            return redirect(url_for("login", next=request.path))

        session["force_password_change"] = bool(user_row["must_change_password"])

        # Jika user wajib ganti password, batasi akses hanya ke halaman admin akun,
        # endpoint update user, dan logout sampai password diganti.
        if session.get("force_password_change"):
            allowed_exact_paths = {"/admin-account", "/logout"}
            allowed_api_prefixes = {"/api/users"}
            is_allowed_path = request.path in allowed_exact_paths
            is_allowed_api = any(request.path.startswith(prefix) for prefix in allowed_api_prefixes)

            if request.path.startswith("/api/") and not is_allowed_api:
                return _error("Anda wajib mengganti password default admin sebelum mengakses menu lain.", 403)

            if not request.path.startswith("/api/") and not is_allowed_path:
                return redirect(url_for("admin_account_page", forced="1"))

        return fn(*args, **kwargs)

    return wrapper


def is_field_staff_session() -> bool:
    return session.get("auth_source") == "field_staff"


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            if request.path.startswith("/api/"):
                return _error("Sesi login tidak valid. Silakan login ulang.", 401)
            return redirect(url_for("login", next=request.path))
        if is_field_staff_session():
            if request.path.startswith("/api/"):
                return _error("Menu ini hanya dapat diakses oleh admin.", 403)
            return redirect(url_for("dashboard"))
        return fn(*args, **kwargs)

    return wrapper


def _safe_backup_path(filename: str) -> Path:
    safe_name = Path(filename).name
    if not safe_name.endswith(".db"):
        raise ValueError("File backup harus berekstensi .db")
    candidate = BACKUP_DIR / safe_name
    if candidate.parent != BACKUP_DIR:
        raise ValueError("Nama file backup tidak valid")
    return candidate


def _backup_filename(prefix: str = "kmzinfra_backup") -> str:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"{prefix}_{timestamp}.db"


def _kml_escape(text: str) -> str:
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def _run_git_command(args: list[str], timeout: int = 20) -> str:
    process = subprocess.run(
        ["git", *args],
        cwd=BASE_DIR,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
    if process.returncode != 0:
        message = (process.stderr or process.stdout or "Perintah git gagal").strip()
        raise RuntimeError(message)
    return process.stdout.strip()


def get_update_status() -> dict[str, Any]:
    if not (BASE_DIR / ".git").exists():
        return {
            "repository_found": False,
            "has_update": False,
            "can_update": False,
            "message": "Folder aplikasi ini bukan repository git.",
        }

    try:
        branch = _run_git_command(["rev-parse", "--abbrev-ref", "HEAD"])
        local_hash = _run_git_command(["rev-parse", "HEAD"])
        _run_git_command(["fetch", UPDATE_REMOTE, branch])
        remote_hash = _run_git_command(["rev-parse", f"{UPDATE_REMOTE}/{branch}"])
        has_update = local_hash != remote_hash

        return {
            "repository_found": True,
            "branch": branch,
            "local_hash": local_hash,
            "remote_hash": remote_hash,
            "has_update": has_update,
            "can_update": ENABLE_WEB_UPDATE,
            "message": "Update tersedia." if has_update else "Aplikasi sudah versi terbaru.",
        }
    except Exception as exc:
        return {
            "repository_found": True,
            "has_update": False,
            "can_update": ENABLE_WEB_UPDATE,
            "message": f"Gagal mengecek update: {exc}",
        }


def apply_git_update() -> dict[str, Any]:
    if not ENABLE_WEB_UPDATE:
        return {
            "ok": False,
            "message": "Web update nonaktif. Set KMZINFRA_ENABLE_WEB_UPDATE=1 untuk mengaktifkan.",
        }

    if not (BASE_DIR / ".git").exists():
        return {
            "ok": False,
            "message": "Folder aplikasi ini bukan repository git.",
        }

    try:
        branch = _run_git_command(["rev-parse", "--abbrev-ref", "HEAD"])
        _run_git_command(["fetch", UPDATE_REMOTE, branch])
        pull_output = _run_git_command(["pull", "--ff-only", UPDATE_REMOTE, branch], timeout=60)

        requirements_path = BASE_DIR / "requirements.txt"
        pip_output = ""
        if requirements_path.exists():
            process = subprocess.run(
                [
                    str(BASE_DIR / ".venv" / "Scripts" / "python.exe")
                    if os.name == "nt"
                    else str(BASE_DIR / ".venv" / "bin" / "python"),
                    "-m",
                    "pip",
                    "install",
                    "-r",
                    str(requirements_path),
                ],
                cwd=BASE_DIR,
                capture_output=True,
                text=True,
                timeout=120,
                check=False,
            )
            if process.returncode == 0:
                pip_output = (process.stdout or "").strip()
            else:
                pip_output = (process.stderr or process.stdout or "").strip()

        return {
            "ok": True,
            "message": "Update selesai. Jika berjalan via systemd, restart service untuk memuat perubahan baru.",
            "pull_output": pull_output,
            "pip_output": pip_output,
        }
    except Exception as exc:
        return {
            "ok": False,
            "message": f"Update gagal: {exc}",
        }


def create_backup_file() -> Path:
    ensure_dirs()
    if not DB_PATH.exists():
        raise FileNotFoundError("Database belum tersedia untuk dibackup.")

    backup_path = BACKUP_DIR / _backup_filename()
    shutil.copy2(DB_PATH, backup_path)
    return backup_path


def restore_from_backup_file(backup_path: Path) -> None:
    if "db" in g:
        g.db.close()
        g.pop("db", None)

    ensure_dirs()
    if not backup_path.exists():
        raise FileNotFoundError("File backup tidak ditemukan.")

    if DB_PATH.exists():
        safety_path = BACKUP_DIR / _backup_filename(prefix="pre_restore")
        shutil.copy2(DB_PATH, safety_path)

    shutil.copy2(backup_path, DB_PATH)


def _to_float(value: Any, field_name: str) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ValueError(f"Field '{field_name}' harus berupa angka.")


def parse_route_geometry(value: Any) -> list[list[float]]:
    if not isinstance(value, list) or len(value) < 2:
        raise ValueError("Geometri jalur harus berisi minimal dua titik koordinat.")

    geometry: list[list[float]] = []
    for index, point in enumerate(value, start=1):
        if not isinstance(point, (list, tuple)) or len(point) != 2:
            raise ValueError(f"Titik jalur ke-{index} tidak valid.")
        latitude = _to_float(point[0], f"route_geometry[{index}].latitude")
        longitude = _to_float(point[1], f"route_geometry[{index}].longitude")
        if not (-90 <= latitude <= 90) or not (-180 <= longitude <= 180):
            raise ValueError(f"Titik jalur ke-{index} berada di luar rentang koordinat.")
        geometry.append([latitude, longitude])
    return geometry


def get_route_coordinates(link: dict[str, Any]) -> list[list[float]]:
    default_geometry = [
        [link["from_latitude"], link["from_longitude"]],
        [link["to_latitude"], link["to_longitude"]],
    ]
    try:
        geometry = json.loads(link.get("route_geometry") or "[]")
        parsed = parse_route_geometry(geometry)
    except (ValueError, TypeError, json.JSONDecodeError):
        parsed = default_geometry

    parsed[0] = default_geometry[0]
    parsed[-1] = default_geometry[-1]
    return parsed


def is_valid_infra_type(infra_type: str) -> bool:
    db = get_db()
    row = db.execute("SELECT id FROM infra_types WHERE infra_type = ?", (infra_type,)).fetchone()
    return row is not None


def parse_payload(payload: dict[str, Any]) -> dict[str, Any]:
    name = str(payload.get("name", "")).strip()
    infra_type = str(payload.get("infra_type", "")).strip().upper()
    asset_name = str(payload.get("asset_name", "")).strip().upper()
    address = str(payload.get("address", "")).strip()
    notes = str(payload.get("notes", "")).strip()
    status = str(payload.get("status", "AKTIF")).strip().upper() or "AKTIF"

    if not name:
        raise ValueError("Field 'name' wajib diisi.")

    if not is_valid_infra_type(infra_type):
        raise ValueError("Field 'infra_type' tidak terdaftar. Tambahkan dulu di menu jenis infrastruktur.")

    if not asset_name:
        raise ValueError("Field 'asset_name' wajib dipilih.")

    db = get_db()
    asset_exists = db.execute(
        "SELECT id FROM asset_types WHERE infra_type = ? AND asset_name = ?",
        (infra_type, asset_name),
    ).fetchone()
    if not asset_exists:
        raise ValueError("Jenis aset tidak valid untuk tipe infrastruktur yang dipilih.")

    latitude = _to_float(payload.get("latitude"), "latitude")
    longitude = _to_float(payload.get("longitude"), "longitude")

    if not (-90 <= latitude <= 90):
        raise ValueError("Nilai latitude harus di rentang -90 sampai 90.")

    if not (-180 <= longitude <= 180):
        raise ValueError("Nilai longitude harus di rentang -180 sampai 180.")

    return {
        "name": name,
        "infra_type": infra_type,
        "asset_name": asset_name,
        "latitude": latitude,
        "longitude": longitude,
        "address": address,
        "notes": notes,
        "status": status,
    }


@app.route("/")
def landing_page():
    init_db()
    settings = get_site_settings()
    return render_template("landing.html", settings=settings)


@app.route("/login", methods=["GET", "POST"])
def login():
    init_db()
    if "user_id" in session:
        if session.get("auth_source", "users") == "users":
            db = get_db()
            existing_user = db.execute(
                "SELECT id, must_change_password FROM users WHERE id = ?",
                (session.get("user_id"),),
            ).fetchone()
            if existing_user and existing_user["must_change_password"]:
                session["force_password_change"] = True
                return redirect(url_for("admin_account_page", forced="1"))
        return redirect(url_for("dashboard"))

    error_message = ""
    if request.method == "POST":
        username = str(request.form.get("username", "")).strip()
        login_id = username.upper()
        password = str(request.form.get("password", ""))
        next_url = str(request.form.get("next", "")).strip()

        db = get_db()
        user = db.execute(
            "SELECT id, username, password_hash, must_change_password FROM users WHERE username = ?",
            (username,),
        ).fetchone()

        if user and check_password_hash(user["password_hash"], password):
            session.clear()
            session["user_id"] = user["id"]
            session["username"] = user["username"]
            session["auth_source"] = "users"
            session["force_password_change"] = bool(user["must_change_password"])
            if session["force_password_change"]:
                return redirect(url_for("admin_account_page", forced="1"))
            if next_url.startswith("/") and not next_url.startswith("//"):
                return redirect(next_url)
            return redirect(url_for("dashboard"))

        staff = db.execute(
            """
            SELECT id, staff_id, full_name, role, password_hash, is_active
            FROM field_staff
            WHERE staff_id = ?
            """,
            (login_id,),
        ).fetchone()

        if staff and int(staff["is_active"]) == 1 and staff["password_hash"] and check_password_hash(staff["password_hash"], password):
            session.clear()
            session["user_id"] = staff["id"]
            session["username"] = staff["staff_id"]
            session["display_name"] = staff["full_name"]
            session["staff_role"] = staff["role"]
            session["auth_source"] = "field_staff"
            session["force_password_change"] = False
            if next_url.startswith("/") and not next_url.startswith("//"):
                return redirect(next_url)
            return redirect(url_for("dashboard"))

        error_message = "Username atau password salah."

    next_url = request.args.get("next", "")
    settings = get_site_settings()
    return render_template("login.html", error_message=error_message, next_url=next_url, settings=settings)


@app.route("/logout", methods=["POST"])
@login_required
def logout():
    session.clear()
    return redirect(url_for("landing_page"))


@app.route("/dashboard")
@login_required
def dashboard():
    settings = get_site_settings()
    username = session.get("display_name") or session.get("username", "admin")
    return render_template(
        "dashboard.html",
        settings=settings,
        username=username,
        map_mode=False,
        is_field_staff=is_field_staff_session(),
        staff_role=session.get("staff_role", ""),
    )


@app.route("/map-routes")
@login_required
def map_routes_page():
    settings = get_site_settings()
    username = session.get("display_name") or session.get("username", "admin")
    return render_template(
        "dashboard.html",
        settings=settings,
        username=username,
        map_mode=True,
        is_field_staff=is_field_staff_session(),
        staff_role=session.get("staff_role", ""),
    )


@app.route("/settings")
@admin_required
def settings_page():
    settings = get_site_settings()
    username = session.get("display_name") or session.get("username", "admin")
    return render_template("settings.html", settings=settings, username=username)


@app.route("/admin-account")
@admin_required
def admin_account_page():
    settings = get_site_settings()
    forced_password_change = request.args.get("forced") == "1" or bool(session.get("force_password_change"))
    username = session.get("display_name") or session.get("username", "admin")
    return render_template(
        "admin_account.html",
        settings=settings,
        username=username,
        forced_password_change=forced_password_change,
    )


@app.route("/backup")
@admin_required
def backup_page():
    settings = get_site_settings()
    username = session.get("display_name") or session.get("username", "admin")
    return render_template("backup.html", settings=settings, username=username)


@app.route("/api/infra", methods=["GET"])
@login_required
def list_infra():
    init_db()
    selected_type = request.args.get("infra_type", "").strip().upper()

    db = get_db()
    if selected_type and is_valid_infra_type(selected_type):
        rows = db.execute(
            """
            SELECT id, name, infra_type, asset_name, latitude, longitude, address, notes, status, created_at, updated_at
            FROM infrastructure
            WHERE infra_type = ?
            ORDER BY id DESC
            """,
            (selected_type,),
        ).fetchall()
    else:
        rows = db.execute(
            """
            SELECT id, name, infra_type, asset_name, latitude, longitude, address, notes, status, created_at, updated_at
            FROM infrastructure
            ORDER BY id DESC
            """
        ).fetchall()

    return jsonify({"ok": True, "data": [dict(r) for r in rows]})


@app.route("/api/infra", methods=["POST"])
@login_required
def create_infra():
    init_db()
    payload = request.get_json(silent=True) or {}
    try:
        data = parse_payload(payload)
    except ValueError as exc:
        return _error(str(exc), 422)

    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO infrastructure (name, infra_type, asset_name, latitude, longitude, address, notes, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data["name"],
            data["infra_type"],
            data["asset_name"],
            data["latitude"],
            data["longitude"],
            data["address"],
            data["notes"],
            data["status"],
        ),
    )
    db.commit()

    return jsonify({"ok": True, "id": cursor.lastrowid}), 201


@app.route("/api/infra/<int:item_id>", methods=["PUT"])
@login_required
def update_infra(item_id: int):
    init_db()
    payload = request.get_json(silent=True) or {}
    try:
        data = parse_payload(payload)
    except ValueError as exc:
        return _error(str(exc), 422)

    db = get_db()
    exists = db.execute("SELECT id FROM infrastructure WHERE id = ?", (item_id,)).fetchone()
    if not exists:
        return _error("Data tidak ditemukan.", 404)

    db.execute(
        """
        UPDATE infrastructure
        SET name = ?, infra_type = ?, asset_name = ?, latitude = ?, longitude = ?, address = ?, notes = ?, status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (
            data["name"],
            data["infra_type"],
            data["asset_name"],
            data["latitude"],
            data["longitude"],
            data["address"],
            data["notes"],
            data["status"],
            item_id,
        ),
    )
    db.commit()

    return jsonify({"ok": True, "message": "Data berhasil diperbarui."})


@app.route("/api/infra/<int:item_id>", methods=["DELETE"])
@admin_required
def delete_infra(item_id: int):
    init_db()
    db = get_db()
    linked_routes = db.execute(
        "SELECT COUNT(1) AS total FROM infra_links WHERE from_infra_id = ? OR to_infra_id = ?",
        (item_id, item_id),
    ).fetchone()["total"]
    db.execute("DELETE FROM infra_links WHERE from_infra_id = ? OR to_infra_id = ?", (item_id, item_id))
    cursor = db.execute("DELETE FROM infrastructure WHERE id = ?", (item_id,))
    db.commit()

    if cursor.rowcount == 0:
        return _error("Data tidak ditemukan.", 404)

    return jsonify(
        {
            "ok": True,
            "message": "Titik berhasil dihapus.",
            "deleted_link_count": linked_routes,
        }
    )


@app.route("/api/infra/<int:item_id>/coordinates", methods=["PUT"])
@admin_required
def update_infra_coordinates(item_id: int):
    init_db()
    payload = request.get_json(silent=True) or {}
    try:
        latitude = _to_float(payload.get("latitude"), "latitude")
        longitude = _to_float(payload.get("longitude"), "longitude")
    except ValueError as exc:
        return _error(str(exc), 422)

    if not (-90 <= latitude <= 90) or not (-180 <= longitude <= 180):
        return _error("Koordinat berada di luar rentang yang valid.", 422)

    db = get_db()
    cursor = db.execute(
        """
        UPDATE infrastructure
        SET latitude = ?, longitude = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (latitude, longitude, item_id),
    )
    db.commit()
    if cursor.rowcount == 0:
        return _error("Data titik tidak ditemukan.", 404)
    return jsonify({"ok": True, "message": "Koordinat titik berhasil diperbarui."})


@app.route("/api/infra-links", methods=["GET"])
@login_required
def list_infra_links():
    init_db()
    db = get_db()
    rows = db.execute(
        """
        SELECT
            l.id,
            l.from_infra_id,
            l.to_infra_id,
            l.line_name,
            l.route_geometry,
            l.created_at,
            f.name AS from_name,
            f.infra_type AS from_type,
            f.latitude AS from_latitude,
            f.longitude AS from_longitude,
            t.name AS to_name,
            t.infra_type AS to_type,
            t.latitude AS to_latitude,
            t.longitude AS to_longitude
        FROM infra_links l
        JOIN infrastructure f ON f.id = l.from_infra_id
        JOIN infrastructure t ON t.id = l.to_infra_id
        ORDER BY l.id DESC
        """
    ).fetchall()
    data = []
    for row in rows:
        item = dict(row)
        item["route_coordinates"] = get_route_coordinates(item)
        item.pop("route_geometry", None)
        data.append(item)
    return jsonify({"ok": True, "data": data})


@app.route("/api/infra-links", methods=["POST"])
@admin_required
def create_infra_link():
    init_db()
    payload = request.get_json(silent=True) or {}

    try:
        from_infra_id = int(payload.get("from_infra_id"))
        to_infra_id = int(payload.get("to_infra_id"))
    except (TypeError, ValueError):
        return _error("from_infra_id dan to_infra_id wajib berupa angka.", 422)

    line_name = str(payload.get("line_name", "")).strip()

    if from_infra_id == to_infra_id:
        return _error("Titik asal dan tujuan tidak boleh sama.", 422)

    db = get_db()
    from_row = db.execute("SELECT id FROM infrastructure WHERE id = ?", (from_infra_id,)).fetchone()
    to_row = db.execute("SELECT id FROM infrastructure WHERE id = ?", (to_infra_id,)).fetchone()
    if not from_row or not to_row:
        return _error("Titik asal atau tujuan tidak ditemukan.", 404)

    exists = db.execute(
        """
        SELECT id FROM infra_links
        WHERE (from_infra_id = ? AND to_infra_id = ?)
           OR (from_infra_id = ? AND to_infra_id = ?)
        """,
        (from_infra_id, to_infra_id, to_infra_id, from_infra_id),
    ).fetchone()
    if exists:
        return _error("Jalur antara dua titik ini sudah ada.", 409)

    cursor = db.execute(
        """
        INSERT INTO infra_links (from_infra_id, to_infra_id, line_name)
        VALUES (?, ?, ?)
        """,
        (from_infra_id, to_infra_id, line_name),
    )
    db.commit()

    return jsonify({"ok": True, "id": cursor.lastrowid}), 201


@app.route("/api/infra-links/<int:item_id>", methods=["DELETE"])
@admin_required
def delete_infra_link(item_id: int):
    init_db()
    db = get_db()
    cursor = db.execute("DELETE FROM infra_links WHERE id = ?", (item_id,))
    db.commit()

    if cursor.rowcount == 0:
        return _error("Data jalur tidak ditemukan.", 404)

    return jsonify({"ok": True, "message": "Jalur berhasil dihapus."})


@app.route("/api/infra-links/<int:item_id>/geometry", methods=["PUT"])
@admin_required
def update_infra_link_geometry(item_id: int):
    init_db()
    payload = request.get_json(silent=True) or {}
    try:
        geometry = parse_route_geometry(payload.get("route_geometry"))
    except ValueError as exc:
        return _error(str(exc), 422)

    db = get_db()
    cursor = db.execute(
        "UPDATE infra_links SET route_geometry = ? WHERE id = ?",
        (json.dumps(geometry), item_id),
    )
    db.commit()
    if cursor.rowcount == 0:
        return _error("Data jalur tidak ditemukan.", 404)
    return jsonify({"ok": True, "message": "Bentuk jalur berhasil diperbarui."})


@app.route("/api/infra-links/<int:item_id>", methods=["PUT"])
@admin_required
def update_infra_link(item_id: int):
    init_db()
    payload = request.get_json(silent=True) or {}

    try:
        from_infra_id = int(payload.get("from_infra_id"))
        to_infra_id = int(payload.get("to_infra_id"))
    except (TypeError, ValueError):
        return _error("from_infra_id dan to_infra_id wajib berupa angka.", 422)

    line_name = str(payload.get("line_name", "")).strip()
    if from_infra_id == to_infra_id:
        return _error("Titik asal dan tujuan tidak boleh sama.", 422)

    db = get_db()
    current_link = db.execute("SELECT id FROM infra_links WHERE id = ?", (item_id,)).fetchone()
    if not current_link:
        return _error("Data jalur tidak ditemukan.", 404)

    from_row = db.execute("SELECT id FROM infrastructure WHERE id = ?", (from_infra_id,)).fetchone()
    to_row = db.execute("SELECT id FROM infrastructure WHERE id = ?", (to_infra_id,)).fetchone()
    if not from_row or not to_row:
        return _error("Titik asal atau tujuan tidak ditemukan.", 404)

    duplicate = db.execute(
        """
        SELECT id
        FROM infra_links
        WHERE id != ?
          AND ((from_infra_id = ? AND to_infra_id = ?)
            OR (from_infra_id = ? AND to_infra_id = ?))
        """,
        (item_id, from_infra_id, to_infra_id, to_infra_id, from_infra_id),
    ).fetchone()
    if duplicate:
        return _error("Jalur antara dua titik ini sudah ada.", 409)

    db.execute(
        """
        UPDATE infra_links
        SET from_infra_id = ?, to_infra_id = ?, line_name = ?
        WHERE id = ?
        """,
        (from_infra_id, to_infra_id, line_name, item_id),
    )
    db.commit()
    return jsonify({"ok": True, "message": "Jalur berhasil diperbarui."})


@app.route("/api/asset-types", methods=["GET"])
@login_required
def list_asset_types():
    init_db()
    selected_type = request.args.get("infra_type", "").strip().upper()
    db = get_db()

    if selected_type and is_valid_infra_type(selected_type):
        rows = db.execute(
            """
            SELECT id, infra_type, asset_name, created_at
            FROM asset_types
            WHERE infra_type = ?
            ORDER BY asset_name ASC
            """,
            (selected_type,),
        ).fetchall()
    else:
        rows = db.execute(
            """
            SELECT id, infra_type, asset_name, created_at
            FROM asset_types
            ORDER BY infra_type ASC, asset_name ASC
            """
        ).fetchall()

    return jsonify({"ok": True, "data": [dict(r) for r in rows]})


@app.route("/api/asset-types", methods=["POST"])
@login_required
def create_asset_type():
    init_db()
    payload = request.get_json(silent=True) or {}
    infra_type = str(payload.get("infra_type", "")).strip().upper()
    asset_name = str(payload.get("asset_name", "")).strip().upper()

    if not is_valid_infra_type(infra_type):
        return _error("Tipe infrastruktur tidak valid.", 422)

    if not asset_name:
        return _error("Nama aset wajib diisi.", 422)

    db = get_db()
    try:
        cursor = db.execute(
            """
            INSERT INTO asset_types (infra_type, asset_name)
            VALUES (?, ?)
            """,
            (infra_type, asset_name),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return _error("Aset sudah ada untuk tipe tersebut.", 409)

    return jsonify({"ok": True, "id": cursor.lastrowid}), 201


@app.route("/api/asset-types/<int:item_id>", methods=["DELETE"])
@login_required
def delete_asset_type(item_id: int):
    init_db()
    db = get_db()

    asset_row = db.execute(
        "SELECT id, infra_type, asset_name FROM asset_types WHERE id = ?",
        (item_id,),
    ).fetchone()
    if not asset_row:
        return _error("Data aset tidak ditemukan.", 404)

    usage = db.execute(
        """
        SELECT COUNT(1) AS total
        FROM infrastructure
        WHERE infra_type = ? AND asset_name = ?
        """,
        (asset_row["infra_type"], asset_row["asset_name"]),
    ).fetchone()
    if usage and usage["total"] > 0:
        return _error("Aset masih dipakai di data titik. Hapus data titik terkait terlebih dulu.", 409)

    db.execute("DELETE FROM asset_types WHERE id = ?", (item_id,))
    db.commit()

    return jsonify({"ok": True, "message": "Data aset berhasil dihapus."})


@app.route("/api/asset-types/<int:item_id>", methods=["PUT"])
@login_required
def update_asset_type(item_id: int):
    init_db()
    payload = request.get_json(silent=True) or {}
    asset_name = str(payload.get("asset_name", "")).strip().upper()

    if not asset_name:
        return _error("Nama aset wajib diisi.", 422)

    db = get_db()
    row = db.execute(
        "SELECT id, infra_type, asset_name FROM asset_types WHERE id = ?",
        (item_id,),
    ).fetchone()
    if not row:
        return _error("Data aset tidak ditemukan.", 404)

    duplicate = db.execute(
        """
        SELECT id
        FROM asset_types
        WHERE infra_type = ? AND asset_name = ? AND id != ?
        """,
        (row["infra_type"], asset_name, item_id),
    ).fetchone()
    if duplicate:
        return _error("Nama aset sudah ada pada tipe infrastruktur ini.", 409)

    old_asset_name = row["asset_name"]
    db.execute("UPDATE asset_types SET asset_name = ? WHERE id = ?", (asset_name, item_id))
    db.execute(
        """
        UPDATE infrastructure
        SET asset_name = ?, updated_at = CURRENT_TIMESTAMP
        WHERE infra_type = ? AND asset_name = ?
        """,
        (asset_name, row["infra_type"], old_asset_name),
    )
    db.commit()

    return jsonify({"ok": True, "message": "Jenis aset berhasil diperbarui."})


@app.route("/api/infra-types", methods=["GET"])
@login_required
def list_infra_types():
    init_db()
    db = get_db()
    rows = db.execute(
        """
        SELECT id, infra_type, created_at
        FROM infra_types
        ORDER BY infra_type ASC
        """
    ).fetchall()
    return jsonify({"ok": True, "data": [dict(r) for r in rows]})


@app.route("/api/infra-types", methods=["POST"])
@login_required
def create_infra_type():
    init_db()
    payload = request.get_json(silent=True) or {}
    infra_type = str(payload.get("infra_type", "")).strip().upper()

    if not infra_type:
        return _error("Nama jenis infrastruktur wajib diisi.", 422)

    db = get_db()
    try:
        cursor = db.execute(
            """
            INSERT INTO infra_types (infra_type)
            VALUES (?)
            """,
            (infra_type,),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return _error("Jenis infrastruktur sudah ada.", 409)

    return jsonify({"ok": True, "id": cursor.lastrowid}), 201


@app.route("/api/infra-types/<int:item_id>", methods=["DELETE"])
@login_required
def delete_infra_type(item_id: int):
    init_db()
    db = get_db()

    row = db.execute("SELECT id, infra_type FROM infra_types WHERE id = ?", (item_id,)).fetchone()
    if not row:
        return _error("Jenis infrastruktur tidak ditemukan.", 404)

    usage_points = db.execute(
        "SELECT COUNT(1) AS total FROM infrastructure WHERE infra_type = ?",
        (row["infra_type"],),
    ).fetchone()
    if usage_points and usage_points["total"] > 0:
        return _error("Jenis infrastruktur masih dipakai di data titik.", 409)

    usage_assets = db.execute(
        "SELECT COUNT(1) AS total FROM asset_types WHERE infra_type = ?",
        (row["infra_type"],),
    ).fetchone()
    if usage_assets and usage_assets["total"] > 0:
        return _error("Hapus dulu semua jenis aset pada tipe ini sebelum menghapus tipenya.", 409)

    db.execute("DELETE FROM infra_types WHERE id = ?", (item_id,))
    db.commit()

    return jsonify({"ok": True, "message": "Jenis infrastruktur berhasil dihapus."})


@app.route("/api/infra-types/<int:item_id>", methods=["PUT"])
@login_required
def update_infra_type(item_id: int):
    init_db()
    payload = request.get_json(silent=True) or {}
    infra_type = str(payload.get("infra_type", "")).strip().upper()

    if not infra_type:
        return _error("Nama jenis infrastruktur wajib diisi.", 422)

    db = get_db()
    row = db.execute("SELECT id, infra_type FROM infra_types WHERE id = ?", (item_id,)).fetchone()
    if not row:
        return _error("Jenis infrastruktur tidak ditemukan.", 404)

    duplicate = db.execute(
        "SELECT id FROM infra_types WHERE infra_type = ? AND id != ?",
        (infra_type, item_id),
    ).fetchone()
    if duplicate:
        return _error("Nama jenis infrastruktur sudah dipakai.", 409)

    old_infra_type = row["infra_type"]
    try:
        db.execute("UPDATE infra_types SET infra_type = ? WHERE id = ?", (infra_type, item_id))
        db.execute("UPDATE asset_types SET infra_type = ? WHERE infra_type = ?", (infra_type, old_infra_type))
        db.execute(
            """
            UPDATE infrastructure
            SET infra_type = ?, updated_at = CURRENT_TIMESTAMP
            WHERE infra_type = ?
            """,
            (infra_type, old_infra_type),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return _error("Perubahan gagal karena memicu duplikasi data aset pada tipe baru.", 409)

    return jsonify({"ok": True, "message": "Jenis infrastruktur berhasil diperbarui."})


@app.route("/api/backup/create", methods=["POST"])
@login_required
def create_backup():
    init_db()
    try:
        backup_path = create_backup_file()
    except FileNotFoundError as exc:
        return _error(str(exc), 404)

    stat = backup_path.stat()
    return jsonify(
        {
            "ok": True,
            "message": "Backup berhasil dibuat.",
            "data": {
                "filename": backup_path.name,
                "size": stat.st_size,
                "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
            },
        }
    )


@app.route("/api/backup/list", methods=["GET"])
@login_required
def list_backups():
    init_db()
    ensure_dirs()

    rows: list[dict[str, Any]] = []
    for path in sorted(BACKUP_DIR.glob("*.db"), key=lambda p: p.stat().st_mtime, reverse=True):
        stat = path.stat()
        rows.append(
            {
                "filename": path.name,
                "size": stat.st_size,
                "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
            }
        )

    return jsonify({"ok": True, "data": rows})


@app.route("/api/backup/download/<path:filename>", methods=["GET"])
@login_required
def download_backup(filename: str):
    init_db()
    try:
        backup_path = _safe_backup_path(filename)
    except ValueError as exc:
        return _error(str(exc), 422)

    if not backup_path.exists():
        return _error("File backup tidak ditemukan.", 404)

    return send_file(backup_path, as_attachment=True, download_name=backup_path.name)


@app.route("/api/backup/restore", methods=["POST"])
@login_required
def restore_backup():
    init_db()
    payload = request.get_json(silent=True) or {}
    filename = str(payload.get("filename", "")).strip()
    if not filename:
        return _error("Nama file backup wajib dipilih.", 422)

    try:
        backup_path = _safe_backup_path(filename)
    except ValueError as exc:
        return _error(str(exc), 422)

    if not backup_path.exists():
        return _error("File backup tidak ditemukan.", 404)

    restore_from_backup_file(backup_path)

    # Re-init schema untuk memastikan migrasi/seed terbaru tetap diterapkan.
    init_db()
    return jsonify({"ok": True, "message": "Restore backup berhasil."})


@app.route("/api/kmz/export", methods=["GET"])
@login_required
def export_kmz():
    init_db()
    db = get_db()

    points = db.execute(
        """
        SELECT id, name, infra_type, asset_name, latitude, longitude, status
        FROM infrastructure
        ORDER BY id ASC
        """
    ).fetchall()

    links = db.execute(
        """
        SELECT
            l.id,
            l.line_name,
            f.name AS from_name,
            f.latitude AS from_latitude,
            f.longitude AS from_longitude,
            t.name AS to_name,
            t.latitude AS to_latitude,
            t.longitude AS to_longitude
        FROM infra_links l
        JOIN infrastructure f ON f.id = l.from_infra_id
        JOIN infrastructure t ON t.id = l.to_infra_id
        ORDER BY l.id ASC
        """
    ).fetchall()

    kml_parts: list[str] = [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<kml xmlns=\"http://www.opengis.net/kml/2.2\">",
        "<Document>",
        "<name>KMZ Infra Export</name>",
    ]

    kml_parts.append("<Folder><name>Titik Infrastruktur</name>")
    for p in points:
        kml_parts.append("<Placemark>")
        kml_parts.append(f"<name>{_kml_escape(p['name'])}</name>")
        kml_parts.append(
            f"<description>{_kml_escape(p['infra_type'])} | {_kml_escape(p['asset_name'] or '-') } | {_kml_escape(p['status'] or '-')}</description>"
        )
        kml_parts.append("<Point>")
        kml_parts.append(f"<coordinates>{p['longitude']},{p['latitude']},0</coordinates>")
        kml_parts.append("</Point>")
        kml_parts.append("</Placemark>")
    kml_parts.append("</Folder>")

    kml_parts.append("<Folder><name>Jalur Infrastruktur</name>")
    for l in links:
        line_title = l["line_name"] or f"{l['from_name']} -> {l['to_name']}"
        kml_parts.append("<Placemark>")
        kml_parts.append(f"<name>{_kml_escape(line_title)}</name>")
        kml_parts.append("<LineString>")
        kml_parts.append("<tessellate>1</tessellate>")
        kml_parts.append(
            "<coordinates>"
            f"{l['from_longitude']},{l['from_latitude']},0 "
            f"{l['to_longitude']},{l['to_latitude']},0"
            "</coordinates>"
        )
        kml_parts.append("</LineString>")
        kml_parts.append("</Placemark>")
    kml_parts.append("</Folder>")

    kml_parts.append("</Document>")
    kml_parts.append("</kml>")
    kml_content = "".join(kml_parts)

    kmz_buffer = io.BytesIO()
    with zipfile.ZipFile(kmz_buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as zip_file:
        zip_file.writestr("doc.kml", kml_content)
    kmz_buffer.seek(0)

    filename = f"kmzinfra_route_{datetime.now().strftime('%Y%m%d_%H%M%S')}.kmz"
    return send_file(
        kmz_buffer,
        mimetype="application/vnd.google-earth.kmz",
        as_attachment=True,
        download_name=filename,
    )


@app.route("/api/company-settings", methods=["GET"])
@login_required
def get_company_settings():
    settings = get_site_settings()
    return jsonify({"ok": True, "data": settings})


@app.route("/api/users", methods=["GET"])
@login_required
def list_users():
    init_db()
    db = get_db()
    rows = db.execute(
        """
        SELECT id, username, must_change_password, created_at
        FROM users
        ORDER BY id ASC
        """
    ).fetchall()
    return jsonify({"ok": True, "data": [dict(r) for r in rows]})


@app.route("/api/users", methods=["POST"])
@login_required
def create_user():
    init_db()
    payload = request.get_json(silent=True) or {}
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))

    if not username:
        return _error("Username admin wajib diisi.", 422)
    if len(password) < 6:
        return _error("Password admin minimal 6 karakter.", 422)

    db = get_db()
    try:
        cursor = db.execute(
            """
            INSERT INTO users (username, password_hash, must_change_password)
            VALUES (?, ?, 0)
            """,
            (username, generate_password_hash(password)),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return _error("Username sudah dipakai akun lain.", 409)

    return jsonify({"ok": True, "id": cursor.lastrowid, "message": "Akun admin baru berhasil ditambahkan."}), 201


@app.route("/api/users/<int:user_id>", methods=["PUT"])
@login_required
def update_user_credentials(user_id: int):
    init_db()
    payload = request.get_json(silent=True) or {}

    username = str(payload.get("username", "")).strip()
    new_password = str(payload.get("new_password", ""))

    if not username:
        return _error("Username wajib diisi.", 422)

    if new_password and len(new_password) < 6:
        return _error("Password baru minimal 6 karakter.", 422)

    db = get_db()
    user = db.execute("SELECT id, username FROM users WHERE id = ?", (user_id,)).fetchone()
    if not user:
        return _error("Akun tidak ditemukan.", 404)

    must_change_row = db.execute(
        "SELECT must_change_password FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    must_change_password = bool(must_change_row["must_change_password"]) if must_change_row else False

    if must_change_password and not new_password:
        return _error("Anda wajib mengisi password baru untuk akun yang masih default.", 422)

    duplicate = db.execute(
        "SELECT id FROM users WHERE username = ? AND id != ?",
        (username, user_id),
    ).fetchone()
    if duplicate:
        return _error("Username sudah dipakai akun lain.", 409)

    if new_password:
        db.execute(
            """
            UPDATE users
            SET username = ?, password_hash = ?, must_change_password = 0
            WHERE id = ?
            """,
            (username, generate_password_hash(new_password), user_id),
        )
    else:
        db.execute(
            """
            UPDATE users
            SET username = ?
            WHERE id = ?
            """,
            (username, user_id),
        )

    db.commit()

    if session.get("user_id") == user_id:
        session["username"] = username
        if new_password:
            session["force_password_change"] = False

    return jsonify({"ok": True, "message": "Akun berhasil diperbarui."})


@app.route("/api/system/update-status", methods=["GET"])
@login_required
def system_update_status():
    return jsonify({"ok": True, "data": get_update_status()})


@app.route("/api/system/apply-update", methods=["POST"])
@login_required
def system_apply_update():
    result = apply_git_update()
    if not result.get("ok"):
        return _error(str(result.get("message", "Update gagal.")), 422)
    return jsonify({"ok": True, "data": result})


@app.route("/api/field-staff", methods=["GET"])
@login_required
def list_field_staff():
    init_db()
    db = get_db()
    rows = db.execute(
        """
        SELECT id, staff_id, full_name, role, phone, notes, is_active, password_hash, created_at
        FROM field_staff
        ORDER BY id DESC
        """
    ).fetchall()

    data = []
    for row in rows:
        item = dict(row)
        item["has_password"] = bool(item.get("password_hash"))
        item.pop("password_hash", None)
        data.append(item)

    return jsonify({"ok": True, "data": data})


@app.route("/api/field-staff", methods=["POST"])
@login_required
def create_field_staff():
    init_db()
    payload = request.get_json(silent=True) or {}

    staff_id = str(payload.get("staff_id", "")).strip().upper()
    full_name = str(payload.get("full_name", "")).strip()
    role = str(payload.get("role", "")).strip().upper()
    password = str(payload.get("password", ""))
    phone = str(payload.get("phone", "")).strip()
    notes = str(payload.get("notes", "")).strip()
    is_active = 1 if bool(payload.get("is_active", True)) else 0

    if not staff_id:
        return _error("ID teknisi/operator wajib diisi.", 422)
    if not full_name:
        return _error("Nama teknisi/operator wajib diisi.", 422)
    if role not in {"TEKNISI", "OPERATOR"}:
        return _error("Role hanya boleh TEKNISI atau OPERATOR.", 422)
    if len(password) < 6:
        return _error("Password login teknisi/operator minimal 6 karakter.", 422)

    db = get_db()
    try:
        cursor = db.execute(
            """
            INSERT INTO field_staff (staff_id, full_name, role, password_hash, phone, notes, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (staff_id, full_name, role, generate_password_hash(password), phone, notes, is_active),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return _error("ID teknisi/operator sudah terdaftar.", 409)

    return jsonify({"ok": True, "id": cursor.lastrowid}), 201


@app.route("/api/field-staff/<int:item_id>", methods=["DELETE"])
@login_required
def delete_field_staff(item_id: int):
    init_db()
    db = get_db()
    cursor = db.execute("DELETE FROM field_staff WHERE id = ?", (item_id,))
    db.commit()

    if cursor.rowcount == 0:
        return _error("Data teknisi/operator tidak ditemukan.", 404)

    return jsonify({"ok": True, "message": "Data teknisi/operator berhasil dihapus."})


@app.route("/api/field-staff/<int:item_id>/password", methods=["PUT"])
@login_required
def update_field_staff_password(item_id: int):
    init_db()
    payload = request.get_json(silent=True) or {}
    password = str(payload.get("password", ""))

    if len(password) < 6:
        return _error("Password baru minimal 6 karakter.", 422)

    db = get_db()
    row = db.execute("SELECT id FROM field_staff WHERE id = ?", (item_id,)).fetchone()
    if not row:
        return _error("Data teknisi/operator tidak ditemukan.", 404)

    db.execute(
        "UPDATE field_staff SET password_hash = ? WHERE id = ?",
        (generate_password_hash(password), item_id),
    )
    db.commit()
    return jsonify({"ok": True, "message": "Password login teknisi/operator berhasil diperbarui."})


@app.route("/api/company-settings", methods=["PUT"])
@login_required
def update_company_settings():
    init_db()
    payload = request.get_json(silent=True) or {}

    data = {
        "company_name": str(payload.get("company_name", "")).strip(),
        "company_address": str(payload.get("company_address", "")).strip(),
        "company_phone": str(payload.get("company_phone", "")).strip(),
        "company_email": str(payload.get("company_email", "")).strip(),
        "landing_title": str(payload.get("landing_title", "")).strip(),
        "landing_tagline": str(payload.get("landing_tagline", "")).strip(),
        "landing_description": str(payload.get("landing_description", "")).strip(),
        "landing_button_text": str(payload.get("landing_button_text", "")).strip(),
        "landing_button_url": str(payload.get("landing_button_url", "")).strip() or "/login",
    }

    required_fields = [
        "company_name",
        "company_address",
        "company_phone",
        "company_email",
        "landing_title",
        "landing_tagline",
        "landing_description",
        "landing_button_text",
    ]
    for field_name in required_fields:
        if not data[field_name]:
            return _error(f"Field '{field_name}' wajib diisi.", 422)

    db = get_db()
    db.execute(
        """
        UPDATE site_settings
        SET
            company_name = ?,
            company_address = ?,
            company_phone = ?,
            company_email = ?,
            landing_title = ?,
            landing_tagline = ?,
            landing_description = ?,
            landing_button_text = ?,
            landing_button_url = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
        """,
        (
            data["company_name"],
            data["company_address"],
            data["company_phone"],
            data["company_email"],
            data["landing_title"],
            data["landing_tagline"],
            data["landing_description"],
            data["landing_button_text"],
            data["landing_button_url"],
        ),
    )
    db.commit()

    return jsonify({"ok": True, "message": "Pengaturan perusahaan dan landing page berhasil disimpan."})


if __name__ == "__main__":
    with app.app_context():
        init_db()
    host = os.getenv("KMZINFRA_HOST", "0.0.0.0")
    port = int(os.getenv("KMZINFRA_PORT", "5000"))
    debug = os.getenv("KMZINFRA_DEBUG", "1") == "1"
    app.run(host=host, port=port, debug=debug)
