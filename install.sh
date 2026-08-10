#!/usr/bin/env bash
set -euo pipefail

APP_NAME="kmzinfra"
APP_DIR="/opt/kmzinfra"
APP_USER="www-data"
APP_GROUP="www-data"
APP_PORT="5000"
WITH_NGINX="1"
DOMAIN="_"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() {
    echo "[INFO] $*"
}

err() {
    echo "[ERROR] $*" >&2
}

usage() {
    cat <<'EOF'
Usage: ./install.sh [options]

Options:
  --app-dir <path>       Install directory (default: /opt/kmzinfra)
  --app-user <user>      Linux user for service (default: www-data)
  --app-group <group>    Linux group for service (default: www-data)
  --port <port>          Internal app port for gunicorn (default: 5000)
  --domain <domain>      Nginx server_name (default: _)
  --no-nginx             Skip nginx configuration
  --help                 Show this help
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --app-dir)
            APP_DIR="$2"
            shift 2
            ;;
        --app-user)
            APP_USER="$2"
            shift 2
            ;;
        --app-group)
            APP_GROUP="$2"
            shift 2
            ;;
        --port)
            APP_PORT="$2"
            shift 2
            ;;
        --domain)
            DOMAIN="$2"
            shift 2
            ;;
        --no-nginx)
            WITH_NGINX="0"
            shift
            ;;
        --help)
            usage
            exit 0
            ;;
        *)
            err "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

if [[ "$(id -u)" -ne 0 ]]; then
    if command -v sudo >/dev/null 2>&1; then
        log "Re-running installer with sudo..."
        exec sudo bash "$0" \
            --app-dir "$APP_DIR" \
            --app-user "$APP_USER" \
            --app-group "$APP_GROUP" \
            --port "$APP_PORT" \
            --domain "$DOMAIN" \
            $([[ "$WITH_NGINX" == "0" ]] && echo "--no-nginx")
    else
        err "Please run as root or install sudo."
        exit 1
    fi
fi

if [[ ! -f "$SCRIPT_DIR/app.py" || ! -f "$SCRIPT_DIR/requirements.txt" ]]; then
    err "Run this script from the project folder containing app.py and requirements.txt."
    exit 1
fi

run_as_user() {
    local target_user="$1"
    shift

    if command -v sudo >/dev/null 2>&1; then
        sudo -u "$target_user" "$@"
    else
        runuser -u "$target_user" -- "$@"
    fi
}

log "Installing system dependencies..."
apt-get update
apt-get install -y \
    python3 \
    python3-venv \
    python3-pip \
    rsync \
    ca-certificates \
    curl \
    nginx

if ! getent group "$APP_GROUP" >/dev/null 2>&1; then
    log "Creating group $APP_GROUP..."
    groupadd --system "$APP_GROUP"
fi

if ! id "$APP_USER" >/dev/null 2>&1; then
    log "Creating user $APP_USER..."
    useradd --system --create-home --gid "$APP_GROUP" --shell /usr/sbin/nologin "$APP_USER"
fi

log "Preparing application directory at $APP_DIR..."
mkdir -p "$APP_DIR"
mkdir -p "$APP_DIR/data" "$APP_DIR/backups"

log "Syncing project files..."
rsync -a "$SCRIPT_DIR/" "$APP_DIR/" \
    --exclude '.git/' \
    --exclude '.venv/' \
    --exclude '__pycache__/' \
    --exclude 'data/*.db' \
    --exclude 'backups/*.db' \
    --exclude '*.pyc'

chown -R "$APP_USER:$APP_GROUP" "$APP_DIR"

log "Creating Python virtual environment..."
run_as_user "$APP_USER" python3 -m venv "$APP_DIR/.venv"

log "Installing Python packages..."
run_as_user "$APP_USER" "$APP_DIR/.venv/bin/python" -m pip install --upgrade pip
run_as_user "$APP_USER" "$APP_DIR/.venv/bin/python" -m pip install -r "$APP_DIR/requirements.txt"

ENV_FILE="/etc/default/$APP_NAME"
if [[ ! -f "$ENV_FILE" ]]; then
    SECRET_KEY="$(openssl rand -hex 32)"
    log "Creating environment file $ENV_FILE..."
    cat > "$ENV_FILE" <<EOF
KMZINFRA_HOST=127.0.0.1
KMZINFRA_PORT=$APP_PORT
KMZINFRA_DEBUG=0
KMZINFRA_SECRET_KEY=$SECRET_KEY
# Optional:
# KMZINFRA_ADMIN_USER=admin
# KMZINFRA_ADMIN_PASS=admin123
EOF
    chmod 600 "$ENV_FILE"
fi

SERVICE_FILE="/etc/systemd/system/$APP_NAME.service"
log "Writing systemd service: $SERVICE_FILE"
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=KMZ Infra Mapper (Flask + Gunicorn)
After=network.target

[Service]
User=$APP_USER
Group=$APP_GROUP
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$APP_DIR/.venv/bin/gunicorn -w 2 -b 127.0.0.1:$APP_PORT app:app
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$APP_NAME"
systemctl restart "$APP_NAME"

if [[ "$WITH_NGINX" == "1" ]]; then
    NGINX_SITE="/etc/nginx/sites-available/$APP_NAME"
    log "Writing nginx site config: $NGINX_SITE"
    cat > "$NGINX_SITE" <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

    ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/$APP_NAME"
    rm -f /etc/nginx/sites-enabled/default
    nginx -t
    systemctl enable nginx
    systemctl restart nginx
else
    log "Skipping nginx configuration (--no-nginx)."
fi

log "Installation complete."
log "Service status: systemctl status $APP_NAME"
if [[ "$WITH_NGINX" == "1" ]]; then
    log "Open in browser: http://<server-ip>/"
else
    log "Open in browser: http://<server-ip>:$APP_PORT/"
fi
