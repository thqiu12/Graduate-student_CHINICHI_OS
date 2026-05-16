# 技术架构设计文档
## 知日塾大学院考学进度管理系统

> 版本：v1.0  
> 日期：2026-05-16  
> 状态：待评审

---

## 一、技术选型总览

### 原则
- **自建系统**，完全自主可控
- 优先选择**成熟稳定**的技术栈，降低维护成本
- 前后端分离，支持未来扩展微信小程序
- 云原生部署，支持弹性扩展

### 技术栈一览

| 层次 | 技术选型 | 理由 |
|------|----------|------|
| **前端 Web** | React 18 + TypeScript | 生态成熟，组件化，适合复杂表单和交互 |
| **前端 UI** | Ant Design 5 | 中文友好，企业级组件库，减少重复开发 |
| **前端状态** | Zustand | 轻量，配合 React Query 管理服务端状态 |
| **前端路由** | React Router v6 | 标准方案 |
| **移动端（二期）** | React Native / 微信小程序 | 复用业务逻辑，API 已预留 |
| **后端框架** | Node.js + Fastify | 高性能，TypeScript 原生支持 |
| **ORM** | Prisma | 类型安全，迁移管理完善 |
| **主数据库** | PostgreSQL 16 | 关系型，支持 JSONB，事务完善 |
| **缓存** | Redis 7 | Session 存储、队列、实时通知 |
| **消息队列** | BullMQ（基于 Redis） | 定时提醒任务、异步通知推送 |
| **文件存储** | 阿里云 OSS / 腾讯云 COS | 学生文件上传，CDN 加速 |
| **微信登录** | 微信开放平台 OAuth2 | 扫码登录 |
| **短信验证** | 阿里云短信 / 腾讯云短信 | 手机号登录验证码 |
| **钉钉集成** | 钉钉开放平台 Webhook | 老师端推送通知 |
| **部署** | Docker + Docker Compose | 容器化，便于迁移和扩展 |
| **反向代理** | Nginx | 静态资源、SSL、负载均衡 |
| **CI/CD** | GitHub Actions | 自动化测试 + 部署 |

---

## 二、系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        客户端层                              │
│  ┌─────────────────┐    ┌─────────────────┐                  │
│  │   Web 浏览器     │    │  微信小程序（二期）│                  │
│  │  React + AntD   │    │  React Native   │                  │
│  └────────┬────────┘    └────────┬────────┘                  │
└───────────┼─────────────────────┼───────────────────────────┘
            │ HTTPS               │ HTTPS
            ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                      网关层（Nginx）                          │
│          SSL 终止 / 静态资源 / 反向代理 / 限流               │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                      应用层（API Server）                     │
│                   Node.js + Fastify                          │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  认证模块 │  │ 学生模块  │  │ 规划模块  │  │ 通知模块  │    │
│  │ JWT/微信  │  │档案/进度  │  │确认/日志  │  │推送/队列  │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ 志望校   │  │辅导记录   │  │ 文件模块  │  │ 报表模块  │    │
│  │内诺跟踪  │  │辅导任务   │  │版本管理   │  │统计看板   │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└──────────────────┬──────────────────────────────────────────┘
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│PostgreSQL│ │  Redis   │ │  OSS/COS │
│主数据库   │ │缓存+队列  │ │  文件存储 │
└──────────┘ └────┬─────┘ └──────────┘
                  │
            ┌─────▼──────┐
            │  BullMQ    │
            │ 定时提醒队列 │
            └─────┬──────┘
                  │
        ┌─────────┼──────────┐
        ▼         ▼          ▼
  ┌──────────┐ ┌──────┐ ┌──────────┐
  │  微信推送 │ │ 钉钉  │ │  邮件/SMS │
  │（小程序） │ │Webhook│ │          │
  └──────────┘ └──────┘ └──────────┘
