# 公众号内容工作台

Phase 0 开发中。当前具备 Web 基础工程、PostgreSQL、健康检查，以及受邀账号的登录和管理。素材与写作能力尚未开放。

## 本地运行

需要 Node.js 24、pnpm 12、Docker。详见 [运行手册](docs/runbook.md)。

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
docker compose up -d --wait
pnpm db:migrate
pnpm auth:create-admin
pnpm dev
```

首次运行时设置 `BETTER_AUTH_SECRET` 为至少 32 字符的随机值；`auth:create-admin` 会交互式创建初始管理员。打开 `http://localhost:3000/sign-in` 登录，再由管理员在 `/admin/users` 创建受邀账号。检查 `http://localhost:3000/api/healthz` 和 `http://localhost:3000/api/readyz`。独立 worker 可用 `pnpm worker:dev` 启动。

## 检查

`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm build`。

需求与任务表见 [产品指南](docs/product.md) 和 [.ai/tasks/index.md](.ai/tasks/index.md)。
