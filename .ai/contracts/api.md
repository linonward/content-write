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

T010 新增：

- `POST /api/articles/:id/draft/generate`：携带 `expectedVersion` 和 `Idempotency-Key`，返回 202 `{jobId,status:"queued",mode:"mock"}`。只能从已确认的大纲生成，否则 422 `OUTLINE_NOT_CONFIRMED`；同键同输入返回同一任务，不同输入 409 `IDEMPOTENCY_CONFLICT`（幂等先于版本检查）；版本冲突 409，同文章已有进行中的初稿任务 409 `DRAFT_JOB_ACTIVE`，缺来源 422，配额/并发 429，模型不可用 503。输入摘要绑定文章基础版本、来源素材版本和生成选项（目标 1,200～2,000 中文字）。
- worker 提交初稿时：大纲在任务创建后被修改或重新确认、或来源失效 → 任务 `stale`，结果不保存。文章仍为基础版本且没有正文 → 直接成为正文（版本加一）；否则保存为候选，不改动正文。同一任务只保存一份结果。
- `GET /api/articles/:id` 增加 `title`、`body`、`currentDraft`（`id`、`sourceMap`、`evidenceGaps`、`mode`、`createdAt`）、`candidates`（最近 10 份候选，含标题、Markdown、来源映射和待补证据）以及 `latestDraftJob`。
- `POST /api/articles/:id/drafts/:draftId/apply`：携带 `expectedVersion`，用候选替换正文，版本加一；版本冲突 409，候选已应用或已丢弃 409 `DRAFT_NOT_CANDIDATE`，跨用户或不存在 404 `DRAFT_NOT_FOUND`。
- `POST /api/articles/:id/drafts/:draftId/discard`：丢弃候选，返回 204，不改动文章；非候选 409，跨用户 404。
- `GET /api/jobs/:id` 的 `kind` 增加 `draft_generation`；初稿任务不能通过 `/api/jobs/:id/retry` 重试，由文章页重新生成。
- 删除素材时，引用它的文章连同初稿与候选一起删除。

T011 新增：

- `PUT /api/articles/:id/body`：携带 `expectedVersion`、`title`（去除首尾空格后 1～200 字）、`body`（Markdown，最多 50,000 字符），返回 `{version}`。需要会话与可信 Origin，跨用户 404。按版本条件原子更新，成功版本加一，同一事务写入 `article_revisions`（`source: "edit"`）。版本冲突 409 `ARTICLE_VERSION_CONFLICT`，不覆盖正文；正文过长 413 `ARTICLE_BODY_TOO_LARGE`；标题无效 422 `INVALID_ARTICLE_BODY`。标题和正文都与当前一致时不改版本、不写历史，直接返回当前版本。
- 初稿直接成为正文、应用候选时，同一事务写入 `source: "draft"` 历史。迁移 0010 为已有正文的文章补写当前版本的历史。查看与恢复历史在 T012。

T012 新增：

- `GET /api/articles/:id/revisions`：本人文章最近 50 条正文历史，版本倒序，含 `version`、`source`（`edit` / `draft` / `restore`）、`title`、`restoredFrom`、`chars`（正文字符数）、`createdAt`，不含正文。跨用户或不存在 404。
- `GET /api/articles/:id/revisions/:version`：单个历史版本，含标题和正文；不存在或跨用户 404 `REVISION_NOT_FOUND`（文章不属于本人时也返回 404）。
- `POST /api/articles/:id/restore`：携带 `expectedVersion` 与 `revision`，需可信 Origin。把该版本的标题和正文作为新版本保存，版本加一，同一事务写入 `source: "restore"`、`restoredFrom` 的历史；已有历史不修改不删除。版本冲突 409，不存在的历史版本 404，与当前正文一致时返回当前版本不写历史。迁移 0011 为 `article_revisions` 增加 `restored_from`。

T028 新增：

