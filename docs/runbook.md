# 运行手册

## 本地启动

需要 Node.js 24、pnpm 12 和 Docker。复制 `.env.example` 为 `.env.local`，按需要修改数据库、Web 和 API 地址，并将 `BETTER_AUTH_SECRET` 换成至少 32 字符的随机值（例如用 `openssl rand -base64 48` 生成）。

```bash
pnpm install --frozen-lockfile
docker compose up -d --wait
pnpm db:migrate
pnpm auth:create-admin
pnpm dev
```

`pnpm dev` 通过 Turborepo 启动 Web（3000）和 API（3001）。另一个终端运行 `pnpm worker:dev`。素材整理需要常驻 worker：API 持久化任务并返回 202，worker 从 PostgreSQL 领取任务，页面轮询本人任务。`AI_MODE=mock` 使用确定性来源摘录，仅用于开发验证；`AI_MODE=deepseek` 调用 DeepSeek 真实模型（见下文“真实模型”）。其他取值或缺少 Key 时生成接口返回 503，不会伪称已完成真实分析。

## 真实模型（DeepSeek）

在 `.env.local` 设置，API 与 worker 都要读到相同值：

```dotenv
AI_MODE=deepseek
AI_API_KEY=你的 DeepSeek Key
AI_MODEL=deepseek-flash
AI_REQUEST_TIMEOUT_MS=120000
```

- 接口为 DeepSeek 官方 OpenAI 格式 `https://api.deepseek.com`（`AI_BASE_URL` 仅用于测试替换）；`AI_MODEL` 可改为 `deepseek-v4-pro`。`AI_PROVIDER` 暂不使用。
- 思考模式按任务类型设置（`apps/worker/src/ai/config.ts`）：整理、选题、大纲为低强度思考，初稿关闭思考；`max_tokens` 已包含思考预算。
- 空正文、截断或结构不合法会加大预算修复 1 次；网络错误、超时、429 与 5xx 最多重试 2 次；401、402、其他 4xx 与二次结构失败直接失败。worker 日志只记录任务 ID、类型、尝试次数与错误类别。
- 每位作者第一次使用真实模型前，页面显示“素材会发送给 DeepSeek”的提示，确认后才允许生成；未确认时生成接口返回 428 `AI_CONSENT_REQUIRED`。
- `ai_runs` 记录输入、输出、思考 token 与耗时；未配置价格，费用为 null。
- CI 与集成测试始终使用 mock。真实冒烟测试会实际调用 DeepSeek 并产生少量费用：`AI_API_KEY=… pnpm --filter @content-write/api smoke:deepseek`（需要独立数据库与 `DATABASE_URL`）。
- 拆解质量评估：把参考文章正文放在仓库外的目录（他人作品，不提交），写 `index.json`（`[{file, title}]`），停止常驻 worker 后运行 `BREAKDOWN_EVAL_DIR=/tmp/t029-refs BREAKDOWN_EVAL_OUT=/tmp/t029-eval pnpm --filter @content-write/api eval:breakdown`。每篇的结果、用量与失败写入 `BREAKDOWN_EVAL_OUT/<模型>.json` 供人工评审；`AI_MODEL=deepseek-v4-pro` 可切换模型复评。
- 按框架写冒烟：参考文章正文与标题放在仓库外的目录（`reference.txt`、`title.txt`），停止常驻 worker 后运行 `FRAMEWORK_SMOKE_DIR=/tmp/t030-smoke pnpm --filter @content-write/api smoke:framework`：真实调用素材整理 2 次、拆解、按框架大纲与初稿各 1 次，输出用量、槽位大纲与初稿和参考文章的最长相同字串。

## 浏览器端到端测试

E2E 位于 `e2e/` 工作区包，使用 Playwright 在桌面与手机（Pixel 7）视口运行。首次运行先安装浏览器：

```bash
pnpm --filter @content-write/e2e exec playwright install chromium
pnpm test:e2e
```

配置读取根目录 `.env.local`，shell 中已设置的变量优先。`E2E_BASE_URL` 指定 Web 地址（默认 `http://localhost:3000`），API 地址取 `NEXT_PUBLIC_API_URL`。本地已有 Web 和 API 在对应端口运行时直接复用，否则由 Playwright 启动；CI 中总是启动新进程。每次运行在 `DATABASE_URL` 指向的数据库中创建一个随机邮箱和随机密码的受邀用户，结束后删除，不使用固定测试密码。登录接口按 IP 限流（每分钟 5 次），一分钟内反复运行可能触发 429。建议在独立数据库上运行，例如为 worktree 单独启动 Compose 项目并设置 `E2E_BASE_URL`、`NEXT_PUBLIC_API_URL`、`API_PORT`、`WEB_ORIGIN` 与 `BETTER_AUTH_URL`。

