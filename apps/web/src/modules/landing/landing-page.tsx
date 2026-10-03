import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import {
  APPLY_EMAIL,
  applyHref,
  audiences,
  claim,
  faqs,
  flow,
  phaseNote,
  principles,
  type Step,
  statusLabels,
} from "./content";
import {
  Evidence,
  HeroVisual,
  Item,
  LandingMotion,
  Reveal,
  Stagger,
  SweepHighlight,
} from "./landing-motion";

// 落地页（docs/design-system.md“落地页”，设计稿画框 30 为 1440 宽、31 为 375 宽）。
// 区块上下 96、左右 48（手机 64 / 16）；深色区块只用一次。
const section = "px-12 py-24 max-md:px-4 max-md:py-16";
const inner = "mx-auto flex w-full max-w-workspace";
const eyebrow = "text-label font-semibold text-accent";
const sectionTitle =
  "font-serif text-headline text-ink max-md:text-headline-sm";

function Mark({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex items-center justify-center bg-accent font-serif text-ink-inverse",
        size === "md"
          ? "size-8 rounded-sm text-title-section"
          : "size-6 rounded-xs text-label font-semibold",
      )}
    >
      拆
    </span>
  );
}

function ApplyLink({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <a
      href={applyHref}
      className={buttonVariants({
        size: size === "lg" ? "lg" : "md",
        className: size === "lg" ? "px-6" : undefined,
      })}
    >
      申请试用
    </a>
  );
}

function Nav() {
  return (
    <header className="border-b border-line px-12 max-md:px-4">
      <nav
        aria-label="落地页导航"
        className={cn(inner, "h-18 items-center gap-8 max-md:h-14")}
      >
        <Link
          href="/"
          className="flex items-center gap-3 text-title-card text-ink"
        >
          <Mark />
          拆写
        </Link>
        <div className="flex items-center gap-6 text-body text-ink-2 max-md:hidden">
          <a href="#how" className="hover:text-ink">
            怎么写
          </a>
          <a href="#proof" className="hover:text-ink">
            来源与原则
          </a>
          <a href="#faq" className="hover:text-ink">
            常见问题
          </a>
        </div>
        <div className="flex flex-1 items-center justify-end gap-2">
          <Link
            href="/sign-in"
            className={buttonVariants({
              variant: "ghost",
              className: "max-md:px-0 max-md:text-accent",
            })}
          >
            登录
          </Link>
          <span className="max-md:hidden">
            <ApplyLink />
          </span>
        </div>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section aria-labelledby="hero-title" className={section}>
      <div
        className={cn(
          inner,
          "items-center gap-16 max-xl:flex-col max-xl:items-stretch max-md:gap-8",
        )}
      >
        <Stagger
          onMount
          gap={0.1}
          className="flex w-140 shrink-0 flex-col gap-6 max-xl:w-full max-xl:max-w-140"
        >
          <Item
            as="p"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-line bg-sunken px-3 py-1 text-label font-normal text-ink-2"
          >
            <span aria-hidden className="size-1.5 rounded-full bg-evidence" />
            写给有专业积累的公众号作者 · 邀请制试用准备中
          </Item>
          <h1
            id="hero-title"
            className="font-serif text-display text-ink max-md:text-display-sm"
          >
            {/* 只在两个短语之间换行 */}
            <Item as="span" className="inline-block">
              看懂一篇爆款，
            </Item>
            <Item as="span" className="inline-block">
              写出你自己的那篇。
            </Item>
          </h1>
          <Item as="p" className="text-lead text-ink-2 max-md:text-intro">
            贴入一篇爆款，拆出它的结构与写法，再用你自己的素材按这个结构写。
            {claim}
          </Item>
          <Item className="flex items-center gap-4 max-md:flex-col max-md:items-stretch">
            <ApplyLink size="lg" />
            <Link
              href="/sign-in"
              className="text-body font-medium text-accent max-md:text-center"
            >
              已有账号？登录
            </Link>
          </Item>
          <Item as="p" className="text-label font-normal text-ink-2">
            生成结果会对照参考原文检查；草稿由你在公众号后台检查并发布。
          </Item>
        </Stagger>
        <HeroVisual />
      </div>
    </section>
  );
}