- `GET /api/ai/settings`：返回 `{mode, provider, consentRequired}`；`mode` 为 `mock`、`deepseek` 或 null（未配置或缺少 Key）。
- `POST /api/ai/consent`：需会话与可信 Origin，记录本人对当前模型服务的确认并返回最新设置；无需确认的模式返回 409。
- 生成类接口（`/api/materials/:id/process`、`/api/jobs/:id/retry`、`/api/ideas/generate`、`/api/articles/:id/outline/generate`、`/api/articles/:id/draft/generate`）在 DeepSeek 模式且本人未确认时返回 428 `AI_CONSENT_REQUIRED`。
- 202 响应的 `mode`、可用性字段旁的 `aiMode`，以及选题、初稿结果的 `mode` 反映实际生成模式（`mock` 或 `deepseek`）。

T029 新增（参考文章与拆解；全部需要会话，写操作需可信 Origin，跨用户与不存在均 404 `REFERENCE_NOT_FOUND`）：

- `GET /api/breakdowns`：本人最近 100 篇参考文章（`hasMore` 表示更多），含 `id`、`title`、`sourceUrl`、`fetchStatus`、`currentVersion`、`contentLength`、`status`（当前版本的 `unprocessed` / `processing` / `failed` / `done`）、时间，不含正文。
- `POST /api/breakdowns`：二选一。粘贴正文 `{content, title?}`（标题留空取正文第一行，正文最多 50,000 字，超出 413 `REFERENCE_TOO_LARGE`）；或链接 `{url, fetch?}`，地址规则与抓取开关、每小时 10 次限流同 T005（`INVALID_LINK` 422、`LINK_FETCH_LIMIT` 429），抓取关闭或失败仍保存链接，正文为空，返回的 `fetchStatus` 为 `disabled` 或 `failed`。成功 201 `{id}`。
- `GET /api/breakdowns/:id`：`reference`（含正文与 `status`）、当前版本的 `breakdown`（`referenceVersion`、`result`、`mode`、`createdAt`）、当前版本最近的 `latestJob`、`processingAvailable`、`aiMode`。
- `PATCH /api/breakdowns/:id`：`{expectedVersion, title, content}` 保存新版本并写 `reference_article_revisions`，链接来源的 `fetchStatus` 变为 `manual`；返回 `{version}`。版本冲突 409 `REFERENCE_VERSION_CONFLICT`。旧拆解仍绑定旧版本，当前版本需重新拆解。
- `DELETE /api/breakdowns/:id`：204。原文、修订、拆解结果与该文章的拆解任务一并删除（外键级联）；`ai_runs` 保留用量，`job_id` 置空。
- `POST /api/breakdowns/:id/process`：Idempotency-Key 与 `{expectedVersion}`，DeepSeek 模式需确认（428）。202 `{jobId, status, mode}`，用 `/api/jobs/:id` 轮询，计入每日额度与并发。同键同输入返回同任务，同键不同版本 409 `IDEMPOTENCY_CONFLICT`；版本不是当前 409 `REFERENCE_VERSION_CONFLICT`；正文为空 422 `REFERENCE_CONTENT_REQUIRED`；当前版本已有结果 409 `ALREADY_BROKEN_DOWN`；已有进行中任务 409 `BREAKDOWN_JOB_ACTIVE`；额度 429，未配置 503。失败任务通过再次调用本接口重新拆解（`/api/jobs/:id/retry` 仍只用于素材整理）。

T037 调整（链接抓取质量，接口不变）：`fetchStatus=fetched` 只在提取到可用正文时出现；错误页、验证页、需要 JavaScript 的空壳和不足 200 字的正文均记为 `failed`，正文为空。

T017 新增（预览与导出；只读，需要会话，跨用户与不存在均 404 `ARTICLE_NOT_FOUND`，没有标题或正文 422 `ARTICLE_BODY_REQUIRED`）：

