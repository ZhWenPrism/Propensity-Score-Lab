#!/usr/bin/env bash
# Install or update the 获益-风险评估沙盘 service on a Linux server (Ubuntu / Debian / CentOS / OpenCloudOS).
# Run on the server from the unpacked folder that contains demo/ and server/:
#   sudo bash server/deploy.sh [port]        (default port 8080)
# Behind a reverse proxy, bind to localhost and leave the firewall alone:
#   sudo BRA_HOST=127.0.0.1 bash server/deploy.sh 8790
set -euo pipefail

PORT="${1:-8080}"
HOST="${BRA_HOST:-0.0.0.0}"
APP_DIR=/opt/bra-sandbox
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if ! command -v python3 >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then apt-get update && apt-get install -y python3; else yum install -y python3; fi
fi

mkdir -p "$APP_DIR/data"
rm -rf "$APP_DIR/demo" "$APP_DIR/server"
cp -r "$SRC_DIR/demo" "$SRC_DIR/server" "$APP_DIR/"
rm -rf "$APP_DIR/server/data"

id -u bra >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin bra
KEY_FILE="$APP_DIR/data/teacher_key"
if [ ! -s "$KEY_FILE" ]; then
  python3 -c "import secrets; print(secrets.token_urlsafe(12))" > "$KEY_FILE"
fi
chown -R bra:bra "$APP_DIR/data"
chmod 700 "$APP_DIR/data"
chmod 600 "$KEY_FILE"

cat > /etc/systemd/system/bra-sandbox.service <<UNIT
[Unit]
Description=获益-风险评估沙盘
After=network.target

[Service]
User=bra
Environment=BRA_PORT=$PORT
Environment=BRA_HOST=$HOST
Environment=BRA_SITE_DIR=$APP_DIR/demo
Environment=BRA_DATA_DIR=$APP_DIR/data
Environment=BRA_KEY_FILE=$KEY_FILE
AmbientCapabilities=CAP_NET_BIND_SERVICE
ExecStart=/usr/bin/env python3 $APP_DIR/server/app.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable bra-sandbox >/dev/null 2>&1
systemctl restart bra-sandbox

if [ "$HOST" != "127.0.0.1" ] && command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port="$PORT/tcp" >/dev/null && firewall-cmd --reload >/dev/null
fi
if [ "$HOST" != "127.0.0.1" ] && command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow "$PORT/tcp" >/dev/null
fi

sleep 1
if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
  echo "服务已启动（端口 $PORT）。"
else
  echo "服务没有响应，查看日志：journalctl -u bra-sandbox -n 50"
  exit 1
fi
if [ "$HOST" = "127.0.0.1" ]; then
  echo "只在本机监听 127.0.0.1:$PORT，需要反向代理（如 nginx）转发。导出口令：$(cat "$KEY_FILE")"
else
  echo "学生打开：http://<服务器公网 IP>:$PORT/"
  echo "导出作业：http://<服务器公网 IP>:$PORT/api/submissions.csv?key=$(cat "$KEY_FILE")"
  echo "腾讯云控制台的安全组 / 防火墙需要放行 TCP $PORT。"
fi
