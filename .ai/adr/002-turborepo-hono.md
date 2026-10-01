# ADR 002：Turborepo 与独立 Hono API

状态：采用（T025）；覆盖 ADR 001 中 Web 承担 API 的部分。

用户要求将工程调整为 `apps/web`、`apps/api`、`apps/worker`，并明确 Web 不再承担 API 能力。采用 pnpm workspace + Turborepo 编排检查与开发进程；Next.js 仅渲染页面；Hono 在独立 Node 进程中按模块挂载路由；worker 独立运行。数据库连接、schema 和迁移放在 `packages/db`，只由服务端应用依赖。

浏览器直接调用 API 地址。`NEXT_PUBLIC_API_URL` 是浏览器可见地址；`WEB_ORIGIN` 限制 API 的 CORS 来源。生产环境的域名、TLS 和网络拓扑由部署任务确定，不能将本地端口视为生产配置。

T025 只迁移现有基线接口和 worker，不提前实现业务 API、鉴权或队列。T002 在 T025 PR 创建后先合并主线。T025 随后集成 T002：认证 API 迁至 Hono，Web 保留页面与通过 API 查询会话的服务端渲染。

认证限流的客户端 IP 由 Hono Node 连接信息提供，API 会覆盖调用方同名请求头。若生产环境位于反向代理后，可信代理与真实客户端 IP 策略需在部署任务中配置和验证。
