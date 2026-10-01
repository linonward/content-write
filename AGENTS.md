# 开发约定

- 先读 `docs/product.md`、`.ai/tasks/index.md` 和当前任务详情；核对 Git 状态与 worktree。
- 一个任务使用独立分支与平级 worktree。看板、任务详情和验证记录都在任务分支更新，并通过 PR 提交。
- 所有后续任务必须创建 PR；不得直接在 `main` 提交、推送或本地合并任务分支。依赖 PR 合并并完成集成验收后开始下游任务；不自动启动并行代理。
- PR 合并并完成集成验收后，停止该任务服务，确认 worktree 干净并及时清理；未合并的 PR 保留 worktree。
- 保持 TypeScript 严格模式。`apps/web` 只承担页面能力，不实现 API；业务 API 位于 `apps/api`，数据库和密钥模块不得被客户端导入。
- `apps/api` 模块按 `routes.ts` → `service.ts` → `repository.ts` 分层：路由只做校验、调用和错误映射，不导入数据库；service 负责业务规则、开启事务并抛出领域错误；repository 只做数据访问，接收 `tx`，不判断业务条件。无业务规则的单条读取可由路由直接调用 repository。api 与 worker 共用的规则放在共享包，不各自复制。见 `.ai/adr/003-api-layering.md`。
- 数据访问默认用 Drizzle 查询构建器，行锁用 `.for("update")`；Drizzle 无法表达时用 `sql` 模板引用 schema 列并注明原因。不新增 `getPool()` 加字符串 SQL 的查询。
- 每个切片同时实现必要的权限、错误反馈、验证与文档。未实现能力不得显示为可用。
- 运行真实检查并记录结果；mock 与真实服务分开标识。不得编造测试通过。
- 只暂存本任务文件；提交前检查 `git diff --cached --check`。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
