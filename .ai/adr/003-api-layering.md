# ADR 003：API 分层与 Drizzle 默认

状态：采用（T027 执行迁移）；新代码立即遵守。

T003–T007 的素材模块使用 Drizzle，T008 起的选题、文章与 worker 改为通过 `pg` 手写 SQL，项目中两种写法并存且未记录原因。手写查询的结果类型由泛型手动声明，修改 schema 后不会产生类型错误；repository 同时承担事务、加锁和业务前置条件，api 与 worker 各自实现同一检查。

决定：

- `apps/api` 模块分为 `routes.ts`（HTTP 边界）、`service.ts`（业务规则与事务）、`repository.ts`（数据访问）。没有业务规则的单条读取允许路由直接调用 repository，不为转发增加空 service。
- 数据访问默认使用 Drizzle 查询构建器。行锁、`ON CONFLICT`、`SKIP LOCKED` 等能力优先用 Drizzle API；无法表达时用 `sql` 模板引用 schema 列，并注明原因。不再新增 `getPool()` 加字符串 SQL 的查询。
- 事务由 service 通过 `getDb().transaction()` 开启，repository 接收 `tx`。
- service 抛出领域错误，由 HTTP 层统一映射为错误响应。
- api 与 worker 共用的业务规则放在共享包中，不在两侧复制。

放弃的方案：

- 全部保留手写 SQL：锁和查询形状更直观，但 schema 变更没有类型保护，与 `docs/product.md` 选定的技术方案不一致。
- 强制每个接口都经过 service：简单读取会产生只转发的空层，违反 `docs/product.md` "没有需要的层不强行增加"。

重新评估条件：若 Drizzle 无法表达的查询在某模块中占多数，或迁移后关键查询性能明显下降，重新评估该模块的数据访问方式。
