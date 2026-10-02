// 页面级共享类名，只引用设计 token（docs/design-system.md）。
// 应用外壳（T034）落地后，页面标题移入顶栏，pageIntro 一组随之替换。
export const ui = {
  shell:
    "mx-auto min-h-screen w-full max-w-workspace px-8 pt-8 pb-16 max-md:px-4 max-md:pt-6",
  wideShell:
    "mx-auto min-h-screen w-full max-w-workspace px-8 pt-8 pb-16 max-md:px-4 max-md:pt-6",
  narrowShell:
    "mx-auto min-h-screen w-full max-w-form px-8 pt-8 pb-16 max-md:px-4 max-md:pt-6",
  header: "flex items-center gap-3 text-title-card",
  brand: "inline-flex items-center gap-3 no-underline",
  mark: "inline-flex size-8 items-center justify-center rounded-sm bg-accent font-serif text-title-section text-ink-inverse",
  stage: "text-label text-accent",
  pageIntro: "flex flex-col gap-2 pt-12 pb-8 max-md:pt-8",
  pageTitle: "font-serif text-title-article text-ink",
  heroTitle: "font-serif text-title-article text-ink",
  formTitle: "font-serif text-title-article text-ink",
  lead: "max-w-reading text-body text-ink-2",
  formIntro: "flex flex-col gap-2 pt-16 pb-8 max-md:pt-12",
  textLink: "text-label text-accent underline underline-offset-3",
} as const;
