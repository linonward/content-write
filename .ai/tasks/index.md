# Phase 0 开发看板

更新时间：2026-10-02 13:05 CST
已完成：19 / 34（T021 已取消）
待合并：2
阻塞：0
当前任务：T013 ai-edit-selection（待合并，PR #49）；T014 author-preferences（待合并，PR #48）
下一项：界面重构 T033 落地页（需要申请试用邮箱）→ T034 → T035；T031 wechat-draft（需要公众号凭证与固定出口 IP）；T017 已完成，可开始 5 位作者付费意愿验证
真实模型验收：T028 冒烟通过（DeepSeek，整理、选题、大纲、初稿各一次）；T029 拆解 10 篇真实文章评估 10/10 可用（`deepseek-flash`）
线上验收：未开始

| ID | 用户结果 | 状态 | 依赖 | 分支 | worktree | 实现 SHA | 合并 SHA | 证据 |
|---|---|---|---|---|---|---|---|---|
| T001 | 基础工程、数据库、健康页、检查命令、文档、看板、CI 基线 | 已完成 | 无 | chore/T001-bootstrap | 已清理 | 0751508 | 7d669a9 | .ai/verifications/T001.md |
| T002 | 邀请账号登录、退出、保护页面和身份隔离 | 已完成 | T001 | feat/T002-account-access | 已清理 | a0568a5 | e9d5b9c | .ai/verifications/T002.md |
| T003 | 保存、查看、编辑、删除文字素材，版本与权限完整 | 已完成 | T002 | feat/T003-capture-text | 已清理 | ee2dcdc | af5e587 | .ai/verifications/T003.md |
| T004 | 上传 Markdown，解析、限制、持久化和失败反馈 | 已完成 | T003 | feat/T004-import-markdown | 已清理 | 1d95e3e | 59debba | .ai/verifications/T004.md |
| T005 | 保存 URL、安全抓取、失败粘贴正文与开关 | 已完成 | T003 | feat/T005-capture-link | 已清理 | 8d55e7d | 92ee463 | .ai/verifications/T005.md |
| T006 | 处理素材获得摘要、观点和片段；包含任务、worker、轮询、基础配额 | 已完成 | T003、T005 | feat/T006-analyze-material | 已清理 | e12f1d9 | 4eb24a8 | .ai/verifications/T006.md |
| T007 | 搜索、过滤、处理失败重试、删除失效 | 已完成 | T004、T005、T006 | feat/T007-retry-and-find | 已清理 | 6e61e4c | 98ddc74 | .ai/verifications/T007.md |
| T008 | 选择素材生成、收藏、忽略选题并查看来源 | 已完成 | T006 | feat/T008-source-based-ideas | 已清理 | 197d15a | ce1044b | .ai/verifications/T008.md |
| T009 | 创建文章 brief，生成、修改、确认大纲 | 已完成 | T008 | feat/T009-confirm-outline | 已清理 | 678990b | 7db44e9 | .ai/verifications/T009.md |
| T010 | 根据确认大纲生成初稿，来源、缺口、预算和冲突处理 | 已完成 | T009、T027a | feat/T010-generate-draft | 已清理 | 0e4f738 | 16d087a | .ai/verifications/T010.md |
| T011 | Markdown 编辑、自动保存、版本冲突和本地恢复 | 已完成 | T010 | feat/T011-edit-and-save | 已清理 | 1069b64 | ccdfafa | .ai/verifications/T011.md |
| T012 | 查看版本、恢复旧版本并生成新版本 | 已完成 | T011 | feat/T012-restore-revision | 已清理 | 3b46a88 | 9d663d3 | .ai/verifications/T012.md |
| T013 | AI 修改选区、差异预览、应用、拒绝、过期校验 | 待合并 | T011、T012 | feat/T013-ai-edit-selection | content-write-ai-edit-selection | 17e3773、8be6250 | 无 | .ai/verifications/T013.md |
| T014 | 作者画像与表达偏好保存并影响后续生成 | 待合并 | T002、T010 | feat/T014-author-preferences | content-write-author-preferences | 1d34041 | 无 | .ai/verifications/T014.md |
| T015 | 添加、启停、删除历史文章并用于风格示例 | 待开始 | T014 | feat/T015-writing-samples | 未创建 | 无 | 无 | 无 |
| T016 | 候选记忆、确认、修改、禁用、删除和上下文版本 | 待开始 | T015 | feat/T016-confirmed-memory | 未创建 | 无 | 无 | 无 |
| T017 | 手机预览、安全渲染、Markdown 与 HTML 下载 | 已完成 | T011 | feat/T017-preview-export | 已清理 | b0cb9ef | 3d03285 | .ai/verifications/T017.md |
| T018 | 记录手动发布链接、时间和文章版本 | 待开始 | T017 | feat/T018-record-publication | 未创建 | 无 | 无 | 无 |
| T019 | 首页、初次引导、目标、聚合信息和页面响应式（外壳响应式见 T034） | 待开始 | T007、T009、T011、T014、T018 | feat/T019-home-onboarding | 未创建 | 无 | 无 | 无 |
| T020 | 用户反馈、事件、去重、漏斗和隐私配置 | 待开始 | T013、T016、T018、T019 | feat/T020-feedback-and-funnel | 未创建 | 无 | 无 | 无 |
| T021 | 真实模型接入、用量和完整真实生成链路 | 已取消（由 T028 取代） | 无 | 无 | 未创建 | 无 | 无 | .ai/plans/product-direction-2026-10.md |
| T022 | 完整 E2E、安全与故障回归、10 组质量评估 | 待开始 | T020、T028；授权素材 | feat/T022-quality-and-regression | 未创建 | 无 | 无 | 无 |
| T023 | 生产镜像、完整 CI、部署、HTTPS、迁移和备份恢复 | 待开始 | T022；环境授权 | feat/T023-staging-delivery | 未创建 | 无 | 无 | 无 |
| T024 | 试用交付、七天实验、说明和最终验收 | 待开始 | T023 | feat/T024-trial-handoff | 未创建 | 无 | 无 | 无 |
| T025 | Web/API/worker 分离与 Turborepo 编排 | 已完成 | T001、T002 | chore/T025-turborepo-hono | 已清理 | 638fa04 | 8ec3dfc | .ai/verifications/T025.md |
| T026 | 任务额度账本、用量保留、任务类型隔离、API 共享辅助与 worker 失败分类 | 已完成 | T009 | chore/T026-ai-jobs-hardening | 已清理 | 260960e | bf5100c | .ai/verifications/T026.md |
| T027 | API 按 route/service/repository 分层，数据访问收敛到 Drizzle；用户行为不变 | T027a 已完成；b/c 待开始 | T026；T027a 先于 T010 | refactor/T027a-articles-layering | 已清理 | 11180c1 | d6acd92 | .ai/verifications/T027.md |
| T028 | DeepSeek 真实模型接入，现有整理、选题、大纲、初稿真实调用与用量记录 | 已完成 | T026；凭证 | feat/T028-deepseek-provider | 已清理 | a9edb1d | 956bcf9 | .ai/verifications/T028.md |
| T029 | 参考文章与拆解：保存与抓取、拆解任务、`/breakdowns`、删除清除、10 篇质量评估 | 已完成 | T028；新方向设计更新 | feat/T029-reference-breakdown | 已清理 | 3275453 | b1da2f1 | .ai/verifications/T029.md |
| T030 | 按框架写：用框架创建文章、槽位大纲、框架标签、参考文章不作证据 | 已完成 | T029 | feat/T030-framework-outline | 已清理 | 2770895 | eebee96 | .ai/verifications/T030.md |
| T031 | 本人公众号草稿箱：只创建草稿、结果待确认、版本落后提示 | 待开始 | T017；公众号凭证与固定出口 IP | feat/T031-wechat-draft | 未创建 | 无 | 无 | 无 |
| T032 | 设计系统 token、字体与基础组件落地，任意值检查 | 已完成 | 无；与 T013、T014 协调 | feat/T032-design-system | 已清理 | 8593364 | 94e6ecf | .ai/verifications/T032.md |
| T033 | 落地页 `/`：未登录介绍与邮件申请试用，已登录跳转 `/home` | 待开始 | T032；申请邮箱 | feat/T033-landing | 未创建 | 无 | 无 | 无 |
| T034 | 应用外壳：可折叠侧栏、账号菜单、顶栏、底部标签栏 | 待开始 | T032；T014 设置入口迁移 | feat/T034-app-shell | 未创建 | 无 | 无 | 无 |
| T035 | 一级页面重排：首页、拆解、素材箱、选题、文章列表 | 待开始 | T034 | feat/T035-primary-pages | 未创建 | 无 | 无 | 无 |

