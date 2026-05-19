#!/usr/bin/env bash
# 知日塾大学院考学进度管理系统 - 从备份恢复数据库
# 用法:
#   ./scripts/restore-db.sh /var/backups/chinichi/chinichi_20260519T031500Z.sql.gz
#
# 警告: 备份脚本带 --clean --if-exists,执行后会先 DROP 现有表再重建。
#       务必确认目标 DATABASE_URL 不是生产环境,或先做一份"恢复前"备份。

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "用法: $0 <backup-file.sql.gz>" >&2
  exit 1
fi

BACKUP_FILE="$1"
DATABASE_URL="${DATABASE_URL:-}"

if [[ -z "${DATABASE_URL}" ]]; then
  echo "[restore-db] ERROR: DATABASE_URL 未设置" >&2
  exit 1
fi
if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "[restore-db] ERROR: 备份文件不存在: ${BACKUP_FILE}" >&2
  exit 1
fi

echo "[restore-db] 即将恢复到 $(echo "${DATABASE_URL}" | sed -E 's#://[^:]+:[^@]+@#://***:***@#')"
read -r -p "确定继续吗? (yes/no) " ANS
if [[ "${ANS}" != "yes" ]]; then
  echo "已取消"
  exit 1
fi

echo "[restore-db] $(date -Iseconds) 开始恢复 ← ${BACKUP_FILE}"
gunzip -c "${BACKUP_FILE}" | psql --dbname="${DATABASE_URL}" --single-transaction
echo "[restore-db] $(date -Iseconds) 完成"
