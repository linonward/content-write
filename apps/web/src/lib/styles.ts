export const ui = {
  shell:
    "mx-auto min-h-screen max-w-[1020px] px-10 pt-[42px] pb-[70px] max-[680px]:px-[22px] max-[680px]:pt-6 max-[680px]:pb-[50px]",
  narrowShell:
    "mx-auto min-h-screen max-w-[660px] px-10 pt-[42px] pb-[70px] max-[680px]:px-[22px] max-[680px]:pt-6 max-[680px]:pb-[50px]",
  header: "flex items-center gap-3.5 text-[15px] font-bold tracking-[0.03em]",
  brand: "inline-flex items-center gap-3.5 no-underline",
  mark: "inline-flex size-9 items-center justify-center rounded-[10px] bg-[#174a42] text-[19px] text-white",
  stage: "mb-6 text-sm font-bold text-[#51776d]",
  heroTitle: "text-[clamp(38px,6vw,66px)] leading-[1.18] tracking-[-0.04em]",
  formTitle: "text-[clamp(34px,5vw,50px)] leading-[1.18] tracking-[-0.04em]",
  lead: "mt-7 max-w-[570px] text-lg leading-[1.8] text-[#66716c] max-[680px]:text-base",
  formIntro: "pt-[90px] pb-[42px] max-[680px]:pt-[70px]",
  form: "grid gap-2.5",
  label: "mt-3 text-sm font-bold",
  input:
    "min-h-12 w-full rounded-lg border border-[#a9b9ad] bg-white px-3.5 py-3 text-base text-[#192321] focus-visible:border-[#174a42] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#a6c8b8]",
  textarea:
    "w-full resize-y rounded-lg border border-[#a9b9ad] bg-white px-3.5 py-3 text-base leading-[1.7] text-[#192321] focus-visible:border-[#174a42] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#a6c8b8]",
  primaryButton:
    "min-h-12 rounded-lg bg-[#174a42] px-[18px] py-3 text-[15px] font-bold text-white hover:bg-[#0f3c35] focus-visible:bg-[#0f3c35] disabled:cursor-wait disabled:opacity-65",
  outlineLink:
    "inline-block rounded-lg border border-[#9eaea5] px-[17px] py-3 text-sm font-bold no-underline hover:bg-[#e6eee8] focus-visible:bg-[#e6eee8] focus-visible:outline-none",
  error:
    "mt-2.5 rounded-[7px] bg-[#f8e9e5] px-3.5 py-3 text-sm leading-[1.6] text-[#8c2f23]",
  success:
    "mt-2.5 rounded-[7px] bg-[#e3efe5] px-3.5 py-3 text-sm leading-[1.6] text-[#22513a]",
  note: "mt-2.5 text-[13px] leading-[1.7] text-[#66716c]",
  panel: "min-h-[330px] rounded-xl border border-[#c8d0ca] bg-white p-6",
  panelHead: "flex items-center justify-between gap-3",
  muted: "text-sm text-[#66716c]",
  listButton:
    "grid w-full cursor-pointer gap-1.5 px-2 py-3.5 text-left hover:bg-[#eaf1eb]",
} as const;