## 当前阻塞

暂无已确认阻塞。

## 最近更新

- 2026-10-02 12:58 CST（本机时间，早于上一条记录的时间戳）：T013（按创始人决定，T031 等凭证期间先做）12:09 从 `ac27801` 开始，实现 AI 修改选区：迁移 0015 `edit_suggestions`、`article-edits` API 模块、`edit_suggestion` 任务、编辑器旁 AI 修改面板。PR #49 期间主分支先后合并 #47、T032 #50、#51，分支 rebase 到 `ccf1eab`，看板与 `body-editor.tsx` 冲突手工合并，面板改用 T032 设计 token 与组件。rebase 到 T032 后重建空库迁移 0000–0015、完整检查（含设计 token 检查，API 集成 64/64）与 Playwright 16/16 通过；全部 mock。实现提交 `17e3773`，token 适配 `8be6250`。

- 2026-10-02 13:05 CST：PR #50（T032）合并为 `94e6ecf`；主分支独立空库迁移 0000–0014、完整检查（API 集成 57/57）与 Playwright 14/14 通过。验收数据库与 T032 worktree 已清理。T033、T034 可以开始。

- 2026-10-02 12:45 CST：T032 从 `16db048` 实现设计系统 token、Noto Serif SC、基础组件与 token 检查脚本；去掉页面中全部任意值、hex 与 shadcn 别名颜色，原生 select 与文件选择换成组件。完整检查通过（API 集成 57/57），Playwright 14/14（新增素材箱导入与筛选），组件计算样式与设计稿 `01 组件` 数值一致。实现提交 `8593364`，PR #50 待合并。