function StepCard({ step }: { step: Step }) {
  return (
    <Item
      as="li"
      className="flex min-w-0 flex-1 flex-col items-start gap-2 rounded-sm border border-line bg-canvas px-4 py-3"
    >
      <span className="text-title-card text-ink">{step.title}</span>
      <StatusPill tone={step.status === "done" ? "done" : "pending"}>
        {statusLabels[step.status]}
      </StatusPill>
    </Item>
  );
}

function How() {
  return (
    <section
      id="how"
      aria-labelledby="how-title"
      className={cn(section, "border-y border-line bg-surface")}
    >
      <div className={cn(inner, "flex-col gap-12 max-md:gap-8")}>
        <Reveal className="flex items-end gap-16 max-lg:flex-col max-lg:items-start max-lg:gap-4">
          <div className="flex w-140 shrink-0 flex-col gap-3 max-lg:w-full">
            <p className={eyebrow}>怎么写</p>
            <h2 id="how-title" className={sectionTitle}>
              两个入口，汇合成你的文章。
            </h2>
          </div>
          <p className="text-intro text-ink-2">
            可以从一篇爆款的结构出发，也可以从你自己的素材出发。两条路都由你一步步确认，模型只在你点击时工作。
          </p>
        </Reveal>
        <div className="flex flex-col gap-6 max-lg:hidden">
          {flow.map((row, rowIndex) => (
            <div key={row.label} className="flex items-center gap-3">
              <Reveal
                as="p"
                delay={rowIndex * 0.2}
                className="w-35 shrink-0 text-label font-semibold text-accent"
              >
                {row.label}
              </Reveal>
              <Stagger
                as="ol"
                delay={rowIndex * 0.2 + 0.1}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                {row.steps.map((step, index) => (
                  <WithArrow key={step.title} arrow={index > 0}>
                    <StepCard step={step} />
                  </WithArrow>
                ))}
              </Stagger>
            </div>
          ))}
        </div>
        <Stagger as="ol" gap={0.05} className="flex flex-col lg:hidden">
          {flow.flatMap((row) =>
            row.steps.map((step) => (
              <Item
                as="li"
                key={step.title}
                className="flex items-center justify-between gap-4 border-b border-line py-3"
              >
                <span className="flex flex-col">
                  <span className="text-meta font-medium text-accent">
                    {row.label}
                  </span>
                  <span className="text-title-card text-ink">{step.title}</span>
                </span>
                <StatusPill tone={step.status === "done" ? "done" : "pending"}>
                  {statusLabels[step.status]}
                </StatusPill>
              </Item>
            )),
          )}
        </Stagger>
        <p className="text-label font-normal text-ink-2">{phaseNote}</p>
      </div>
    </section>
  );
}

function WithArrow({
  arrow,
  children,
}: {
  arrow: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      {arrow && (
        <Item
          as="li"
          aria-hidden
          className="flex w-5 shrink-0 justify-center text-ink-3"
        >
          <ArrowRight className="size-4" />
        </Item>
      )}
      {children}
    </>
  );
}

