# 公众号内容工作台

Phase 0 开发中。工程采用 pnpm workspace + Turborepo：`apps/web` 仅提供 Next.js 页面，`apps/api` 提供独立的模块化 Hono API，`apps/worker` 独立运行后台任务，`packages/db` 仅供服务端使用。受邀账号登录、文字、Markdown 与链接素材保存、编辑、搜索、过滤、删除，以及确定性 mock 素材整理和失败重试已实现；写作流程仍在开发。

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

将 `BETTER_AUTH_SECRET` 改为至少 32 字符的随机值。Web 位于 `http://localhost:3000`，API 位于 `http://localhost:3001`；Web 不提供 `/api/*` 路由。打开 `/sign-in` 登录，再由管理员在 `/admin/users` 创建受邀账号。独立 worker 使用 `pnpm worker:dev` 启动。

## 检查

`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm build`。

需求与任务表见 [产品指南](docs/product.md) 和 [.ai/tasks/index.md](.ai/tasks/index.md)。
