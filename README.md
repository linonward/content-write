# 公众号内容工作台

Phase 0 开发中。当前 T001 提供可运行的 Web 基础工程、PostgreSQL 连接、迁移、健康检查和 CI 基线。登录、素材与写作能力尚未开放。

## 本地运行

需要 Node.js 24、pnpm 12、Docker。详见 [运行手册](docs/runbook.md)。

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
docker compose up -d
pnpm db:migrate
pnpm dev
```

检查 `http://localhost:3000/api/healthz` 和 `http://localhost:3000/api/readyz`。独立 worker 可用 `pnpm worker:dev` 启动。

## 检查

`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm build`。

需求与任务表见 [产品指南](docs/product.md) 和 [.ai/tasks/index.md](.ai/tasks/index.md)。
