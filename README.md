# 拆写

看懂一篇爆款，写出你自己的那篇。拆出爆款的结构与写法，再用你自己的素材写：证据只来自你自己的素材，参考文章只留下结构，原文不会进你的稿子。仓库与包名保持 `content-write`。

Phase 0 开发中。工程采用 pnpm workspace + Turborepo：`apps/web` 仅提供 Next.js 页面，`apps/api` 提供独立的模块化 Hono API，`apps/worker` 独立运行后台任务，`packages/db` 仅供服务端使用。受邀账号登录、文字、Markdown 与链接素材保存、编辑、搜索、过滤、删除，素材整理、失败重试、基于素材的选题、大纲确认、初稿生成、Markdown 编辑与版本恢复已实现；生成可使用确定性 mock 或 DeepSeek 真实模型（见运行手册）。爆款拆解与草稿箱等后续流程仍在开发。

## 本地运行

需要 Node.js 24、pnpm 12、Docker。详见 [运行手册](docs/runbook.md)。

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
docker compose up -d --wait
pnpm db:migrate
pnpm auth:create-admin
pnpm dev
```

将 `BETTER_AUTH_SECRET` 改为至少 32 字符的随机值。Web 位于 `http://localhost:3000`，API 位于 `http://localhost:3001`；Web 不提供 `/api/*` 路由。打开 `/sign-in` 登录，再由管理员在 `/admin/users` 创建受邀账号。独立 worker 使用 `pnpm worker:dev` 启动。

## 检查

`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:integration`、`pnpm test:e2e`、`pnpm build`。E2E 首次运行前安装浏览器：`pnpm --filter @content-write/e2e exec playwright install chromium`。

需求与任务表见 [产品指南](docs/product.md) 和 [.ai/tasks/index.md](.ai/tasks/index.md)。

### 作者历史文章（T015）

在账号菜单 → 作者设置的“历史文章”中粘贴本人文章标题和正文，可查看全文、启用/禁用和删除。最多 20 篇，标题 200 字、正文 20000 字；启用样本用于选题、大纲、初稿和 AI 修改的风格参考，不作为事实依据。每次最多最近添加的 3 篇、每篇开头 2000 字。本次要求与作者设置优先。禁用/删除后尚未执行的任务不再读取正文，已发送的模型请求和已有结果保留。重新启用会产生新版本，旧任务不读新版本。历史文章不会自动生成记忆，需要在“记忆”中主动提取。

### 确认记忆（T016）

在作者设置的“记忆”中，可以点击“从历史文章提取候选”（使用最近添加的 3 篇启用文章，每篇开头 2000 字），逐条查看候选对应的原文证据，确认、修改或删除；也可以手写一条记忆，手写的直接为已确认。只有已确认的记忆用于选题、大纲、初稿和 AI 修改，每次最多最近添加的 20 条；禁用、修改或删除后尚未执行的任务不再读取旧版本，已发送的请求和已有结果保留。每位作者最多 50 条（含候选与禁用），每条 200 字。本次写作要求与大纲优先，记忆不作事实依据。mock 模式下的候选标注“模拟”。