- `GET /api/articles/:id/preview`：`{articleId, version, title, html, fileName, updatedAt, renderedAt}`。`html` 是正文经 remark/rehype 渲染并清理后的片段（CommonMark；原始 HTML 丢弃；无脚本、事件属性、iframe、`<img>`；链接只保留绝对 http(s)/mailto 并带 `rel="noopener noreferrer nofollow"`；图片变为 `[图片：alt]` 文字或链接，不自动加载）。`fileName` 为清理后的文件名主体。`Cache-Control: no-store`。
- `GET /api/articles/:id/export?format=markdown|html`：附件下载。`markdown` 为 `text/markdown; charset=utf-8`，内容是 `# 标题` 加作者原文；`html` 为 `text/html; charset=utf-8` 的独立文档，正文片段与预览相同，带 `default-src 'none'` 的 CSP。`Content-Disposition: attachment; filename="article-v<版本>.<md|html>"; filename*=UTF-8''<标题>.<md|html>`，另有 `nosniff`、`sandbox` CSP 与 `no-store`。缺少或其他格式 422 `INVALID_EXPORT_FORMAT`。
- 只读取本人 `articles`；参考文章（`reference_articles`）不会出现在预览或导出中。

T030 新增（按框架写）：

- `POST /api/articles` 增加第二种输入：`{breakdownId, materials: [{id, version}], brief: {workingTitle, audience, thesis}}`，素材 1～10 条且不重复。拆解必须属于本人（否则 404 `BREAKDOWN_NOT_FOUND`）；每条素材必须属于本人、仍是给定版本且该版本已整理（否则 409 `MATERIALS_NOT_READY`，参考文章 ID 同样被拒）。成功 201 `{articleId}`，文章 `ideaId` 为空，绑定拆解并保存框架快照。原有 `{ideaId}` 输入不变；两种都不符合时 422 `INVALID_ARTICLE_SOURCE`（原 `INVALID_IDEA`）。
- `PUT /api/articles/:id/framework`：`{expectedVersion, breakdownId | null}` 绑定或取消框架，版本加一，同时清除大纲与确认状态（大纲是按旧结构写的）。拆解不属于本人 404，版本冲突 409。
- `GET /api/articles/:id` 增加 `breakdownId`、`referenceArticleId`（参考文章删除后为 null）与 `framework`（快照：`name`、`titlePattern`、`hook`、`slots[{id,name,purpose,technique}]`、`rhythm`、`ending`；不含原文、片段与参考文章的目标读者）。
- 大纲小节增加可选 `slotId`。`PUT /api/articles/:id/outline` 校验：`slotId` 必须属于绑定框架且不重复，未绑定框架时不能出现，否则 422 `INVALID_SLOTS`；作者可以删除、增加或调整小节顺序。证据只接受文章自己素材的 `素材id:片段id`，参考文章及其片段 ID 返回 422 `INVALID_EVIDENCE`。
- `GET /api/breakdowns` 列表每项增加 `breakdownId`（当前版本已拆解时）。
- 参考文章删除后，文章的 `breakdownId` 置空、框架快照保留，仍可按快照生成大纲。

T013 新增（AI 修改选区；全部需要会话，写操作需可信 Origin，跨用户与不存在均 404）：

- `POST /api/articles/:id/edit`：`Idempotency-Key` 与 `{expectedVersion, scope: "selection"|"full", start, end, selectionText, instruction}`，DeepSeek 模式需确认（428）。202 `{jobId, status, mode}`，用 `/api/jobs/:id` 轮询（`kind: "edit_suggestion"`），计入每日额度与并发。偏移按 UTF-16；服务端以当前正文 `body.slice(start,end)` 记录选区原文，与 `selectionText` 不一致或越界 409 `SELECTION_MISMATCH`；全文范围必须是 `0..正文长度`，否则 422 `INVALID_EDIT_SCOPE`；选区超过 8,000 字符 413 `SELECTION_TOO_LARGE`；只有空白、`end <= start`、修改要求不是 1～500 字 422 `INVALID_EDIT_REQUEST`；没有正文 422 `ARTICLE_BODY_REQUIRED`；版本冲突 409；同文章已有进行中的修改任务 409 `EDIT_JOB_ACTIVE`；同键同输入返回同任务，不同输入 409 `IDEMPOTENCY_CONFLICT`（幂等先于版本检查）；额度 429，未配置 503。
- `GET /api/articles/:id/suggestions`：`{suggestions, latestJob, generationAvailable, aiMode}`。`suggestions` 为最近 10 条待处理建议（`id`、`scope`、`baseVersion`、`start`、`end`、`selectionText`、`instruction`、`replacement`、`explanation`、`evidenceGaps`、`mode`、`createdAt`、`stale`）；`stale` 表示文章已不在基础版本或选区原文已变，不能应用。
- `POST /api/articles/:id/suggestions/:sid/apply`：`{expectedVersion}`。用建议替换记录的选区，版本加一，同事务写入 `source: "ai_edit"` 的历史；返回 `{version}`。重复应用返回首次生成的版本、不再改动；已拒绝 409 `SUGGESTION_CLOSED`；生成中 409 `SUGGESTION_NOT_READY`；过期 409 `SUGGESTION_STALE`；`expectedVersion` 不是当前版本 409 `ARTICLE_VERSION_CONFLICT`；替换后正文超过 50,000 字符 413 `ARTICLE_BODY_TOO_LARGE`；跨用户或不存在 404 `SUGGESTION_NOT_FOUND`。
- `POST /api/articles/:id/suggestions/:sid/reject`：204，不改动文章；重复拒绝 204，已应用 409 `SUGGESTION_CLOSED`。
- `GET /api/articles/:id/revisions` 的 `source` 增加 `ai_edit`。删除素材时，引用它的文章连同修改建议一起删除。

