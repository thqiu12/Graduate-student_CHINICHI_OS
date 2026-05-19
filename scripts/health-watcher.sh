#!/usr/bin/env bash
# 知日塾大学院考学进度管理系统 - /health 探测 + 钉钉告警
# 用法:
#   HEALTH_URL=https://api.chinichi.jp/health \
#   DINGTALK_WEBHOOK_URL='https://oapi.dingtalk.com/robot/send?access_token=xxx' \
#   ./scripts/health-watcher.sh
#
# cron 示例(每分钟探一次,失败立刻告警一次,5 分钟内不重复告警):
#   * * * * * /opt/chinichi/scripts/health-watcher.sh >> /var/log/chinichi/health.log 2>&1

set -euo pipefail

HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/health}"
DINGTALK_WEBHOOK_URL="${DINGTALK_WEBHOOK_URL:-}"
DINGTALK_SECRET="${DINGTALK_SECRET:-}"
ALERT_THROTTLE_FILE="${ALERT_THROTTLE_FILE:-/tmp/chinichi-health-alert.lock}"
ALERT_THROTTLE_SECS="${ALERT_THROTTLE_SECS:-300}"

send_dingtalk() {
  local msg="$1"
  if [[ -z "${DINGTALK_WEBHOOK_URL}" ]]; then
    echo "[health-watcher] 未配置 DINGTALK_WEBHOOK_URL,跳过告警" >&2
    return
  fi

  local url="${DINGTALK_WEBHOOK_URL}"
  # 如果填了 SECRET,做加签:
  if [[ -n "${DINGTALK_SECRET}" ]]; then
    local ts="$(($(date +%s%N) / 1000000))"
    local sign_str="${ts}\n${DINGTALK_SECRET}"
    local sign="$(printf '%b' "${sign_str}" \
      | openssl dgst -sha256 -hmac "${DINGTALK_SECRET}" -binary \
      | base64)"
    sign="$(printf '%s' "${sign}" | python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.stdin.read().strip(),safe=""))')"
    url="${url}&timestamp=${ts}&sign=${sign}"
  fi

  curl -fsS -X POST "${url}" \
    -H 'Content-Type: application/json' \
    --max-time 5 \
    -d "{\"msgtype\":\"text\",\"text\":{\"content\":\"[CHINICHI] ${msg}\"}}" >/dev/null \
    && echo "[health-watcher] 告警已发送" \
    || echo "[health-watcher] WARN: 告警发送失败" >&2
}

should_throttle() {
  if [[ -f "${ALERT_THROTTLE_FILE}" ]]; then
    local now last age
    now="$(date +%s)"
    last="$(stat -c %Y "${ALERT_THROTTLE_FILE}")"
    age="$((now - last))"
    if [[ "${age}" -lt "${ALERT_THROTTLE_SECS}" ]]; then
      return 0
    fi
  fi
  return 1
}

# ─── 探测 ────────────────────────────────────────────────
STATUS="$(curl -fsS -o /tmp/chinichi-health.json -w '%{http_code}' \
  --max-time 5 "${HEALTH_URL}" || echo '000')"

if [[ "${STATUS}" == "200" ]]; then
  # 恢复了:清掉节流锁,这样下次故障能立刻告警
  rm -f "${ALERT_THROTTLE_FILE}"
  exit 0
fi

BODY="$(cat /tmp/chinichi-health.json 2>/dev/null | head -c 200 || true)"
MSG="健康检查失败: ${HEALTH_URL} HTTP=${STATUS} body=${BODY}"
echo "[health-watcher] $(date -Iseconds) ${MSG}" >&2

if should_throttle; then
  echo "[health-watcher] 在节流窗口内(${ALERT_THROTTLE_SECS}s),不重发"
  exit 1
fi

send_dingtalk "${MSG}"
touch "${ALERT_THROTTLE_FILE}"
exit 1
