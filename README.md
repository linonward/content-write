# 公众号内容工作台

Phase 0 开发中。工程采用 pnpm workspace + Turborepo：`apps/web` 提供 Next.js 页面，`apps/api` 提供模块化 Hono API，`apps/worker` 独立运行后台任务，`packages/db` 仅供服务端使用。当前可用功能仍是基础页面、数据库迁移和健康检查。

## 本地运行

需要 Node.js 24、pnpm 12、Docker。详见 [运行手册](docs/runbook.md)。

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
docker compose up -d --wait
pnpm db:migrate
pnpm dev
```

Web 位于 `http://localhost:3000`，API 位于 `http://localhost:3001`。浏览器直接调用 API；Web 不提供 `/api/*` 路由。独立 worker 使用 `pnpm worker:dev` 启动。

## 检查

`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm build`。

需求与任务表见 [产品指南](docs/product.md) 和 [.ai/tasks/index.md](.ai/tasks/index.md)。