T014 新增（作者设置）：

- `GET /api/profile`：本人资料 `{bio, topics, audience, preferences, bannedWords, version, updatedAt}`；没有保存过时为空值与 `version: 0`。
- `PUT /api/profile`：需可信 Origin。`{expectedVersion, bio, topics, audience, preferences, bannedWords}`；简介与表达偏好最多 1000 字，目标读者最多 200 字，写作主题最多 10 个（每个 30 字内），禁用词最多 50 个（每个 20 字内）；列表去空格、去空项、去重。`expectedVersion: 0` 表示首次创建。成功返回 `{version}`，同时写入该版本快照；版本不是当前 409 `PROFILE_VERSION_CONFLICT`，输入无效 422 `INVALID_PROFILE`，超过 32 KB 413。
- 选题、大纲、初稿任务记录排队时的资料版本（`ai_jobs.profile_version`，没有资料为 null）；有资料时资料版本计入幂等输入，资料变化后同一 Idempotency-Key 返回 409。

T018 新增（记录手动发布；需要会话，写操作需可信 Origin，跨用户与不存在均 404）：

- `GET /api/articles/:id/publish-records`：`{articleVersion, hasBody, records}`，`records` 按发布时间倒序，最多 100 条，每条含 `id`、`url`、`publishedAt`、`articleVersion`、`createdAt`。文章不属于本人 404 `ARTICLE_NOT_FOUND`。
- `POST /api/articles/:id/publish-records`：`{expectedVersion, url, publishedAt}`，201 `{record}`，记录绑定文章当前版本，不改动文章。`url` 为去除首尾空格后的绝对 http(s) 地址，不含账号密码，最长 2,000 字符；服务器不访问该链接。`publishedAt` 为带时区的 ISO 时间，不得晚于服务器当前时间 10 分钟以上。输入不合法 422 `INVALID_PUBLISH_RECORD`；文章没有正文 422 `ARTICLE_BODY_REQUIRED`；`expectedVersion` 不是当前版本 409 `ARTICLE_VERSION_CONFLICT`；同一文章已有同一链接 409 `PUBLISH_RECORD_EXISTS`。
- `DELETE /api/articles/:id/publish-records/:recordId`：204，只删除记录；不存在或不属于本人 404 `PUBLISH_RECORD_NOT_FOUND`。
- 记录状态只表示“用户标记已发布”，不代表平台确认。删除文章（包括删除来源素材导致的文章删除）时记录一并删除。

2026-10-02 规划（尚未实现，接口在对应任务完成后才算可用）：

- T031：`POST /api/articles/:id/wechat-draft`（携带 `expectedVersion` 与 Idempotency-Key，只创建草稿）、`GET /api/articles/:id/wechat-draft`（推送记录与确认状态）；未配置公众号返回 503。

## 作者历史文章（T015）

