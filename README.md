# 知日塾大学院考学进度管理系统（CHINICHI OS）

> 版本：v0.1.0 - 项目骨架  
> 技术栈：Node.js + Fastify + TypeScript + Prisma（后端）/ React 18 + Ant Design 5（前端）

---

## 项目简介

本系统用于管理知日塾大学院考学学生的全周期进度，解决「无人管」状态：

- **学生端**：永远清楚今天该干什么（阶段规划 + 每日待办）
- **教师端**：永远清楚哪个学生需要介入（风险标签 + 进度健康度）

### 角色体系

| 角色 | 权限范围 |
|------|----------|
| 教务总负责人 | 全校区全学科 |
| 学科负责人 | 本学科所有学生 |
| 大学院班主任 | 自己负责的学生 |
| 学生 | 仅自己 |

---

## 快速启动

### 前置条件

- Node.js >= 20.0.0
- Docker & Docker Compose
- Git

### 1. 克隆项目

```bash
git clone <repository-url>
cd Graduate-student_CHINICHI_OS
```

### 2. 启动基础服务（PostgreSQL + Redis）

```bash
docker compose up -d
```

验证服务启动：

```bash
docker compose ps
# 应显示 chinichi_postgres 和 chinichi_redis 均为 healthy 状态
```

### 3. 配置后端环境变量

```bash
cd backend
cp .env.example .env
# 编辑 .env 文件，填写必要配置
# 开发环境默认配置已可用，无需修改数据库和 Redis 配置
```

### 4. 安装依赖并初始化数据库

```bash
# 后端
cd backend
npm install

# 生成 Prisma Client
npm run prisma:generate

# 执行数据库迁移
npm run prisma:migrate

# 插入种子数据（2学科、8校区、5角色、3测试用户）
npm run prisma:seed
```

### 5. 启动后端服务

```bash
# 在 backend/ 目录下
npm run dev

# 服务启动后访问：
# API 服务：http://localhost:3000
# 健康检查：http://localhost:3000/health
```

### 6. 启动前端服务

```bash
# 新开终端，在 frontend/ 目录下
cd frontend
npm install
npm run dev

# 前端开发服务器：http://localhost:5173
# /api 请求自动代理到 localhost:3000
```

### 7. 内部冒烟检查

```bash
cd backend
npm run test:smoke
```

该检查不依赖数据库，用于快速确认演示账号、共享通知入口、学生导入、文件下载、规划新旧版本切换等关键内部链路没有被改断。

---

## 目录结构

```
Graduate-student_CHINICHI_OS/
├── docker-compose.yml          # PostgreSQL 16 + Redis 7
├── PRD.md                      # 产品需求文档
├── ARCHITECTURE.md             # 技术架构文档
├── README.md                   # 本文件
│
├── backend/                    # 后端服务（Node.js + Fastify）
│   ├── .env.example            # 环境变量示例
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma       # 数据库模型（22张表）
│   │   └── seed.ts             # 种子数据
│   └── src/
│       ├── index.ts            # 服务入口
│       ├── plugins/
│       │   ├── prisma.ts       # Prisma 插件
│       │   └── auth.ts         # JWT 插件
│       ├── middlewares/
│       │   ├── authenticate.ts # JWT 验证中间件
│       │   └── authorize.ts    # RBAC 权限中间件
│       ├── utils/
│       │   └── errors.ts       # AppError 类与错误码
│       ├── routes/
│       │   ├── auth.ts         # 认证路由（微信/手机号登录）
│       │   ├── plans.ts        # 规划闭环路由（完整状态机）
│       │   ├── students.ts     # 学生 CRUD 路由
│       │   └── notifications.ts # 通知路由
│       └── jobs/
│           ├── queue.ts        # BullMQ 队列定义（8个队列）
│           └── check-unset-plans.job.ts  # 未设规划告警任务
│
└── frontend/                   # 前端应用（React 18 + Ant Design 5）
    ├── index.html
    ├── package.json
    ├── tsconfig.json
    ├── tsconfig.node.json
    ├── vite.config.ts          # 含 /api 代理配置
    └── src/
        ├── main.tsx            # 入口文件
        ├── App.tsx             # 路由配置（按角色分流）
        ├── types/
        │   ├── plan.ts         # 规划相关类型（PlanStatus枚举等）
        │   └── student.ts      # 学生相关类型
        ├── api/
        │   ├── client.ts       # Axios 实例（JWT拦截器+自动刷新）
        │   └── plans.api.ts    # 规划 API + React Query Hooks
        ├── stores/
        │   └── auth.store.ts   # 认证状态 Zustand Store
        ├── components/
        │   ├── PlanBanner/     # 规划状态横幅（4种状态）
        │   ├── TaskItem/       # 任务勾选组件（含动画）
        │   └── OperationLog/   # 操作日志时间线
        └── pages/
            ├── student/
            │   ├── Home.tsx    # 学生主页（阶段+待办+锁定状态）
            │   └── PlanConfirm.tsx  # 规划确认页（变更对比）
            └── teacher/
                └── StudentDetail/
                    └── StagesTab.tsx  # 考学阶段Tab（时间轴+操作）
```

