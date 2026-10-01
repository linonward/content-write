# API 契约

统一错误与后续业务入口见 `docs/product.md` 第 6 节。T001、T002 已实现，T025 将接口迁入独立 Hono API：

- `GET /api/healthz`：200，`{"status":"ok"}`，只检查 Web 进程。
- `GET /api/readyz`：数据库可连接时 200，`{"status":"ready","database":true}`；不可连接时 503，`{"status":"unavailable","database":false}`。
- `GET /api/me`：需要会话，返回 `{user:{id,name,email,role}}`；未登录返回 401 与统一错误结构。忽略客户端传入的用户 ID。
- `/api/auth/*`：Better Auth 会话接口。支持邮箱密码登录、退出及管理员创建受邀用户；公开注册返回 400。认证写入请求校验 `WEB_ORIGIN`，普通用户调用管理员创建接口返回 403。详细请求结构遵循项目锁定的 Better Auth 版本。

业务路由在对应任务实现，不把尚未实现的接口声明为可用。

T006 新增：

- `POST /api/materials/:id/process`：需要会话、可信 Origin 和 `Idempotency-Key`；同用户同键同素材版本返回同一 jobId，不同输入返回 409。新任务返回 202 `{jobId,status:"queued",mode:"mock"}`。空正文返回 422，每日和并发超额返回 429，非 mock 模式返回 503。
- `GET /api/materials/:id/analysis`：仅本人可见；返回当前版本的分析结果与该版本最近任务状态。编辑素材后旧分析不会作为当前结果返回。
- `GET /api/jobs/:id`：仅本人任务可见；其他用户返回 404。返回状态、错误码与成功结果；客户端轮询。

T007 新增：

- `GET /api/materials`：本人素材列表。可选 `q`（标题、正文、来源 URL 子串，最多 100 字）、`kind`（text/markdown/link）、`status`（unprocessed/processing/failed/analyzed）和 `tag`（当前版本分析的完整标签，最多 50 字）。过滤在数据库执行，最多返回最近 100 条匹配素材，并附 `hasMore`。每条包含当前版本分析状态和标签；旧版本分析不参与过滤。
- `POST /api/jobs/:id/retry`：仅本人失败任务可重试，需可信 Origin 与 `Idempotency-Key`。使用原任务绑定的素材版本重新创建逻辑任务；重复键返回同一新任务。版本变化或任务非失败返回 409；空正文 422，配额或并发超额 429，模型不可用 503。成功返回 202 `{jobId,status:"queued",mode:"mock"}`。
- 删除素材后，其历史版本、分析、任务和运行记录随数据库外键级联删除；已领取任务无法再提交结果。
