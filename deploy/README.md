# 部署运维手册

本目录是部署期的可复制模板和操作说明。每次上线/巡检按本文件走。

## 1. 系统要求

- Ubuntu 22.04 / Debian 12 / CentOS Stream(任一即可)
- Node.js ≥ 20
- PostgreSQL 16
- Redis 7
- Caddy 2 **或** Nginx 1.24+(任选其一做反向代理)
- PM2 5.x(进程守护)
- 域名 2 个:前端域名 + API 域名(也可同域不同路径)
- 至少 2 vCPU / 4 GB RAM / 40 GB 磁盘(数据增长后扩容)

## 2. 首次部署流程

1. **拉代码 + 安装依赖**
   ```bash
   git clone <repo> /opt/chinichi
   cd /opt/chinichi/backend && npm ci && npm run build
   cd ../frontend && npm ci && npm run build
   ```

2. **准备环境变量**
   ```bash
   cp /opt/chinichi/backend/.env.production.example /opt/chinichi/backend/.env.production
   # 关键字段务必填:
   #   JWT_SECRET    openssl rand -base64 48
   #   DATABASE_URL  postgresql://...
   #   REDIS_URL     redis://...
   #   CORS_ORIGIN   https://chinichi.jp
   #   STORAGE_DRIVER  oss
   #   OSS_*         阿里云控制台
   #   INITIAL_ADMIN_PASSWORD  ≥12 字符强密码
   ```

3. **数据库迁移 + seed**
   ```bash
   cd /opt/chinichi/backend
   # 加载生产环境变量
   set -a; source .env.production; set +a
   npx prisma migrate deploy        # 不要用 prisma migrate dev
   npx prisma db seed               # 只在首次执行!后续切忌再跑,会重置管理员密码
   ```

4. **配置反向代理**
   ```bash
   # Caddy 派(零配置 HTTPS,推荐)
   cp /opt/chinichi/deploy/Caddyfile.example /etc/caddy/Caddyfile
   # 编辑域名后:
   systemctl reload caddy

   # 或 Nginx + certbot 派
   cp /opt/chinichi/deploy/nginx.conf.example /etc/nginx/sites-available/chinichi
   ln -s /etc/nginx/sites-available/chinichi /etc/nginx/sites-enabled/
   certbot --nginx -d chinichi.jp -d api.chinichi.jp
   nginx -t && systemctl reload nginx
   # 前端 dist 拷到 /var/www/chinichi-frontend
   cp -r /opt/chinichi/frontend/dist/* /var/www/chinichi-frontend/
   ```

5. **PM2 拉起 API**
   ```bash
   cd /opt/chinichi/backend
   pm2 start ecosystem.config.js --only graduate-tracker-api
   pm2 save
   pm2 startup    # 输出一条 systemd 安装命令,按提示粘贴执行
   ```

6. **跑一遍健康检查**
   ```bash
   curl https://api.chinichi.jp/health
   # 期望 {"status":"ok","services":{"database":"ok"},...}
   ```

## 3. 升级流程(零停机)

```bash
cd /opt/chinichi
git fetch && git checkout <new-tag>

# 后端
cd backend
npm ci --omit=dev
npm run build
set -a; source .env.production; set +a
npx prisma migrate deploy   # 有新迁移才会执行
pm2 reload graduate-tracker-api   # cluster 模式滚动重启,不中断在途请求

# 前端
cd ../frontend
npm ci
npm run build
rsync -a --delete dist/ /var/www/chinichi-frontend/
```

回滚:`git checkout <prev-tag> && 重复上面构建/reload`。Prisma 迁移**不**自动回滚,数据库 schema 需要手动 down migration 或从备份恢复。

## 4. 定时任务(cron)

```cron
# 数据库每日备份(凌晨 3:15,保留 14 天)
15 3 * * * /opt/chinichi/scripts/backup-db.sh >> /var/log/chinichi/backup.log 2>&1

# 健康探测 + 钉钉告警(每分钟,5 分钟内不重复告警)
* * * * * HEALTH_URL=https://api.chinichi.jp/health \
          DINGTALK_WEBHOOK_URL='https://oapi.dingtalk.com/robot/send?access_token=xxx' \
          DINGTALK_SECRET='xxx' \
          /opt/chinichi/scripts/health-watcher.sh >> /var/log/chinichi/health.log 2>&1
```

## 5. 日志

- **应用日志**:Pino JSON 格式 → 容器 stdout / PM2 `logs/`。
  - 接 Loki:Promtail 配 `/opt/chinichi/backend/logs/*.log`,标签 `app=chinichi-api`。
  - 接腾讯云 CLS:Loglistener 监听同样路径。
  - 自查:`pm2 logs graduate-tracker-api --lines 200`。
- **Web 访问日志**:Caddy/Nginx 各自管理,建议保留 30 天后归档。
- **数据库慢查询**:`shared_preload_libraries='pg_stat_statements'`,周期复盘。

## 6. 故障排查速查

| 现象 | 第一步 | 第二步 |
|---|---|---|
| 502 Bad Gateway | `pm2 status` 看 API 进程 | `pm2 logs graduate-tracker-api --err` |
| 登录后立即 401 | 浏览器是否带 `chinichi_at` cookie | 后端是否 `Secure` 与 https 一致 |
| 上传成功但下载 404 | `STORAGE_DRIVER` 是否切换过 | OSS 控制台对象是否存在 |
| 定时任务不触发 | `pm2 logs` 找 BullMQ Worker 启动行 | `redis-cli` 看 `bull:*` keys |
| 健康检查 503 | `pg_isready -d $DATABASE_URL` | 应用日志最近一条 ERROR |

## 7. 安全清单(每月对账一次)

- [ ] `JWT_SECRET` 未泄露(grep 仓库历史 + 部署机文件权限 600)
- [ ] 初始管理员密码已通过应用内修改,不是 `INITIAL_ADMIN_PASSWORD` 原值
- [ ] OSS AK/SK 是 RAM 子账号,仅授权目标 bucket
- [ ] 数据库账号最小权限,不是 postgres 超管
- [ ] `npm audit` / `npm outdated` 无 high/critical
- [ ] 备份能复原:抽一份近期备份在 staging 跑 `restore-db.sh`