```

---

## 三、数据库设计（PostgreSQL）

### 3.1 核心表清单

| 表名 | 说明 |
|------|------|
| `users` | 所有用户（老师+学生），统一账号 |
| `roles` | 角色定义 |
| `user_roles` | 用户-角色关联 |
| `campuses` | 校区 |
| `subjects` | 学科（文科大学院/理科大学院） |
| `students` | 学生档案 |
| `student_teacher` | 学生-班主任关联（支持变更历史） |
| `exam_plans` | 学生考试季规划（目标夏/冬季考） |
| `study_periods` | 考学阶段（P1-P8） |
| `period_plans` | 阶段规划（含版本、状态、确认记录） |
| `period_plan_tasks` | 规划内的具体任务 |
| `plan_confirmations` | 规划确认记录 |
| `operation_logs` | 操作日志（不可删除） |
| `risk_tags` | 风险标签定义 |
| `student_risk_tags` | 学生-风险标签关联 |
| `target_schools` | 志望校 |
| `school_progress_nodes` | 志望校进度节点 |
| `inno_tracking` | 内诺跟踪（理科专属） |
| `coaching_records` | 辅导记录 |
| `coaching_todos` | 辅导记录关联的待办 |
| `files` | 文件记录 |
| `file_versions` | 文件版本 |
| `notifications` | 站内通知 |
| `notification_rules` | 提醒规则配置 |

---

### 3.2 核心表 DDL

```sql
-- ══════ 用户与权限 ══════

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(50) NOT NULL,
  phone         VARCHAR(20) UNIQUE,
  wechat_openid VARCHAR(100) UNIQUE,
  email         VARCHAR(100),
  avatar_url    TEXT,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 角色：admin_total（教务总）/ subject_head（学科负责人）/ teacher（班主任）/ student（学生）
CREATE TABLE roles (
  id   SERIAL PRIMARY KEY,
  code VARCHAR(30) UNIQUE NOT NULL, -- 'admin_total' | 'subject_head' | 'teacher' | 'student'
  name VARCHAR(50) NOT NULL
);

CREATE TABLE user_roles (
  user_id    UUID REFERENCES users(id),
  role_id    INT  REFERENCES roles(id),
  subject_id INT  REFERENCES subjects(id), -- 学科负责人专用
  campus_id  INT  REFERENCES campuses(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id)
);

-- ══════ 校区与学科 ══════

CREATE TABLE campuses (
  id   SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL -- 东京校、关西校...
);

CREATE TABLE subjects (
  id   SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,  -- 文科大学院、理科大学院
  code VARCHAR(20) NOT NULL   -- 'liberal' | 'science'
);

-- ══════ 学生档案 ══════

CREATE TABLE students (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) UNIQUE,
  campus_id       INT  REFERENCES campuses(id),
  subject_id      INT  REFERENCES subjects(id),
  entry_date      DATE,
  target_year     VARCHAR(20),    -- '2027年春入学'
  target_season   VARCHAR(30),    -- '2027年冬季考'
  jlpt_level      VARCHAR(10),    -- 'N1'
  jlpt_score      INT,
  undergrad_major VARCHAR(100),
  undergrad_gpa   NUMERIC(3,2),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 班主任变更历史
CREATE TABLE student_teacher (
  id          SERIAL PRIMARY KEY,
  student_id  UUID REFERENCES students(id),
  teacher_id  UUID REFERENCES users(id),
  started_at  TIMESTAMPTZ DEFAULT NOW(),
  ended_at    TIMESTAMPTZ,       -- NULL 表示当前有效
  changed_by  UUID REFERENCES users(id),
  change_reason TEXT
);

-- ══════ 风险标签 ══════

CREATE TABLE risk_tags (
  id    SERIAL PRIMARY KEY,
  code  VARCHAR(50) UNIQUE NOT NULL,
  label VARCHAR(100) NOT NULL,
  color VARCHAR(20)
);

CREATE TABLE student_risk_tags (
  id          SERIAL PRIMARY KEY,
  student_id  UUID REFERENCES students(id),
  tag_id      INT  REFERENCES risk_tags(id),
  reason      TEXT NOT NULL,
  tagged_by   UUID REFERENCES users(id),
  tagged_at   TIMESTAMPTZ DEFAULT NOW(),
  removed_at  TIMESTAMPTZ,
  removed_by  UUID REFERENCES users(id),
  remove_reason TEXT
);

-- ══════ 规划与阶段 ══════