- 2026-10-02 12:30 CST：新增界面重构任务 T032（设计系统与基础组件）、T033（落地页）、T034（应用外壳）、T035（一级页面），依据 `docs/design-system.md` 与 `docs/design/content-write.pen`；顺序 T032 → T033 → T034 → T035。T019 的外壳响应式移入 T034。文章工作区、预览、登录与账号管理页的重排另立任务。

- 2026-10-02 12:25 CST：T014 从 `ac27801` 实现作者设置（迁移 0016（T013 已占用 0015）、`/api/profile`、任务记录资料版本、提示词加入作者设置与禁用词检查、`/settings/profile` 页面）；按用户要求开始，T015、T016 依赖本任务未并行。独立空库迁移与完整检查通过（API 集成 60/60），Playwright 14/14；DeepSeek 冒烟 4 次通过，修复了带资料时正文改称“素材作者”的问题。等待 PR。

- 2026-10-02 11:50 CST：PR #43（T017）合并为 `3d03285`，主分支独立空库迁移 0000–0013、完整检查（API 集成 50/50）与 Playwright 10/10 通过；PR #44（T030）rebase 后合并为 `eebee96`，主分支独立空库迁移 0000–0014、完整检查（API 集成 55/55）与 Playwright 12/12 通过。两个任务的验证数据库与 worktree 已清理。验收中确认集合路径与预览/导出路径每次请求查询两次会话（结果正确，多一次数据库查询），另行修复。

- 2026-10-02 11:35 CST：T030 从 `2510968` 实现按框架写（迁移 0014、从拆解创建文章、`PUT /api/articles/:id/framework`、槽位大纲与校验、框架标签与对话框），与 T017 按用户要求并行。独立空库迁移与完整检查通过（API 集成 51/51），Playwright 10/10；DeepSeek 冒烟一篇真实热门文章到初稿通过（8 槽位、1 个缺口，初稿与原文最长相同字串 6 字）。等待 PR。

- 2026-10-02 11:30 CST：T017 从 `2510968` 实现手机预览与 Markdown、HTML 导出（经创始人同意与 T030 并行）：API `article-export` 模块与 remark/rehype 安全渲染链、`/articles/:id/preview` 页面；无迁移。独立空库迁移与完整检查通过（API 集成 50/50），Playwright 10/10。等待 PR。

- 2026-10-02 11:05 CST：PR #41 合并为 `b1da2f1`；主分支独立 PostgreSQL 空库迁移 0000–0013、完整检查（API 集成 46/46）与 Playwright 8/8 通过。T029 验证数据库与 worktree 已清理。T030 可以开始。

- 2026-10-02 10:33 CST：T029 从 `015d4fa` 实现参考文章与拆解（迁移 0013、`/api/breakdowns`、`reference_breakdown` 任务、`/breakdowns` 页面与共享主导航）。独立空库迁移与完整检查通过（API 集成 46/46），Playwright 8/8；DeepSeek `deepseek-flash` 对 10 篇公开平台热门文章评估 4 轮，修复标题未发送、缺片段、列表超限与描述引用原文后最终 10/10 可用，未切换 v4-pro。等待 PR。

- 2026-10-02 09:46 CST：PR #37 合并为 `956bcf9`（同时 #38 新方向设计更新合并为 `9d90e56`）；主分支独立 PostgreSQL 空库迁移 0000–0012、完整检查（API 集成 40/40）、Playwright 6/6 与 DeepSeek 真实冒烟通过。验证数据库与 T028 worktree 已清理。T029 可以开始。

