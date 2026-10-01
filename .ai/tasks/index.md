# Phase 0 开发看板

更新时间：2026-10-01 14:56 CST
已完成：1 / 24
待合并：1
阻塞：0
当前任务：T002 account-access（待合并）
下一项：T003 capture-text（待 T002 合并）
真实模型验收：未开始
线上验收：未开始

| ID | 用户结果 | 状态 | 依赖 | 分支 | worktree | 实现 SHA | 合并 SHA | 证据 |
|---|---|---|---|---|---|---|---|---|
| T001 | 基础工程、数据库、健康页、检查命令、文档、看板、CI 基线 | 已完成 | 无 | chore/T001-bootstrap | 已清理 | 0751508 | 7d669a9 | .ai/verifications/T001.md |
| T002 | 邀请账号登录、退出、保护页面和身份隔离 | 待合并 | T001 | feat/T002-account-access | ../content-write-account-access | 见 PR | 无 | .ai/verifications/T002.md |
| T003 | 保存、查看、编辑、删除文字素材，版本与权限完整 | 待开始 | T002 | feat/T003-capture-text | 未创建 | 无 | 无 | 无 |
| T004 | 上传 Markdown，解析、限制、持久化和失败反馈 | 待开始 | T003 | feat/T004-import-markdown | 未创建 | 无 | 无 | 无 |
| T005 | 保存 URL、安全抓取、失败粘贴正文与开关 | 待开始 | T003 | feat/T005-capture-link | 未创建 | 无 | 无 | 无 |
| T006 | 处理素材获得摘要、观点和片段；包含任务、worker、轮询、基础配额 | 待开始 | T003 | feat/T006-analyze-material | 未创建 | 无 | 无 | 无 |
| T007 | 搜索、过滤、处理失败重试、删除失效 | 待开始 | T004、T005、T006 | feat/T007-retry-and-find | 未创建 | 无 | 无 | 无 |
| T008 | 选择素材生成、收藏、忽略选题并查看来源 | 待开始 | T006 | feat/T008-source-based-ideas | 未创建 | 无 | 无 | 无 |
| T009 | 创建文章 brief，生成、修改、确认大纲 | 待开始 | T008 | feat/T009-confirm-outline | 未创建 | 无 | 无 | 无 |
| T010 | 根据确认大纲生成初稿，来源、缺口、预算和冲突处理 | 待开始 | T009 | feat/T010-generate-draft | 未创建 | 无 | 无 | 无 |
| T011 | Markdown 编辑、自动保存、版本冲突和本地恢复 | 待开始 | T010 | feat/T011-edit-and-save | 未创建 | 无 | 无 | 无 |
| T012 | 查看版本、恢复旧版本并生成新版本 | 待开始 | T011 | feat/T012-restore-revision | 未创建 | 无 | 无 | 无 |
| T013 | AI 修改选区、差异预览、应用、拒绝、过期校验 | 待开始 | T011、T012 | feat/T013-ai-edit-selection | 未创建 | 无 | 无 | 无 |
| T014 | 作者画像与表达偏好保存并影响后续生成 | 待开始 | T002、T010 | feat/T014-author-preferences | 未创建 | 无 | 无 | 无 |
| T015 | 添加、启停、删除历史文章并用于风格示例 | 待开始 | T014 | feat/T015-writing-samples | 未创建 | 无 | 无 | 无 |
| T016 | 候选记忆、确认、修改、禁用、删除和上下文版本 | 待开始 | T015 | feat/T016-confirmed-memory | 未创建 | 无 | 无 | 无 |
| T017 | 手机预览、安全渲染、Markdown 与 HTML 下载 | 待开始 | T011 | feat/T017-preview-export | 未创建 | 无 | 无 | 无 |
| T018 | 记录手动发布链接、时间和文章版本 | 待开始 | T017 | feat/T018-record-publication | 未创建 | 无 | 无 | 无 |
| T019 | 首页、初次引导、目标、聚合信息和响应式布局 | 待开始 | T007、T009、T011、T014、T018 | feat/T019-home-onboarding | 未创建 | 无 | 无 | 无 |
| T020 | 用户反馈、事件、去重、漏斗和隐私配置 | 待开始 | T013、T016、T018、T019 | feat/T020-feedback-and-funnel | 未创建 | 无 | 无 | 无 |
| T021 | 真实模型接入、用量和完整真实生成链路 | 待开始 | T013、T016、T017；凭证 | feat/T021-real-provider | 未创建 | 无 | 无 | 无 |
| T022 | 完整 E2E、安全与故障回归、10 组质量评估 | 待开始 | T020、T021；授权素材 | feat/T022-quality-and-regression | 未创建 | 无 | 无 | 无 |
| T023 | 生产镜像、完整 CI、部署、HTTPS、迁移和备份恢复 | 待开始 | T022；环境授权 | feat/T023-staging-delivery | 未创建 | 无 | 无 | 无 |
| T024 | 试用交付、七天实验、说明和最终验收 | 待开始 | T023 | feat/T024-trial-handoff | 未创建 | 无 | 无 | 无 |

## 当前阻塞

暂无已确认阻塞。

## 最近更新

- 2026-10-01 13:44 CST：启动 T001，计划在平级 worktree 实现基础工程。
- 2026-10-01 13:53 CST：T001 已合并并完成主分支检查；记录 `next typegen` 和数据库健康等待修正。

- 2026-10-01 14:41 CST：T002 从已合并的 `origin/main` 启动，worktree 为 `content-write-account-access`。
- 2026-10-01 14:56 CST：T002 本地验证通过，准备通过 PR 合并；T003 等待合并和集成验收。
