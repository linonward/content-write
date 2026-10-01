# 运行手册

## 本地启动

需要 Node.js 24、pnpm 12 和 Docker。复制 `.env.example` 为 `.env.local`，按需要修改数据库、Web 和 API 地址，并将 `BETTER_AUTH_SECRET` 换成至少 32 字符的随机值（例如用 `openssl rand -base64 48` 生成）。

```bash
pnpm install --frozen-lockfile
docker compose up -d --wait
pnpm db:migrate
pnpm auth:create-admin
pnpm dev
```

`pnpm dev` 通过 Turborepo 启动 Web（3000）和 API（3001）。另一个终端运行 `pnpm worker:dev`。素材整理需要常驻 worker：API 持久化任务并返回 202，worker 从 PostgreSQL 领取任务，页面轮询本人任务。`AI_MODE=mock` 使用确定性来源摘录，仅用于开发验证；真实模型在 T021 接入。其他模式当前返回 503，不会伪称已完成真实分析。

`AI_DAILY_JOB_LIMIT` 默认每用户每日 20 个逻辑任务（按 Asia/Shanghai 自然日），`AI_USER_CONCURRENCY` 默认每用户同时 2 个任务。任务截止时间 5 分钟，租约 30 秒；失败或租约失效最多尝试 3 次。任务重试入口和搜索过滤属于 T007。

Web 只负责页面和会话页面渲染，不提供 API 路由。浏览器直接请求 `NEXT_PUBLIC_API_URL` 指向的 Hono API；Web 服务端用 `API_INTERNAL_URL` 查询当前会话。API 使用 `WEB_ORIGIN` 限制浏览器跨域来源，`BETTER_AUTH_URL` 指向 API 地址。部署时分别配置这些地址，并确保认证 cookie 在 Web 与 API 域名之间可用。`GET /api/healthz` 检查 API 进程，`GET /api/readyz` 检查数据库连接；数据库不可用时后者返回 503。

单独启动：`pnpm web:dev`、`pnpm api:dev`、`pnpm worker:dev`。生产运行 Web 用 `pnpm --filter @content-write/web start`，API 和 worker 分别用对应包的 `start` 脚本。数据库迁移由 `packages/db` 执行，不在 Web 启动时自动执行。

首次运行用 `pnpm auth:create-admin` 交互式创建管理员。管理员在 `/sign-in` 登录后，从工作台进入 `/admin/users` 创建受邀账号，并通过可信渠道交付初始密码。当前没有邀请邮件、密码重置邮件或自助注册。忘记密码由管理员在受控流程中处理；不要将初始密码写入仓库或日志。`pnpm auth:check` 可检查认证表结构与配置是否匹配。

工作台页面要求登录，普通用户访问管理员页面返回 404。`GET /api/me` 只返回当前会话的身份，未登录返回 401。认证写入请求须来自 `WEB_ORIGIN`。登录入口按数据库记录限流。

## 数据与恢复

本地数据库保存在 Docker volume 中。生产部署、备份和恢复流程在 T023 实现并验证；现在不应把本地 volume 当成备份。

## 安全与凭证

`.env.local` 不入库。公开注册在认证配置中关闭；远程抓取默认关闭。真实模型调用尚未接入。
