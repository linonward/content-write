# 运行手册

## 本地启动

需要 Node.js 24、pnpm 12 和 Docker。复制 `.env.example` 为 `.env.local`，按需要修改数据库地址和服务地址。

```bash
pnpm install --frozen-lockfile
docker compose up -d --wait
pnpm db:migrate
pnpm dev
```

`pnpm dev` 通过 Turborepo 启动 Web（3000）和 API（3001）。另一个终端运行 `pnpm worker:dev`。当前 worker 只检查数据库连接；任务领取将在 T006 加入。

Web 只负责页面。浏览器直接请求 `NEXT_PUBLIC_API_URL` 指向的 API；API 使用 `WEB_ORIGIN` 控制允许跨域访问的 Web 来源。部署时分别配置这两个地址，API 不得假定由 Next.js 代理。`GET /api/healthz` 检查 API 进程，`GET /api/readyz` 检查数据库连接；数据库不可用时后者返回 503。

单独启动：`pnpm web:dev`、`pnpm api:dev`、`pnpm worker:dev`。生产运行 Web 用 `pnpm --filter @content-write/web start`，API 和 worker 分别用对应包的 `start` 脚本。数据库迁移由 `packages/db` 执行，不在 Web 启动时自动执行。

## 数据与恢复

本地数据库保存在 Docker volume 中。生产部署、备份和恢复流程在 T023 实现并验证；现在不应把本地 volume 当成备份。

## 安全与凭证

`.env.local` 不入库。`packages/db` 仅供 API 和 worker 导入，Web 不依赖数据库包。公开注册和远程抓取默认关闭。真实模型调用尚未接入。
