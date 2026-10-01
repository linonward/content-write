# ADR 002：Turborepo 与独立 Hono API

状态：采用（T025）；覆盖 ADR 001 中 Web 承担 API 的部分。

用户要求将工程调整为 `apps/web`、`apps/api`、`apps/worker`，并明确 Web 不再承担 API 能力。采用 pnpm workspace + Turborepo 编排检查与开发进程；Next.js 仅渲染页面；Hono 在独立 Node 进程中按模块挂载路由；worker 独立运行。数据库连接、schema 和迁移放在 `packages/db`，只由服务端应用依赖。

浏览器直接调用 API 地址。`NEXT_PUBLIC_API_URL` 是浏览器可见地址；`WEB_ORIGIN` 限制 API 的 CORS 来源。生产环境的域名、TLS 和网络拓扑由部署任务确定，不能将本地端口视为生产配置。

T025 只迁移现有基线接口和 worker，不提前实现业务 API、鉴权或队列。T002 正在独立 worktree 开发，合并前须适配本 ADR 的服务边界并重跑验证。