// 产品画面只展示已完成开发的部分：来源素材与初稿正文；不包含尚未实现的 AI 助手栏。
function Proof() {
  return (
    <section id="proof" aria-labelledby="proof-title" className={section}>
      <div className={cn(inner, "flex-col gap-12 max-md:gap-8")}>
        <Reveal className="flex max-w-180 flex-col gap-3">
          <p className={eyebrow}>来源与原则</p>
          <h2 id="proof-title" className={sectionTitle}>
            证据只来自你的素材。
          </h2>
          <p className="text-intro text-ink-2">
            初稿里的每条论据都对应到你的素材、版本和原文片段，能找到出处；参考文章不能当作证据，没有素材支撑的说法单独列为待补证据。
          </p>
        </Reveal>
        <Reveal
          as="figure"
          delay={0.1}
          aria-label="示意：初稿正文与来源素材"
          className="flex overflow-hidden rounded-md border border-line bg-canvas max-md:flex-col-reverse"
        >
          <div className="flex w-70 shrink-0 flex-col gap-3 border-r border-line p-4 max-md:w-full max-md:border-t max-md:border-r-0">
            <p className="text-meta font-medium text-ink-2">来源 · 2 条素材</p>
            <div className="flex flex-col gap-2 rounded-md border border-line bg-surface p-3">
              <p className="flex items-center justify-between gap-2">
                <span className="text-label font-semibold text-ink">
                  失业后的第一个月
                </span>
                <span className="font-mono text-mono font-normal text-ink-2">
                  v3
                </span>
              </p>
              <p className="font-serif text-copy text-ink-2">
                离职那天，我以为自己会有大把时间写东西……
              </p>
              <SweepHighlight>
                真正拖慢我的不是时间，而是没有一个固定的开始动作。
              </SweepHighlight>
            </div>
            <p className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface p-3">
              <span className="text-label font-semibold text-ink">
                写作的最小可行习惯
              </span>
              <span className="font-mono text-mono font-normal text-ink-2">
                v1
              </span>
            </p>
          </div>
          <div className="flex min-w-0 flex-1 justify-center px-12 py-8 max-md:p-4">
            <div className="flex w-full max-w-paper flex-col gap-4 rounded-md border border-line bg-surface p-12 max-md:p-6">
              <p className="font-serif text-title-article text-ink">
                离职后的写作陷阱：时间多了反而写不出
              </p>
              <p className="flex items-center gap-2 text-meta text-ink-2">
                约 1,640 字 · 初稿由大纲版本 5 生成
                <span className="rounded-full border border-dashed border-ink-3 px-2">
                  模拟
                </span>
              </p>
              <p className="text-editor font-semibold text-ink">
                时间多了，为什么反而写不出来
              </p>
              <p className="text-editor text-ink">
                离职后的第一周，我把写作排进了每天的计划。可到第二周，计划还在，文档却一直是空的。
              </p>
              <p className="text-editor text-ink">
                后来我发现，真正拖慢我的不是时间，而是没有一个固定的开始动作。
                <Evidence>e2</Evidence>
              </p>
              <p className="text-editor font-semibold text-ink">一个开始动作</p>
              <p className="text-editor text-ink">
                我把每天早上的第一件事改成整理前一天的笔记……
              </p>
              <Reveal
                delay={0.9}
                className="flex flex-col gap-1 rounded-sm bg-evidence-soft px-4 py-3 text-body text-evidence-ink"
              >
                <p className="font-semibold">待补证据</p>
                <p>第二周到第三周之间发生了什么改变。</p>
              </Reveal>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Principles() {
  return (
    <section
      aria-labelledby="principles-title"
      className={cn(section, "bg-ink")}
    >
      <div className={cn(inner, "gap-16 max-lg:flex-col max-lg:gap-8")}>
        <Reveal className="flex w-105 shrink-0 flex-col gap-4 max-lg:w-full">
          <h2
            id="principles-title"
            className={cn(sectionTitle, "text-ink-inverse")}
          >
            我们守住的几条线
          </h2>
          <p className="text-intro text-ink-inverse-2">
            像庖丁解牛那样，顺着文章本来的结构拆开；然后用你自己的素材，写出你自己的那篇。工具负责拆解和提示，不替你成为作者。
          </p>
        </Reveal>
        <Stagger as="ol" gap={0.1} className="flex min-w-0 flex-1 flex-col">
          {principles.map((item, index) => (
            <Item
              as="li"
              key={item.title}
              className="flex gap-8 border-b border-line-on-ink py-6 max-md:gap-4 max-md:py-4"
            >
              <span className="font-mono text-body font-medium text-evidence-on-ink">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="flex flex-col gap-2">
                <span className="text-title-page text-ink-inverse max-md:text-title-card">
                  {item.title}
                </span>
                <span className="text-copy text-ink-inverse-2">
                  {item.body}
                </span>
              </span>
            </Item>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

function WhoAndFaq() {
  return (
    <section id="faq" aria-label="写给谁与常见问题" className={section}>
      <div className={cn(inner, "gap-16 max-lg:flex-col max-lg:gap-12")}>
        <Stagger className="flex w-105 shrink-0 flex-col gap-6 max-lg:w-full">
          <Item as="p" className={eyebrow}>
            写给谁
          </Item>
          <Item>
            <h2 className="font-serif text-title-article text-ink max-md:text-headline-sm">
              已经有专业积累，想稳定输出的人。
            </h2>
          </Item>
          <ul className="flex flex-col gap-4">
            {audiences.map((item) => (
              <Item
                as="li"
                key={item.title}
                className="flex flex-col gap-1 border-b border-line pb-4"
              >
                <span className="text-intro font-semibold text-ink">
                  {item.title}
                </span>
                <span className="text-body text-ink-2">{item.body}</span>
              </Item>
            ))}
          </ul>
        </Stagger>
        <Stagger className="flex min-w-0 flex-1 flex-col gap-4">
          <Item>
            <h2 className={eyebrow}>常见问题</h2>
          </Item>
          {faqs.map((faq) => (
            <Item
              as="details"
              key={faq.question}
              open={"open" in faq ? faq.open : undefined}
              className="group rounded-md border border-line bg-surface"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-6 text-intro font-semibold text-ink outline-none focus-visible:outline-2 focus-visible:outline-accent max-md:p-4 [&::-webkit-details-marker]:hidden">
                {faq.question}
                {/* 展开时加号旋转 135° 成为关闭符号；减少动效时直接切换。 */}
                <Plus
                  aria-hidden
                  className="size-4.5 shrink-0 text-ink-2 transition-transform duration-200 ease-standard group-open:rotate-135 motion-reduce:transition-none"
                />
              </summary>
              <p className="px-6 pb-6 text-copy text-ink-2 max-md:px-4 max-md:pb-4">
                {faq.answer}
              </p>
            </Item>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section
      aria-labelledby="apply-title"
      className={cn(section, "border-y border-line bg-sidebar")}
    >
      <Stagger
        gap={0.1}
        className={cn(
          inner,
          "flex-col items-center gap-6 text-center max-md:items-stretch max-md:text-left",
        )}
      >
        <Item>
          <h2
            id="apply-title"
            className="font-serif text-headline-lg text-ink max-md:text-headline-sm"
          >
            下一篇，从拆一篇爆款开始。
          </h2>
        </Item>
        <Item as="p" className="text-intro text-ink-2">
          邀请制试用，名额有限。发邮件告诉我们你常写的主题，开放后我们会联系你。
        </Item>
        <Item className="flex items-center gap-3 max-md:flex-col max-md:items-stretch">
          <ApplyLink size="lg" />
          <span className="text-body text-ink-2 max-md:text-center">
            或直接写信到{" "}
            <span className="font-medium text-ink select-all">
              {APPLY_EMAIL}
            </span>
          </span>
        </Item>
      </Stagger>
    </section>
  );
}

// 隐私说明与使用条款还没有真实页面，按规则不显示；联系方式是申请邮箱。
function Footer() {
  return (
    <footer className="px-12 py-8 max-md:px-4">
      <div
        className={cn(
          inner,
          "items-center gap-6 max-md:flex-col max-md:items-start max-md:gap-3",
        )}
      >
        <span className="flex items-center gap-2 text-label text-ink">
          <Mark size="sm" />
          拆写
        </span>
        <span className="flex-1 max-md:hidden" />
        <a
          href={`mailto:${APPLY_EMAIL}`}
          className="text-label font-normal text-ink-2 hover:text-ink"
        >
          联系我们
        </a>
        <span className="text-label font-normal text-ink-2">© 2026 拆写</span>
      </div>
    </footer>
  );
}

export function LandingPage() {
  return (
    <LandingMotion>
      <Nav />
      <main>
        <Hero />
        <How />
        <Proof />
        <Principles />
        <WhoAndFaq />
        <FinalCta />
      </main>
      <Footer />
    </LandingMotion>
  );
}
