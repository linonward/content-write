# ADR 001：Phase 0 单仓库架构

状态：采用（T001）

采用 Next.js App Router、React、TypeScript、PostgreSQL、Drizzle 和独立 Node worker。Web API 负责鉴权与短请求，后续长任务写入 PostgreSQL，由 worker 领取。T001 worker 只验证进程与数据库连接，不预先实现队列。

理由：一个 Web 应用和一个 worker 足以支撑首轮试用，并可在后续切片中验证真实任务恢复。业务表随功能增加，避免一次性建立未使用结构。

差异：T001 暂不加入 Better Auth、CodeMirror、TanStack Query、PostHog 或 AI Adapter；它们在首次需要的垂直任务加入。T001 的首页仅展示工程状态，不代表完整 `/home`。