`AI_DAILY_JOB_LIMIT` 默认每用户每日 20 个逻辑任务（按 Asia/Shanghai 自然日），`AI_USER_CONCURRENCY` 默认每用户同时 2 个任务。任务截止时间 5 分钟，租约 30 秒；失败或租约失效最多尝试 3 次。素材箱支持搜索标题、正文和来源链接，按类型、当前处理状态与完整标签过滤。失败的素材整理任务可从素材详情重试；重试创建新逻辑任务，仍受每日和并发限制。每日额度记入独立账本，删除素材不会回退。删除素材会级联清理历史、分析与任务；模型运行记录（无正文）保留用于用量统计。worker 将未配置模型等不可恢复错误直接标记失败，日志只记录任务 ID、类型、尝试次数和错误类别。生产环境必须设置 `WEB_ORIGIN`，否则 API 拒绝启动。

作者可从首页或素材箱进入 `/ideas`，选择 1～10 条当前版本已整理素材，主动生成 3 个选题，并查看来源、证据缺口，收藏或忽略。选题任务复用 PostgreSQL 持久队列和 worker；页面刷新后恢复轮询。素材删除会清理依赖该素材的选题和任务。

从选题创建文章后，进入 `/articles/:id` 编辑工作标题、目标读者和核心观点，再主动生成或手写大纲。大纲可编辑小节、要点、来源片段与证据缺口；保存后作者确认。修改 brief 会清除大纲和确认，修改大纲会撤销确认。所有写入携带文章版本，冲突返回 409；生成任务绑定文章版本及素材版本，worker 提交前复核。`/articles` 列出最近 100 篇文章。生成模式由 `AI_MODE` 决定，见下文“真实模型”。删除素材会一并清理引用它的选题、文章和大纲任务，避免已删除来源的文字留在大纲中；界面在删除前提示此影响。

文章有正文后，文章页的“预览”进入 `/articles/:id/preview`：约 375px 手机宽度预览，可下载 Markdown（作者原文）和 HTML（独立文档）。预览与 HTML 导出由 API 用同一条 remark/rehype 渲染链生成：Markdown 中的原始 HTML 被丢弃，脚本、事件属性、iframe 和不安全链接被移除，图片只显示为 `[图片：说明]` 文字或链接，不会自动加载远程图片，发布到公众号时需在后台重新插图。参考文章不会进入预览或导出。

Web 只负责页面和会话页面渲染，不提供 API 路由。浏览器直接请求 `NEXT_PUBLIC_API_URL` 指向的 Hono API；Web 服务端用 `API_INTERNAL_URL` 查询当前会话。API 使用 `WEB_ORIGIN` 限制浏览器跨域来源，`BETTER_AUTH_URL` 指向 API 地址。部署时分别配置这些地址，并确保认证 cookie 在 Web 与 API 域名之间可用。`GET /api/healthz` 检查 API 进程，`GET /api/readyz` 检查数据库连接；数据库不可用时后者返回 503。

单独启动：`pnpm web:dev`、`pnpm api:dev`、`pnpm worker:dev`。生产运行 Web 用 `pnpm --filter @content-write/web start`，API 和 worker 分别用对应包的 `start` 脚本。数据库迁移由 `packages/db` 执行，不在 Web 启动时自动执行。

首次运行用 `pnpm auth:create-admin` 交互式创建管理员。管理员在 `/sign-in` 登录后，从工作台进入 `/admin/users` 创建受邀账号，并通过可信渠道交付初始密码。当前没有邀请邮件、密码重置邮件或自助注册。忘记密码由管理员在受控流程中处理；不要将初始密码写入仓库或日志。`pnpm auth:check` 可检查认证表结构与配置是否匹配。

工作台页面要求登录，普通用户访问管理员页面返回 404。`GET /api/me` 只返回当前会话的身份，未登录返回 401。认证写入请求须来自 `WEB_ORIGIN`。登录入口按数据库记录限流。

## 数据与恢复

本地数据库保存在 Docker volume 中。生产部署、备份和恢复流程在 T023 实现并验证；现在不应把本地 volume 当成备份。

## 安全与凭证

`.env.local` 不入库。公开注册在认证配置中关闭；远程抓取默认关闭。真实模型调用尚未接入。