- 2026-10-02 01:49 CST：T028 实现提交 `a9edb1d`，创建 PR #37。独立空库迁移 0000–0012、完整检查（API 集成 40/40）与 E2E 6/6 通过；DeepSeek 真实冒烟四类任务全部成功。等待 CI 与评审。

- 2026-10-02 01:30 CST：产品方向调整：增加“从爆款开始”入口（拆解写作框架，用自己的素材写），真实模型改为 DeepSeek（T028 取代 T021），本人公众号草稿箱提前为 T031。执行顺序 T028、T029、T030、T017、T031；T013 到 T016、T018 到 T020、T027b/c 顺延。依据 `.ai/plans/product-direction-2026-10.md`。

- 2026-10-02 00:51 CST：PR #33 合并为 `9d663d3`；主分支独立 PostgreSQL 空库迁移 0000–0011 与完整检查通过，API 集成测试 38/38。验证数据库和 T012 worktree 已清理。T013 可以开始。

- 2026-10-02 00:42 CST：T012 实现历史列表、查看与恢复（迁移 0011 `restored_from`），恢复生成新版本且不删除历史。独立空库迁移与完整检查通过，API 集成测试 38/38，Playwright 流程通过。等待 PR。

- 2026-10-02 00:30 CST：PR #31 合并为 `ccdfafa`；主分支独立 PostgreSQL 空库迁移 0000–0010 与完整检查通过，API 集成测试 37/37。验证数据库和 T011 worktree 已清理。T012 可以开始。

- 2026-10-02 00:12 CST：T011 实现 CodeMirror 正文编辑、1 秒自动保存、版本冲突不覆盖、本机恢复副本与退出清理，以及正文历史表 `article_revisions`（迁移 0010，含旧数据补写）。独立空库迁移与完整检查通过，API 集成测试 37/37，Playwright 四个场景通过。等待 PR。

- 2026-10-01 23:42 CST：PR #28 合并为 `16d087a`；主分支独立 PostgreSQL 空库迁移 0000–0009 与完整检查通过，API 集成测试 34/34。验证数据库和 T010 worktree 已清理。T011 可以开始。

- 2026-10-01 23:38 CST：T010 在 `2b52a9c` 上实现初稿生成：迁移 0009、`draft_generation` 任务、已有正文时保存候选并支持替换和丢弃、页面初稿区块。独立空库迁移 0000–0009 与完整检查通过，API 集成测试 34/34，Playwright 浏览器流程通过；顺带修复 T009 大纲生成成功提示不显示的问题。等待 PR。

- 2026-10-01 23:21 CST：PR #26 合并为 `d6acd92`；主分支独立 PostgreSQL 空库迁移 0000–0008 与完整检查通过，API 集成测试 30/30。验证数据库和 T027a worktree 已清理。T010 可以开始；T027b/c 不阻塞。

- 2026-10-01 22:40 CST：T027a 在 `c4a825c` 上完成 articles 模块分层与 Drizzle 迁移，api 与 worker 共用来源与引用检查；先补错误码集成测试并在旧代码上通过，重构后独立空库迁移与完整检查通过，API 集成测试 30/30。等待 PR。

- 2026-10-01 22:26 CST：PR #23 合并为 `bf5100c`；主分支独立 PostgreSQL 空库迁移 0000–0008 与完整检查通过，API 集成测试 29/29。验证数据库和 T026 worktree 已清理。T027a 可以开始。

- 2026-10-01 22:18 CST：PR #22 合并为 `784db20`：新增 T027（API 分层与 Drizzle 查询收敛），依赖 T026；AGENTS.md 补充分层与数据访问约定，记录 ADR 003。T027a（articles）排在 T010 之前，T027b/c 不阻塞 T010。（此条原记为 22:40，系估计时间，按合并时间更正。）

- 2026-10-01 22:18 CST：T026 实现提交 `260960e`，创建 PR #23；独立空库迁移、旧数据回填与完整检查通过，等待 CI 与评审。

- 2026-10-01 22:15 CST：T026 从已集成的 T009 主分支建立独立 worktree，在 T010 前修复删除素材回退每日额度、选题任务混入素材整理状态、非整理任务重试错误与 worker 吞错；收敛 API 共享辅助与入队逻辑。

- 2026-10-01 22:03 CST：PR #20 合并为 `7db44e9`；主分支独立 PostgreSQL 空库迁移 0000–0007 与完整检查通过，API 集成测试 26/26。验证数据库和 T009 worktree 已清理。