---

## 环境变量说明

### 后端 `backend/.env`

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | `postgresql://chinichi:chinichi_dev_pass@localhost:5432/chinichi_graduate` |
| `REDIS_URL` | Redis 连接地址 | `redis://localhost:6379` |
| `JWT_SECRET` | JWT 签名密钥（生产环境必须修改） | `your-super-secret-key` |
| `JWT_ACCESS_EXPIRES_IN` | Access Token 有效期 | `2h` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh Token 有效期 | `30d` |
| `PORT` | 服务监听端口 | `3000` |
| `NODE_ENV` | 环境标识 | `development` / `production` |
| `UPLOAD_DIR` | 本地上传目录（开发/单机部署） | `./uploads` |
| `OSS_*` | 阿里云 OSS 配置（生产文件存储建议项） | 见 `.env.example` |
| `WECHAT_APP_ID` | 微信开放平台 AppID | - |
| `DINGTALK_WEBHOOK_URL` | 钉钉机器人 Webhook | - |

---

## API 文档

### 认证接口

```
POST /api/auth/send-sms      # 发送短信验证码
POST /api/auth/phone-login   # 手机号+验证码登录
POST /api/auth/wechat-login  # 微信扫码登录（骨架）
POST /api/auth/refresh       # 刷新 Token
POST /api/auth/logout        # 登出
```

### 规划接口（核心）

```
GET  /api/students/:id/plans                    # 获取学生所有规划
POST /api/students/:id/plans                    # 创建规划草稿
POST /api/students/:id/plans/:planId/send       # 发送给学生确认
POST /api/students/:id/plans/:planId/confirm    # 学生确认规划
POST /api/students/:id/plans/:planId/reject     # 学生提出异议
POST /api/students/:id/plans/:planId/change     # 发起变更（已生效规划）
GET  /api/students/:id/logs                     # 获取操作日志
```

### 学生管理接口

```
GET   /api/students         # 学生列表（带筛选）
POST  /api/students         # 新建学生档案
GET   /api/students/:id     # 学生详情
PATCH /api/students/:id     # 更新学生信息
POST  /api/students/:id/teacher  # 变更班主任
GET   /api/students/export  # 导出学生 CSV
POST  /api/students/import  # CSV 批量导入学生
```

CSV 导入支持以下表头：`name/姓名`、`phone/手机号`、`campusId/校区ID`、`subjectId/学科ID`、`teacherId/班主任ID`、`entryDate/入学日期`、`targetYear/目标年份`、`targetSeason/目标考季`、`jlptLevel/JLPT等级`、`jlptScore/JLPT分数`、`undergradMajor/本科专业`、`undergradGpa/本科GPA`、`notes/备注`。

### 文件接口

```
GET  /api/students/:id/files
POST /api/students/:id/files
GET  /api/students/:id/files/:fileId/versions/:versionId/download
```

### 通知接口

```
GET  /api/notifications          # 我的通知列表
POST /api/notifications/:id/read # 标记已读
POST /api/notifications/read-all # 全部已读
POST /api/notifications/push     # 手动推送给学生
```

---

## 测试账号（开发环境）

运行 `npm run prisma:seed` 后自动创建：

| 角色 | 手机号 | 密码 |
|------|--------|------|
| 教务总负责人 | 13900000001 | `chinichi2026` |
| 学科负责人 | 13900000004 | `chinichi2026` |
| 班主任 | 13900000002 | `chinichi2026` |
| 学生（测试学生） | 13900000003 | `chinichi2026` |
| 学生（张思远，已有执行中规划） | 13812345678 | `chinichi2026` |
| 初始管理员 | 13800138000 | `Admin@123456` |

开发环境短信验证码接口仍支持固定验证码 `123456`，但前端演示入口使用账号密码登录。

---

## 规划状态机

```
草稿(draft)
    ↓ [班主任发送]
待学生确认(pending) ←─────────────────────────────────┐
    ↓ [学生确认]          ↓ [学生提出异议]             │
已生效(active)        [班主任修改后重新发送]            │
    ↓ [班主任发起变更]                                  │
变更待确认(change_pending) ──────────────────────────► 同上流程
    ↓ [学生确认]
已生效(新版本)(active)
```

所有状态变更均自动写入 `operation_logs`（不可删除）。

---

## 开发路线图

| Phase | 内容 | 状态 |
|-------|------|------|
| **Phase 1 MVP** | 账号体系 + 学生档案 + 规划系统 + 学生待办 | 骨架完成 |
| **Phase 2** | 风险标签 + 进度节点 + 文件管理 + 内诺模块 | 待开发 |
| **Phase 3** | 定时推送 + 钉钉集成 + 数据看板 | 待开发 |
| **Phase 4** | Excel 批量导入 + 历年案例库 + 微信小程序 | 待开发 |
