// 落地页文案与开发状态（docs/design-system.md“落地页”一节，设计稿画框 30、31）。
// 流程状态必须与 .ai/tasks/index.md 一致，由 content.test.ts 校验；看板变化时同步这里。

export const APPLY_EMAIL = "linonward@gmail.com";

// 申请表单需要后端接口与反滥用，上线前用邮件申请（落地页“上线前待办”）。
export const applyHref = `mailto:${APPLY_EMAIL}?subject=${encodeURIComponent(
  "申请试用拆写",
)}&body=${encodeURIComponent("你好，我想申请试用拆写。\n\n我常写的主题：\n我的公众号（可选）：\n")}`;

export type StepStatus = "done" | "in-progress" | "not-started";

export const statusLabels: Record<StepStatus, string> = {
  done: "已完成开发",
  "in-progress": "开发中",
  "not-started": "尚未开始",
};

export type Step = { title: string; tasks: string[]; status: StepStatus };

export const flow: { label: string; steps: Step[] }[] = [
  {
    label: "从爆款开始",
    steps: [
      { title: "拆解写作框架", tasks: ["T029"], status: "done" },
      { title: "选你自己的素材", tasks: ["T030"], status: "done" },
    ],
  },
  {
    label: "从素材开始",
    steps: [
      {
        title: "保存与整理素材",
        tasks: ["T003", "T004", "T005", "T006", "T007"],
        status: "done",
      },
      { title: "生成选题", tasks: ["T008"], status: "done" },
    ],
  },
  {
    label: "汇合之后",
    steps: [
      { title: "确认大纲", tasks: ["T009"], status: "done" },
      { title: "生成初稿", tasks: ["T010"], status: "done" },
      { title: "编辑与版本", tasks: ["T011", "T012"], status: "done" },
      { title: "预览导出", tasks: ["T017"], status: "done" },
      { title: "推送草稿箱", tasks: ["T031"], status: "not-started" },
    ],
  },
];

export const phaseNote =
  "当前处于 Phase 0，尚未开放试用：开发与演示使用模拟数据，真实模型（DeepSeek）已接入并在内部验证。推送草稿箱尚未开发，现在可以导出 Markdown 与 HTML，再到公众号后台排版发布。";

export const principles = [
  {
    title: "不替你编",
    body: "不捏造数字、引用、链接或个人经历。缺少证据时明确标出，假设的案例会注明是假设。",
  },
  {
    title: "只取结构，不搬文字",
    body: "拆解只提取爆款的结构与写法；原文仅你可见，不会进入你的大纲、初稿或导出。",
  },
  {
    title: "进草稿箱，由你发布",
    body: "每一步由你触发和确认；推送只创建草稿并标注 AI 辅助生成，发布永远由你在公众号后台完成。",
  },
  {
    title: "你决定何时发送",
    body: "素材只在你点击整理或生成时发送给配置的模型服务；首次使用前会明确告知。",
  },
  {
    title: "删除就是删除",
    body: "删除素材后，它不会再进入任何检索或生成；引用它的选题和文章一并删除。",
  },
] as const;

export const audiences = [
  { title: "程序员", body: "把踩过的坑和读过的文档写成别人能用的经验。" },
  { title: "产品经理", body: "把会议记录和用户访谈整理成有观点的复盘。" },
  { title: "独立开发者", body: "把做产品的过程变成持续的公开记录。" },
  {
    title: "知识型创作者",
    body: "收藏很多却不知道写什么时，从已有素材找方向。",
  },
] as const;

// 与 docs/product.md 第 2、9.3 节及第 1 节平台规范保持一致。
export const faqs = [
  {
    question: "它会替我写完一整篇吗？",
    answer:
      "会写出初稿：按你确认的大纲，用你自己的素材。证据不足的地方会标出来，修改和取舍由你完成。",
    open: true,
  },
  {
    question: "这算不算洗稿？",
    answer:
      "不算。拆解只提取结构与写法，原文不会进入你的稿子；论据只来自你自己的素材，并标注出处。平台禁止的是脱离真实创作者的改写、拼接和搬运。",
    open: true,
  },
  {
    question: "我的素材会发给谁？",
    answer:
      "素材只保存在你的账号下，其他人看不到。只有在你点击整理、生成选题、大纲、初稿或拆解时，相关内容才会发送给配置的模型服务（目前为 DeepSeek）；第一次真实生成前会先告诉你会发送什么。",
  },
  {
    question: "能直接发布吗？",
    answer:
      "不能，也不打算做。推送草稿箱只会创建草稿并标注 AI 辅助生成，发布由你在公众号后台完成；这项功能尚未开发，现在可以导出 Markdown 或 HTML 后粘贴到公众号编辑器。",
  },
  {
    question: "支持哪些素材？",
    answer:
      "文字、Markdown 或纯文本文件（UTF-8，单个文件不超过 1 MiB，正文不超过 50,000 字）以及网页链接；链接抓取不到正文时可以粘贴正文。暂不支持 PDF、截图识别和语音。",
  },
  {
    question: "怎么开始用？",
    answer: `目前是邀请制。发邮件到 ${APPLY_EMAIL}，说说你常写的主题；开放试用后我们会为你创建账号，用邮箱和密码登录。`,
  },
] as const;