- `GET /api/writing-samples` → `{ samples: [{ id, title, content, enabled, version, createdAt }] }`，仅本人，按添加时间倒序。
- `POST /api/writing-samples` `{ title, content }` → 201 `{ sample }`，默认启用；标题 1–200 字，正文 1–20000 字，trim 后非空；最多 20 篇（包括禁用），并发创建串行校验。
- `PATCH /api/writing-samples/:id` `{ expectedVersion, enabled }` → `{ sample }`；状态改变版本 +1，同状态不增版；旧版本 409 `SAMPLE_VERSION_CONFLICT`。
- `DELETE /api/writing-samples/:id` → 204，物理删除正文；不影响已有文章结果。
- 所有接口要求会话，写操作检查 Origin；其他用户或不存在的 ID 均 404 `SAMPLE_NOT_FOUND`；数量超限 409 `SAMPLE_LIMIT`，字段超限/未知字段 422 `INVALID_SAMPLE`，无效 JSON 400，请求过大 413。

## 确认记忆（T016）

- `GET /api/memories` → `{ memories: [{ id, content, status, origin, evidence, mode, jobId, version, createdAt, updatedAt }], latestJob: { id, status, errorCode, updatedAt } | null, extraction: { available, mode } }`，仅本人，按添加时间倒序。`status` 为 `candidate` / `confirmed` / `disabled`；`origin` 为 `manual` / `extracted`；`evidence` 为 `[{ sampleId, sampleVersion, sampleTitle, quote, start, end }]`（引用片段的副本，样本修改或删除后仍可查看）。
- `POST /api/memories` `{ content }` → 201，返回同 GET 的列表；手动记忆直接为 `confirmed`；1–200 字，trim 后非空。每位作者最多 50 条（含候选与禁用），并发创建串行校验，超限 409 `MEMORY_LIMIT`。
- `PATCH /api/memories/:id` `{ expectedVersion, content }` 或 `{ expectedVersion, status: "confirmed" | "disabled" }` → 200 列表；改变即版本 +1，相同值不增版；旧版本 409 `MEMORY_VERSION_CONFLICT`。同时给出 `content` 与 `status`、`status: "candidate"` 或未知字段均 422 `INVALID_MEMORY`。
- `DELETE /api/memories/:id` → 204，物理删除。
- `POST /api/memories/extract`（`Idempotency-Key`，需模型同意）→ 202 `{ jobId, status: "queued", mode }`，任务 `memory_extraction`。没有启用的历史文章 422 `SAMPLES_REQUIRED`；已有 50 条 409 `MEMORY_LIMIT`；已有进行中的提取 409 `MEMORY_JOB_ACTIVE`；同键不同输入 409 `IDEMPOTENCY_CONFLICT`；每日/并发 429；未配置模型 503 `AI_NOT_CONFIGURED`；未同意 428。任务状态用 `GET /api/jobs/:id` 轮询，候选通过 `GET /api/memories` 读取（`jobId` 指向产生它的任务）。
- 所有接口要求会话，写操作检查 Origin；其他用户或不存在的 ID 均 404 `MEMORY_NOT_FOUND`；无效 JSON 400，请求过大（>4 KB）413。
- 选题、大纲、初稿与 AI 修改入队时按添加时间降序选最多 20 条 `confirmed` 记忆，ID/版本写入 `ai_jobs.memories` 并纳入输入 hash；没有已确认记忆时 hash 形状不变。

## 参考原文复制检查（T038）

- 没有新增接口。文章绑定了拆解（`breakdownId` 不为空）时，`outline_generation`、`draft_generation`、`edit_suggestion` 任务的结果在 worker 提交前对照该拆解版本的参考文章原文检查（规则见 `.ai/contracts/ai.md`）。
- 修复一次后仍带出原文，任务 `failed`，`GET /api/jobs/:id` 与各页面的 `latestJob.errorCode` 为 `REFERENCE_COPIED`；大纲、初稿候选与修改建议都不写入，文章版本不变。任务不自动重试，作者在文章页重新生成。
- 页面对 `REFERENCE_COPIED` 显示专门的原因说明；其他失败码沿用原提示。
