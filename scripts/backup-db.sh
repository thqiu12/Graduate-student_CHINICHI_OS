#!/usr/bin/env bash
# 知日塾大学院考学进度管理系统 - PostgreSQL 每日备份
# 用法:
#   ./scripts/backup-db.sh                       # 用环境变量 DATABASE_URL
#   BACKUP_DIR=/var/backups ./scripts/backup-db.sh
#
# cron 示例(每天凌晨 3:15,保留 14 天):
#   15 3 * * * /opt/chinichi/scripts/backup-db.sh >> /var/log/chinichi/backup.log 2>&1

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/chinichi}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
DATABASE_URL="${DATABASE_URL:-}"

if [[ -z "${DATABASE_URL}" ]]; then
  echo "[backup-db] ERROR: DATABASE_URL 未设置" >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="${BACKUP_DIR}/chinichi_${TIMESTAMP}.sql.gz"

echo "[backup-db] $(date -Iseconds) 开始备份 → ${OUT_FILE}"

# --format=plain + gzip 比 -Fc 体积略大,但兼容性最好,运维任何时候都能 zcat 看
pg_dump \
  --dbname="${DATABASE_URL}" \
  --format=plain \
  --no-owner \
  --no-privileges \
  --clean --if-exists \
  | gzip -9 > "${OUT_FILE}"

SIZE="$(du -h "${OUT_FILE}" | cut -f1)"
echo "[backup-db] $(date -Iseconds) 备份完成,大小 ${SIZE}"

# ─── 清理过期备份 ────────────────────────────────────────
echo "[backup-db] 清理 ${RETENTION_DAYS} 天前的备份..."
find "${BACKUP_DIR}" -type f -name 'chinichi_*.sql.gz' -mtime "+${RETENTION_DAYS}" -print -delete || true

# ─── (可选) 同步到对象存储 ─────────────────────────────
# 本地盘单点故障风险大,生产建议至少同步一份到 OSS/S3。
# 取消注释并填好 OSS 配置后启用:
# if [[ -n "${OSS_BACKUP_BUCKET:-}" ]] && command -v ossutil >/dev/null; then
#   ossutil cp "${OUT_FILE}" "oss://${OSS_BACKUP_BUCKET}/db/$(basename "${OUT_FILE}")"
# fi

echo "[backup-db] $(date -Iseconds) 全部完成"
