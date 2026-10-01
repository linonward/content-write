export const ui = {
  shell:
    "mx-auto min-h-screen max-w-[1020px] px-10 pt-[42px] pb-[70px] max-[680px]:px-[22px] max-[680px]:pt-6 max-[680px]:pb-[50px]",
  narrowShell:
    "mx-auto min-h-screen max-w-[660px] px-10 pt-[42px] pb-[70px] max-[680px]:px-[22px] max-[680px]:pt-6 max-[680px]:pb-[50px]",
  header: "flex items-center gap-3.5 text-[15px] font-bold tracking-[0.03em]",
  brand: "inline-flex items-center gap-3.5 no-underline",
  mark: "inline-flex size-9 items-center justify-center rounded-[10px] bg-primary text-[19px] text-white",
  stage: "mb-6 text-sm font-bold text-primary",
  heroTitle: "text-[clamp(38px,6vw,66px)] leading-[1.18] tracking-[-0.04em]",
  formTitle: "text-[clamp(34px,5vw,50px)] leading-[1.18] tracking-[-0.04em]",
  lead: "mt-7 max-w-[570px] text-lg leading-[1.8] text-muted-foreground max-[680px]:text-base",
  formIntro: "pt-[90px] pb-[42px] max-[680px]:pt-[70px]",
} as const;
