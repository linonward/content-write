# 运行手册

## 本地启动

需要 Node.js 24、pnpm 12 和 Docker。复制 `.env.example` 为 `.env.local`，按需要修改数据库地址。

```bash
pnpm install --frozen-lockfile
docker compose up -d --wait
pnpm db:migrate
pnpm dev
```

另一个终端可运行 `pnpm worker:dev`。T001 worker 只检查数据库连接；任务领取将在 T006 加入。

访问 `/api/healthz` 检查 Web 进程，访问 `/api/readyz` 检查数据库连接。后者在数据库不可用时返回 503。

## 数据与恢复

本地数据库保存在 Docker volume 中。生产部署、备份和恢复流程在 T023 实现并验证；现在不应把本地 volume 当成备份。

## 安全与凭证

`.env.local` 不入库。公开注册和远程抓取默认关闭。真实模型调用尚未接入。
