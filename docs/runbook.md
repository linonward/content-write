# 运行手册

## 本地启动

需要 Node.js 24、pnpm 12 和 Docker。复制 `.env.example` 为 `.env.local`，按需要修改数据库地址、应用地址，并将 `BETTER_AUTH_SECRET` 换成至少 32 字符的随机值（例如用 `openssl rand -base64 48` 生成）。

```bash
pnpm install --frozen-lockfile
docker compose up -d --wait
pnpm db:migrate
pnpm auth:create-admin
pnpm dev
```

另一个终端可运行 `pnpm worker:dev`。T001 worker 只检查数据库连接；任务领取将在 T006 加入。

访问 `/api/healthz` 检查 Web 进程，访问 `/api/readyz` 检查数据库连接。后者在数据库不可用时返回 503。

首次运行用 `pnpm auth:create-admin` 交互式创建管理员。管理员在 `/sign-in` 登录后，从工作台进入 `/admin/users` 创建受邀账号，并通过可信渠道交付初始密码。当前没有邀请邮件、密码重置邮件或自助注册。忘记密码由管理员在受控流程中处理；不要将初始密码写入仓库或日志。`pnpm auth:check` 可检查认证表结构与配置是否匹配。

工作台页面要求登录，普通用户访问管理员页面返回 404。`GET /api/me` 只返回当前会话的身份，未登录返回 401。所有认证写入请求须来自配置的 `BETTER_AUTH_URL`（或 `APP_URL`）Origin。登录入口按数据库记录限流。

## 数据与恢复

本地数据库保存在 Docker volume 中。生产部署、备份和恢复流程在 T023 实现并验证；现在不应把本地 volume 当成备份。

## 安全与凭证

`.env.local` 不入库。公开注册在认证配置中关闭；远程抓取默认关闭。真实模型调用尚未接入。