- 2026-10-01 21:11 CST：T009 提交 `678990b`，创建 PR #20，等待 CI 与评审；主分支集成验收尚未开始。

- 2026-10-01 21:08 CST：T009 在已集成的 T008 主分支上实现文章 brief、持久大纲任务、编辑和确认；独立空库迁移、完整检查与 Playwright 浏览器流程通过。删除素材时同步清理依赖文章；验证服务和数据库已停止并清理，准备提交 PR。

- 2026-10-01 19:11 CST：PR #18 合并为 `ce1044b`；主分支独立 PostgreSQL 空库迁移与完整检查通过，API 集成测试 22/22。验证数据库和 T008 worktree 已清理。

- 2026-10-01 19:04 CST：T008 从已集成的主分支建立独立 worktree，完成持久选题任务、来源关系与 `/ideas` 页面。独立 PostgreSQL 空库迁移、完整检查和 Playwright 本地流程通过；实现提交 `197d15a`，PR #18 两项 CI 通过，待评审。

- 2026-10-01 18:02 CST：PR #16 合并为 `98ddc74`；主分支独立 PostgreSQL 空库迁移与完整检查通过，API 集成测试 18/18。验证数据库和 T007 worktree 已清理。

- 2026-10-01 17:41 CST：T007 从已集成的主分支创建独立 worktree，完成搜索、过滤、失败重试与删除失效验证；独立空库迁移和完整检查通过。实现提交 `6e61e4c`，PR #16 两项 CI 通过，待评审与合并后集成验收。

- 2026-10-01 16:47 CST：T006 在独立 worktree 实现持久任务、worker、素材整理界面和真实 PostgreSQL 集成测试；T005 由另一 worktree 并行推进。
- 2026-10-01 16:49 CST：T006 空库迁移与完整检查通过，提交 `e12f1d9` 并创建 PR #12；等待评审与并行 T005 的集成顺序。

- 2026-10-01 13:44 CST：启动 T001，计划在平级 worktree 实现基础工程。
- 2026-10-01 13:53 CST：T001 已合并并完成主分支检查；记录 `next typegen` 和数据库健康等待修正。

- 2026-10-01 14:41 CST：T002 从已合并的 `origin/main` 启动，worktree 为 `content-write-account-access`。
- 2026-10-01 14:56 CST：T002 本地验证通过，准备通过 PR 合并；T003 等待合并和集成验收。

- 2026-10-01 15:07 CST：T002 PR #4 已合并但集成验收尚未记录；T025 基于新主分支解决冲突，迁移认证 API 到 Hono。

- 2026-10-01 15:26 CST：PR #5 已合并，主分支空库迁移、全套检查与真实 HTTP 验收通过；T025 worktree 已清理。T002 尚需独立完成验收记录。
- 2026-10-01 15:35 CST：T002 在 T025 合并后的主分支基线上复验迁移和完整检查，身份集成测试通过；记录完成。
- 2026-10-01 15:36 CST：T002 收尾 PR #7 合并并清理 worktree；从最新主分支创建 T003 独立 worktree。
- 2026-10-01 15:43 CST：T003 本地实现与独立数据库验收通过，准备提交 PR。
- 2026-10-01 15:44 CST：T003 实现提交 `ee2dcdc`，创建 PR #8。
- 2026-10-01 15:50 CST：T003 PR #8 已合并，主分支空库迁移和完整检查通过；完成集成验收并清理 worktree。
- 2026-10-01 15:52 CST：T003 收尾 PR #9 合并；从最新主分支创建 T004 独立 worktree。
- 2026-10-01 15:58 CST：T004 文件导入、限制和来源记录通过独立 PostgreSQL 与真实 HTTP 验证，准备提交 PR。
- 2026-10-01 15:59 CST：T004 实现提交 `ef09907`，创建 PR #10。

- 2026-10-01 16:31 CST：T004 PR #10 已合并；主分支独立 PostgreSQL 空库迁移和完整检查通过，任务 worktree 已清理。

- 2026-10-01 16:48 CST：T005 与 T006 从已合并的主分支并行开发；T005 链接保存、安全抓取与真实数据库检查通过，准备提交 PR。

- 2026-10-01 16:50 CST：T005 实现提交 `8d55e7d`，创建 PR #13。

- 2026-10-01 16:59 CST：T005 PR #13 合并；主分支独立 PostgreSQL 空库迁移和完整检查通过，任务 worktree 已清理。T006 PR #12 待更新主分支、处理迁移编号冲突后合并。

- 2026-10-01 17:08 CST：T006 PR #12 两项 CI 通过并合入；主分支独立空库迁移 0000–0005、完整检查通过，T006 worktree 与本地分支已清理。