-- 阶段模板（P1-P8）
CREATE TABLE study_period_templates (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(20) NOT NULL, -- 'P1'..'P8'
  name        VARCHAR(50) NOT NULL,
  subject_id  INT REFERENCES subjects(id), -- NULL=通用, 非NULL=学科专属
  sort_order  INT DEFAULT 0
);

-- 学生的具体阶段规划（版本化）
CREATE TABLE period_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID REFERENCES students(id),
  period_code     VARCHAR(20) NOT NULL,  -- 'P1'..'P8'
  stage_name      VARCHAR(100) NOT NULL,
  goal            TEXT,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  version         INT NOT NULL DEFAULT 1,

  -- 状态：draft / pending / change_pending / active / completed / cancelled
  status          VARCHAR(30) NOT NULL DEFAULT 'draft',

  change_reason   TEXT,                  -- 变更时必填
  previous_plan_id UUID REFERENCES period_plans(id), -- 上一版本

  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  sent_at         TIMESTAMPTZ,           -- 发送给学生的时间
  confirmed_at    TIMESTAMPTZ,           -- 学生确认时间
  confirmed_by    UUID REFERENCES users(id),

  UNIQUE (student_id, period_code, version)
);

-- 规划内的具体任务
CREATE TABLE period_plan_tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     UUID REFERENCES period_plans(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL,
  description TEXT,
  due_date    DATE,
  due_time    TIME,
  priority    VARCHAR(10) DEFAULT '中',  -- '高'|'中'|'低'
  repeat_type VARCHAR(20) DEFAULT 'once', -- 'once'|'daily'|'weekly'
  sort_order  INT DEFAULT 0,

  -- 完成状态（学生操作）
  status      VARCHAR(20) DEFAULT 'pending', -- 'pending'|'in_progress'|'done'|'overdue'
  done_at     TIMESTAMPTZ,
  done_note   TEXT,                          -- 学生完成说明

  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 规划确认/异议记录
CREATE TABLE plan_confirmations (
  id          SERIAL PRIMARY KEY,
  plan_id     UUID REFERENCES period_plans(id),
  action      VARCHAR(20) NOT NULL, -- 'confirm' | 'reject'
  actor_id    UUID REFERENCES users(id),
  content     TEXT,   -- 异议时的内容
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ══════ 操作日志（不可删除） ══════

CREATE TABLE operation_logs (
  id          BIGSERIAL PRIMARY KEY,
  student_id  UUID REFERENCES students(id),
  actor_id    UUID REFERENCES users(id),
  actor_name  VARCHAR(50),        -- 冗余存储，防止用户删除后丢失
  action_type VARCHAR(50) NOT NULL,
  -- plan_create / plan_send / plan_confirm / plan_reject
  -- plan_change / alert_no_plan / alert_unconfirmed
  -- teacher_change / tag_add / tag_remove
  target_type VARCHAR(50),        -- 'period_plan' | 'risk_tag' | 'teacher' ...
  target_id   VARCHAR(100),       -- 关联记录 ID
  detail      JSONB,              -- 完整的操作详情（字段级 diff 等）
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 禁止 DELETE（通过权限控制，应用层不暴露删除接口）

-- ══════ 志望校与内诺 ══════

CREATE TABLE target_schools (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID REFERENCES students(id),
  university_name VARCHAR(200) NOT NULL,
  department      VARCHAR(200),
  rank            INT,            -- 志望顺位
  professor_name  VARCHAR(100),
  professor_url   TEXT,
  exam_types      VARCHAR(100)[],  -- ['筆試','面接']
  application_start DATE,
  application_end   DATE,
  exam_date         DATE,
  result_date       DATE,
  result            VARCHAR(20),  -- '合格'|'不合格'|'補欠'|'放棄'
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 进度节点
CREATE TABLE school_progress_nodes (
  id          SERIAL PRIMARY KEY,
  school_id   UUID REFERENCES target_schools(id) ON DELETE CASCADE,
  node_code   VARCHAR(50) NOT NULL,
  node_name   VARCHAR(100) NOT NULL,
  is_done     BOOLEAN DEFAULT FALSE,
  done_at     TIMESTAMPTZ,
  done_by     UUID REFERENCES users(id),
  sort_order  INT DEFAULT 0
);

-- 内诺跟踪（理科专属）
CREATE TABLE inno_tracking (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID REFERENCES target_schools(id) UNIQUE,
  status          VARCHAR(20) DEFAULT 'not_started',
  -- 'not_started'|'in_progress'|'confirmed'|'rejected'
  contact_count   INT DEFAULT 0,
  last_contact_at DATE,
  confirmed_at    DATE,
  notes           TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 内诺沟通记录
CREATE TABLE inno_contacts (
  id          SERIAL PRIMARY KEY,
  tracking_id UUID REFERENCES inno_tracking(id),
  method      VARCHAR(30),  -- '邮件'|'面谈'|'线上会议'
  contact_date DATE,
  summary     TEXT,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ══════ 辅导记录 ══════

CREATE TABLE coaching_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID REFERENCES students(id),
  teacher_id    UUID REFERENCES users(id),
  coached_at    DATE NOT NULL,
  form          VARCHAR(20),   -- '面谈'|'线上'|'微信'|'电话'
  school_ids    UUID[],        -- 涉及的志望校
  content       TEXT NOT NULL,
  next_date     DATE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 辅导关联的待办（自动创建到 period_plan_tasks 或独立）
CREATE TABLE coaching_todos (
  id                SERIAL PRIMARY KEY,
  coaching_id       UUID REFERENCES coaching_records(id),
  task_id           UUID REFERENCES period_plan_tasks(id), -- 关联到规划任务
  title             TEXT NOT NULL,
  due_date          DATE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ══════ 文件管理 ══════

CREATE TABLE files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID REFERENCES students(id),
  file_type     VARCHAR(50) NOT NULL,
  -- 'research_plan'|'transcript'|'recommendation'|'language_cert'|'professor_email'|'admission_notice'|'other'
  display_name  VARCHAR(200) NOT NULL,
  uploaded_by   UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE file_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id     UUID REFERENCES files(id),
  version_no  INT NOT NULL,
  oss_key     TEXT NOT NULL,      -- OSS 存储路径
  file_size   BIGINT,
  mime_type   VARCHAR(100),
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  notes       TEXT
);

-- ══════ 通知系统 ══════

CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  type        VARCHAR(50) NOT NULL,
  title       VARCHAR(200) NOT NULL,
  content     TEXT,
  related_id  UUID,               -- 关联的业务记录 ID
  is_read     BOOLEAN DEFAULT FALSE,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 通知推送渠道记录
CREATE TABLE notification_deliveries (
  id              SERIAL PRIMARY KEY,
  notification_id UUID REFERENCES notifications(id),
  channel         VARCHAR(20) NOT NULL, -- 'in_app'|'dingtalk'|'wechat'|'sms'|'email'
  status          VARCHAR(20) DEFAULT 'pending',
  sent_at         TIMESTAMPTZ,
  error_msg       TEXT
);
```

---

### 3.3 关键索引

```sql
-- 查询性能关键索引
CREATE INDEX idx_students_campus    ON students(campus_id);
CREATE INDEX idx_students_subject   ON students(subject_id);
CREATE INDEX idx_period_plans_student ON period_plans(student_id, status);
CREATE INDEX idx_tasks_plan         ON period_plan_tasks(plan_id, status);
CREATE INDEX idx_tasks_due          ON period_plan_tasks(due_date) WHERE status != 'done';
CREATE INDEX idx_op_logs_student    ON operation_logs(student_id, created_at DESC);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_school_student     ON target_schools(student_id);
CREATE INDEX idx_coaching_student   ON coaching_records(student_id, coached_at DESC);
CREATE INDEX idx_risk_tags_student  ON student_risk_tags(student_id) WHERE removed_at IS NULL;
```

---

## 四、API 设计（RESTful）

### 4.1 认证

```
POST /api/auth/wechat-login     微信扫码登录
POST /api/auth/phone-login      手机号+验证码登录
POST /api/auth/refresh          刷新 Token
POST /api/auth/logout           登出
```

### 4.2 学生管理

```
GET    /api/students            学生列表（支持筛选：校区/学科/阶段/标签）
POST   /api/students            新增学生
GET    /api/students/:id        学生详情
PATCH  /api/students/:id        更新学生信息
POST   /api/students/:id/teacher   变更班主任
POST   /api/students/import     Excel 批量导入
GET    /api/students/:id/timeline  学生完整时间线
```

### 4.3 规划系统（核心）

```
GET    /api/students/:id/plans              获取学生所有阶段规划
POST   /api/students/:id/plans              创建新规划（草稿）
GET    /api/students/:id/plans/:planId      获取规划详情
PATCH  /api/students/:id/plans/:planId      更新规划（草稿状态）
POST   /api/students/:id/plans/:planId/send    发送给学生确认
POST   /api/students/:id/plans/:planId/confirm 学生确认规划
POST   /api/students/:id/plans/:planId/reject  学生提出异议
POST   /api/students/:id/plans/:planId/change  发起变更（已生效规划）

GET    /api/students/:id/plans/:planId/tasks   获取规划任务列表
POST   /api/students/:id/plans/:planId/tasks   新增任务
PATCH  /api/tasks/:taskId                      更新任务（含标记完成）
DELETE /api/tasks/:taskId                      删除任务（规划未生效时）
```

### 4.4 操作日志

```
GET  /api/students/:id/logs     获取操作日志（不分页，按时间倒序）
GET  /api/logs/export           导出日志（仅教务总负责人）
```

### 4.5 志望校与内诺

```
GET    /api/students/:id/schools         志望校列表
POST   /api/students/:id/schools         新增志望校
PATCH  /api/schools/:id                  更新志望校
PATCH  /api/schools/:id/nodes/:nodeCode  更新进度节点

GET    /api/schools/:id/inno             获取内诺跟踪
PATCH  /api/schools/:id/inno             更新内诺状态
POST   /api/schools/:id/inno/contacts    添加内诺沟通记录
```

### 4.6 辅导记录

```
GET    /api/students/:id/coaching   辅导记录列表
POST   /api/students/:id/coaching   新增辅导记录
PATCH  /api/coaching/:id            更新辅导记录
```

### 4.7 风险标签

```
POST   /api/students/:id/tags        添加风险标签
DELETE /api/students/:id/tags/:tagId 移除风险标签（需填写原因）
```

### 4.8 通知

```
GET    /api/notifications           我的通知列表
POST   /api/notifications/:id/read  标为已读
POST   /api/notifications/read-all  全部已读
POST   /api/notifications/push      班主任手动推送给学生
```

### 4.9 统计看板

```
GET  /api/stats/teacher           班主任看板数据
GET  /api/stats/subject           学科负责人看板数据
GET  /api/stats/admin             教务总负责人看板数据
GET  /api/stats/inno              内诺统计（支持按校区/班主任筛选）
GET  /api/stats/season            考试季分布统计
```

---

## 五、定时任务设计（BullMQ）

| 任务名 | 触发条件 | 执行内容 |
|--------|----------|----------|
| `check-unset-plans` | 每天 9:00 | 扫描入塾>7天无规划的学生，告警学科负责人 |
| `check-unconfirmed-plans` | 每天 9:00 | 扫描待确认规划，触发相应级别提醒 |
| `check-overdue-tasks` | 每天 8:00 | 扫描逾期任务，推送给班主任+学生 |
| `check-deadline-approaching` | 每天 9:00 | 出愿截止/考试前 14/7/3/1 天提醒 |
| `check-inno-followup` | 每天 10:00 | 内诺邮件10天无回复提醒，30天无进展升级 |
| `weekly-summary-teacher` | 每周一 8:30 | 班主任周报（风险学生+本周截止） |
| `weekly-summary-dept` | 每周一 9:00 | 学科负责人周报 |
| `monthly-report-admin` | 每月1日 9:00 | 教务总负责人月报 |
| `send-notifications` | 实时队列 | 处理所有通知推送（站内/钉钉/微信/短信） |

---

## 六、安全设计

| 方面 | 方案 |
|------|------|
| **认证** | JWT（Access Token 2h + Refresh Token 30d），Redis 黑名单 |
| **授权** | RBAC，每个 API 接口级别鉴权，中间件统一处理 |
| **数据隔离** | 所有查询带 `userId/roleId` 过滤，防止越权访问 |
| **SQL 注入** | 全程 Prisma ORM，参数化查询 |
| **XSS** | 前端 CSP 策略 + 输入内容转义 |
| **文件上传** | OSS 直传（前端获取预签名 URL），后端不处理文件流；文件类型白名单 |
| **操作日志** | 不可删除，权限管理员也无法删除（数据库级触发器保护） |
| **HTTPS** | 全站强制 HTTPS，HSTS |
| **限流** | Nginx + API 层双重限流，登录接口短信防刷 |

---

## 七、部署架构

```
┌─────────────────────────────────────────┐
│              生产环境（云服务器）          │
│                                          │
│  ┌──────────────────────────────────┐   │
│  │         Docker Compose           │   │
│  │                                  │   │
│  │  ┌─────────┐  ┌───────────────┐  │   │
│  │  │  Nginx  │  │  API Server   │  │   │
│  │  │ :80/:443│  │  Node.js:3000 │  │   │
│  │  └────┬────┘  └───────┬───────┘  │   │
│  │       │               │           │   │
│  │  ┌────▼───────────────▼────────┐  │   │
│  │  │         内部网络             │  │   │
│  │  │  PostgreSQL:5432            │  │   │
│  │  │  Redis:6379                 │  │   │
│  │  └─────────────────────────────┘  │   │
│  └──────────────────────────────────┘   │
│                                          │
│  静态资源 → CDN（前端打包后上传）          │
│  文件存储 → 阿里云 OSS                    │
│  域名 SSL → Let's Encrypt / 云证书        │
└─────────────────────────────────────────┘
```

### 推荐服务器配置（初期）

| 项目 | 配置 |
|------|------|
| **应用服务器** | 4核 8GB，SSD 100GB（阿里云/腾讯云 ECS） |
| **数据库** | RDS PostgreSQL，2核 4GB，100GB SSD，自动备份 |
| **Redis** | 云 Redis，1GB（Session + 队列） |
| **OSS** | 按量付费，初期约 10GB |
| **预估月费** | 约 ¥800～1200/月 |

---

## 八、开发里程碑（细化）

### Phase 1 MVP（5周）

| 周次 | 任务 |
|------|------|
| Week 1 | 项目初始化，数据库建模，用户认证（微信+手机号），RBAC 权限框架 |
| Week 2 | 学生档案 CRUD，班主任管理，Excel 导入 |
| Week 3 | 规划系统（创建/发送/确认/变更/操作日志） |
| Week 4 | 阶段任务（创建/编辑/勾选完成），学生端规划视图 |
| Week 5 | 前端集成联调，MVP 部署上线，内部测试 |

### Phase 2（3周）

| 周次 | 任务 |
|------|------|
| Week 6 | 志望校 + 进度节点 + 内诺跟踪模块 |
| Week 7 | 文件上传（OSS 直传 + 版本管理） |
| Week 8 | 辅导记录，风险标签系统，站内通知 |

### Phase 3（3周）

| 周次 | 任务 |
|------|------|
| Week 9  | BullMQ 定时任务，钉钉推送集成 |
| Week 10 | 三级数据看板（班主任/学科/总部），内诺统计，考试季分布 |
| Week 11 | 性能优化，安全审查，压测，正式上线 |

### Phase 4（后续迭代）

- 微信小程序学生端
- 历年合格案例库
- AI 辅助（研究计划书修改建议、志望校推荐）

---

## 九、待确认技术决策

1. **云服务商**：阿里云 vs 腾讯云？（推荐阿里云，国内稳定，OSS+钉钉生态）
2. **域名**：系统使用什么域名？
3. **微信公众号/小程序主体**：登录需要已认证的微信开放平台账号，是否已有？
4. **钉钉集成**：是否复用现有知日塾龙虾机器人的 AppKey？
5. **数据备份策略**：RDS 自动备份 7天 是否足够，是否需要异地备份？
