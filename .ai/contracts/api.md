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
- 删除素材后，其历史版本、分析和任务随数据库外键级联删除；已领取任务无法再提交结果。模型运行记录自 T026 起保留（见下）。

T008 新增：

- `GET /api/ideas/materials`：列出本人当前版本已有分析的素材，最多 100 条并附 `hasMore` 与 `generationAvailable`。无分析或旧版本分析的素材不在选择列表。
- `POST /api/ideas/generate`：请求体 `{sources:[{id,version}]}`，选择 1～10 条不同的本人当前已整理素材，需可信 Origin 与 `Idempotency-Key`。同键同输入返回同一 jobId，不同输入 409；来源版本变化 409，未整理 422，跨用户或不存在 404，配额/并发超额 429，模型不可用 503。成功返回 202 `{jobId,status:"queued",mode:"mock"}`。输入摘要绑定排序后的全部素材版本。
- `GET /api/ideas`：返回本人最近 100 条选题及其来源素材版本、摘要，并附最近一个选题生成任务状态。`GET /api/jobs/:id` 可轮询本人生成任务。
- `PATCH /api/ideas/:id`：请求体 `{status:"new"|"saved"|"ignored"}`；只修改本人选题，需可信 Origin；其他用户返回 404。
- 素材删除会清理引用该素材的选题及其生成任务。素材编辑后，未完成生成任务在 worker 提交前失效；已生成选题继续标明原来源版本。

T009 新增：

- `POST /api/articles`：请求体 `{ideaId}`，从本人选题创建文章 brief，并绑定当时来源版本；同一选题重复创建返回同一文章。来源版本过期返回 409，跨用户或不存在返回 404。
- `GET /api/articles`、`GET /api/articles/:id`：只返回本人文章；详情包含 brief、版本、大纲、确认时间、来源版本及片段、最近生成任务，以及 `generationAvailable`。
- `PATCH /api/articles/:id/brief`：携带 `expectedVersion`、`workingTitle`、`audience`、`thesis`；成功版本加一并清除大纲与确认。版本冲突 409。
- `POST /api/articles/:id/outline/generate`：携带 `expectedVersion` 和 `Idempotency-Key`，返回 202 `{jobId,status:"queued",mode:"mock"}`。同键同输入返回同一任务；版本或幂等冲突 409，缺来源 422，配额/并发 429，模型不可用 503。任务复用 `/api/jobs/:id` 与持久 worker。
- `PUT /api/articles/:id/outline`：携带 `expectedVersion` 和完整结构化 `outline`；校验标题、读者、主张、2～10 节，以及 `materialId:evidenceId` 是否属于文章绑定的来源片段。成功版本加一并撤销确认。
- `POST /api/articles/:id/outline/confirm`：携带 `expectedVersion`；只允许确认完整且来源仍存在的大纲，成功版本加一并记录确认时间。无大纲或来源不完整返回 422。
- 所有写请求校验会话与可信 Origin，跨用户读取和修改返回 404。文章来源保留创建时的素材版本；原素材修改不自动替换它。删除素材会同步删除引用它的文章、大纲任务及选题，避免保留已删除来源的派生文字。

T026 调整：

- `GET /api/jobs/:id` 增加 `kind`（`material_analysis`、`idea_generation`、`outline_generation`）。只有素材整理任务返回 `materialId`、`materialVersion` 和 `analysis`，其他类型为 null。
- `POST /api/jobs/:id/retry` 只接受失败的素材整理任务；选题和大纲任务返回 409 `JOB_NOT_RETRYABLE`，由各自页面重新生成。
- `GET /api/materials/:id/analysis` 与素材列表的处理状态只反映素材整理任务，不受以该素材为来源的选题或大纲任务影响。
- 每日逻辑生成额度记入独立账本，按 Asia/Shanghai 自然日累计；删除素材、选题或文章不回退额度。模型运行记录在任务删除后保留，`job_id` 置空，仍随用户删除。
- 统一错误中 `retryable`：500、503 与 `AI_CONCURRENCY_LIMIT` 为 true；每日额度和其余 4xx 为 false。
