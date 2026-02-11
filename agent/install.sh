#!/bin/bash
# ============================================================
# GovMon VPS Monitoring Agent - Installation Script
# Usage: curl -sSL http://<SERVER>/agent/install.sh | bash -s -- <SERVER_URL> <API_KEY>
# ============================================================

SERVER_URL="${1:?Usage: install.sh <SERVER_URL> <API_KEY>}"
API_KEY="${2:?Usage: install.sh <SERVER_URL> <API_KEY>}"
INTERVAL="${3:-30}"

INSTALL_DIR="/opt/govmon-agent"
SERVICE_NAME="govmon-agent"

echo "╔══════════════════════════════════════════╗"
echo "║  🏛️  GovMon Agent Installer               ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Server:   $SERVER_URL"
echo "Interval: ${INTERVAL}s"
echo ""

# Create install directory
mkdir -p "$INSTALL_DIR"

# Download monitor script
cat > "$INSTALL_DIR/monitor.sh" << 'MONITOR_SCRIPT'
#!/bin/bash
SERVER_URL="__SERVER_URL__"
API_KEY="__API_KEY__"
INTERVAL="__INTERVAL__"

get_cpu() {
  local cpu_line=$(head -1 /proc/stat)
  local cpu1=(${cpu_line//cpu /})
  sleep 1
  cpu_line=$(head -1 /proc/stat)
  local cpu2=(${cpu_line//cpu /})

  local idle1=${cpu1[3]}
  local total1=0
  for v in "${cpu1[@]}"; do total1=$((total1 + v)); done

  local idle2=${cpu2[3]}
  local total2=0
  for v in "${cpu2[@]}"; do total2=$((total2 + v)); done

  local diff_idle=$((idle2 - idle1))
  local diff_total=$((total2 - total1))
  if [ $diff_total -eq 0 ]; then echo "0"; return; fi
  echo "scale=1; (1 - $diff_idle / $diff_total) * 100" | bc
}

get_memory() {
  local mem_total=$(grep MemTotal /proc/meminfo | awk '{print $2}')
  local mem_available=$(grep MemAvailable /proc/meminfo | awk '{print $2}')
  local mem_used=$((mem_total - mem_available))
  local mem_percent=$(echo "scale=1; $mem_used * 100 / $mem_total" | bc)
  echo "$mem_total $mem_used $mem_percent"
}

get_disk() {
  df / | tail -1 | awk '{print $2, $3, $5}' | tr -d '%'
}

get_network() {
  local iface=$(ip route | grep default | awk '{print $5}' | head -1)
  if [ -z "$iface" ]; then iface="eth0"; fi
  local rx1=$(cat /sys/class/net/$iface/statistics/rx_bytes 2>/dev/null || echo 0)
  local tx1=$(cat /sys/class/net/$iface/statistics/tx_bytes 2>/dev/null || echo 0)
  sleep 1
  local rx2=$(cat /sys/class/net/$iface/statistics/rx_bytes 2>/dev/null || echo 0)
  local tx2=$(cat /sys/class/net/$iface/statistics/tx_bytes 2>/dev/null || echo 0)
  local rx_rate=$(( (rx2 - rx1) / 1024 ))
  local tx_rate=$(( (tx2 - tx1) / 1024 ))
  echo "$rx2 $tx2 $rx_rate $tx_rate"
}

get_processes() {
  ps aux --sort=-%cpu | head -11 | tail -10 | awk '{
    printf "{\"pid\":%s,\"name\":\"%s\",\"cpu\":%s,\"mem\":%s,\"user\":\"%s\",\"command\":\"%s\"},",
    $2, $11, $3, $4, $1, $11
  }'
}

get_hw_info() {
  local cores=$(nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo 2>/dev/null || echo 0)
  local ram_kb=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}')
  local ram_mb=$((ram_kb / 1024))
  local disk_gb=$(df / 2>/dev/null | tail -1 | awk '{print int($2/1048576)}')
  echo "$cores $ram_mb $disk_gb"
}

while true; do
  CPU=$(get_cpu)
  read MEM_TOTAL MEM_USED MEM_PERCENT <<< $(get_memory)
  read DISK_TOTAL DISK_USED DISK_PERCENT <<< $(get_disk)
  read NET_IN NET_OUT NET_IN_RATE NET_OUT_RATE <<< $(get_network)
  UPTIME=$(cat /proc/uptime | awk '{print int($1)}')
  read LOAD1 LOAD5 LOAD15 <<< $(cat /proc/loadavg | awk '{print $1, $2, $3}')
  PROCS=$(get_processes)
  PROCS="[${PROCS%,}]"
  read HW_CORES HW_RAM_MB HW_DISK_GB <<< $(get_hw_info)

  JSON=$(cat <<EOF
{
  "cpu_percent": ${CPU:-0},
  "mem_percent": ${MEM_PERCENT:-0},
  "mem_total": ${MEM_TOTAL:-0},
  "mem_used": ${MEM_USED:-0},
  "disk_percent": ${DISK_PERCENT:-0},
  "disk_total": ${DISK_TOTAL:-0},
  "disk_used": ${DISK_USED:-0},
  "net_in": ${NET_IN:-0},
  "net_out": ${NET_OUT:-0},
  "net_in_rate": ${NET_IN_RATE:-0},
  "net_out_rate": ${NET_OUT_RATE:-0},
  "uptime": ${UPTIME:-0},
  "load_1": ${LOAD1:-0},
  "load_5": ${LOAD5:-0},
  "load_15": ${LOAD15:-0},
  "cpu_cores": ${HW_CORES:-0},
  "ram_total_mb": ${HW_RAM_MB:-0},
  "disk_total_gb": ${HW_DISK_GB:-0},
  "processes": ${PROCS}
}
EOF
)

  curl -s -X POST "${SERVER_URL}/api/report" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: ${API_KEY}" \
    -d "$JSON" > /dev/null 2>&1

  sleep "$INTERVAL"
done
MONITOR_SCRIPT

# Replace placeholders
sed -i "s|__SERVER_URL__|${SERVER_URL}|g" "$INSTALL_DIR/monitor.sh"
sed -i "s|__API_KEY__|${API_KEY}|g" "$INSTALL_DIR/monitor.sh"
sed -i "s|__INTERVAL__|${INTERVAL}|g" "$INSTALL_DIR/monitor.sh"
chmod +x "$INSTALL_DIR/monitor.sh"

# Create systemd service
cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=GovMon VPS Monitoring Agent
After=network.target

[Service]
Type=simple
ExecStart=/bin/bash ${INSTALL_DIR}/monitor.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl start "$SERVICE_NAME"

echo ""
echo "✅ GovMon Agent installed successfully!"
echo "📁 Location: $INSTALL_DIR"
echo "🔧 Service:  $SERVICE_NAME"
echo ""
echo "Commands:"
echo "  systemctl status $SERVICE_NAME"
echo "  systemctl restart $SERVICE_NAME"
echo "  journalctl -u $SERVICE_NAME -f"
