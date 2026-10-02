"use client";

import {
  MotionConfig,
  motion,
  useReducedMotion,
  type Variants,
} from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// 落地页动效：入场只动 opacity 与 transform，曲线同 --ease-standard，每个元素只播一次。
// 减少动效时 MotionConfig 去掉位移与布局动画，首屏示意直接显示最终状态。
const ease = [0.2, 0, 0, 1] as const;
const rise: Variants = {
  hidden: { opacity: 0, y: 16 },
  shown: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease, delay },
  }),
};
const inView = { once: true, amount: 0.2 } as const;

const tags = {
  div: motion.div,
  p: motion.p,
  span: motion.span,
  ol: motion.ol,
  ul: motion.ul,
  li: motion.li,
  figure: motion.figure,
  details: motion.details,
} as const;
type Tag = keyof typeof tags;
type MotionProps = {
  as?: Tag;
  className?: string;
  children?: ReactNode;
  "aria-hidden"?: boolean;
  open?: boolean;
};

export function LandingMotion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** 进入视口时上浮淡入；`onMount` 用于首屏，挂载即播放。 */
export function Reveal({
  as = "div",
  delay = 0,
  onMount,
  ...props
}: MotionProps & { delay?: number; onMount?: boolean }) {
  const Component = tags[as];
  return (
    <Component
      {...props}
      custom={delay}
      variants={rise}
      initial="hidden"
      {...(onMount
        ? { animate: "shown" }
        : { whileInView: "shown", viewport: inView })}
    />
  );
}

/** 子元素（Item）按顺序错峰入场。 */
export function Stagger({
  as = "div",
  gap = 0.08,
  delay = 0,
  onMount,
  ...props
}: MotionProps & { gap?: number; delay?: number; onMount?: boolean }) {
  const Component = tags[as];
  return (
    <Component
      {...props}
      variants={{
        hidden: {},
        shown: { transition: { staggerChildren: gap, delayChildren: delay } },
      }}
      initial="hidden"
      {...(onMount
        ? { animate: "shown" }
        : { whileInView: "shown", viewport: inView })}
    />
  );
}

export function Item({ as = "div", ...props }: MotionProps) {
  const Component = tags[as];
  return <Component {...props} variants={rise} />;
}

/** 示意用的证据标记，不可交互；下划线入场时从左画出。`shown` 不传时进入视口即画。 */
export function Evidence({
  shown,
  children,
}: {
  shown?: boolean;
  children: ReactNode;
}) {
  return (
    <span className="shrink-0 px-1 font-mono text-mono text-ink">
      <span className="relative inline-block py-0.5">
        {children}
        <motion.span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-px origin-left bg-evidence"
          initial={{ scaleX: 0 }}
          transition={{
            duration: 0.5,
            ease,
            delay: shown === undefined ? 0.6 : 0,
          }}
          {...(shown === undefined
            ? { whileInView: { scaleX: 1 }, viewport: inView }
            : { animate: { scaleX: shown ? 1 : 0 } })}
        />
      </span>
    </span>
  );
}

/** 来源片段：进入视口时赭黄底色像荧光笔一样从左扫过。 */
export function SweepHighlight({ children }: { children: ReactNode }) {
  return (
    <p className="relative px-1 font-serif text-copy text-ink">
      <motion.span
        aria-hidden
        className="absolute inset-0 origin-left border-b-2 border-evidence bg-evidence-soft"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={inView}
        transition={{ duration: 0.7, ease, delay: 0.3 }}
      />
      <span className="relative">{children}</span>
    </p>
  );
}

function SlotTag({
  highlighted,
  children,
}: {
  highlighted?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 translate-y-0.5 items-center rounded-xs px-2 font-mono text-mono font-semibold transition-colors duration-200 ease-standard",
        highlighted
          ? "bg-evidence text-ink-inverse"
          : "bg-accent-soft text-accent",
      )}
    >
      {children}
    </span>
  );
}

const slots = [
  "反常识开头",
  "代价浮现",
  "明白的第一件事",
  "明白的第二件事",
  "留白提问",
];
// 0 未开始，1 写槽位 1，2 写槽位 2，3 标出证据（最终状态，与静态设计稿一致）。
const schedule = [900, 1900, 2600];

// 首屏配图：只显示爆款的结构（槽位名），不显示其原文；稿子的论据来自作者自己的素材。
// 入场时高亮从槽位 1 滑到槽位 2，稿子随之逐段写出，最后画出证据标记。
export function HeroVisual() {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (reduced) {
      setStep(3);
      return;
    }
    const timers = schedule.map((at, index) =>
      setTimeout(() => setStep(index + 1), at),
    );
    return () => timers.forEach(clearTimeout);
  }, [reduced]);
  const active = step >= 2 ? 1 : 0;
  const written = (at: number) => (step >= at ? "shown" : "hidden");
  return (
    <motion.figure
      aria-label="示意：爆款的结构对应到你的稿子"
      className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-line bg-surface max-xl:w-full"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease, delay: 0.35 }}
    >
      <div className="flex h-10 items-center gap-2 border-b border-line bg-sunken px-4">
        {[0, 1, 2].map((dot) => (
          <span key={dot} aria-hidden className="size-2 rounded-full bg-line" />
        ))}
        <span className="text-meta text-ink-2">爆款的结构 → 你的稿子</span>
      </div>
      <div className="flex max-sm:flex-col">
        <ol className="flex w-62.5 shrink-0 flex-col gap-2 border-r border-line bg-sunken p-6 max-sm:hidden">
          <li className="text-meta font-medium text-ink-2">爆款的结构</li>
          {slots.map((slot, index) => {
            const current = step >= 1 && index === active;
            return (
              <li
                key={slot}
                className={cn(
                  "relative flex items-center gap-2 rounded-xs p-2 text-body text-ink",
                  current && "font-semibold",
                )}
              >
                {current && (
                  <motion.span
                    layoutId="hero-slot"
                    aria-hidden
                    className="absolute inset-0 rounded-xs bg-evidence-soft"
                    transition={{ duration: 0.45, ease }}
                  />
                )}
                <span
                  className={cn(
                    "relative inline-flex size-5 items-center justify-center rounded-full border font-mono text-mono transition-colors duration-200 ease-standard",
                    current
                      ? "border-evidence bg-evidence text-ink-inverse"
                      : "border-line bg-surface text-ink-2",
                  )}
                >
                  {index + 1}
                </span>
                <span className="relative">{slot}</span>
              </li>
            );
          })}
        </ol>
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-6 max-sm:p-4">
          <p className="text-meta font-medium text-ink-2">
            你的稿子
            <span className="sm:hidden"> · 槽位 2：代价浮现</span>
          </p>
          <p className="font-serif text-title-page text-ink">
            离职后的写作陷阱
          </p>
          <motion.p
            className="flex items-start gap-2 text-copy text-ink max-sm:hidden"
            variants={rise}
            initial="hidden"
            animate={written(1)}
          >
            <SlotTag highlighted={step === 1}>槽位 1</SlotTag>
            离职第一周，我把写作排进了计划。
          </motion.p>
          <motion.p
            className="relative flex items-start gap-2 p-1 text-copy text-ink"
            variants={rise}
            initial="hidden"
            animate={written(2)}
          >
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-xs bg-evidence-soft"
              initial={{ opacity: 0 }}
              animate={{ opacity: step >= 2 ? 1 : 0 }}
              transition={{ duration: 0.4, ease, delay: 0.2 }}
            />
            <span className="relative">
              <SlotTag highlighted={step >= 2}>槽位 2</SlotTag>
            </span>
            <span className="relative min-w-0 flex-1">
              到第二周，计划还在，文档却一直是空的。
            </span>
            <span className="relative">
              <Evidence shown={step >= 3}>e1</Evidence>
            </span>
          </motion.p>
          <motion.figcaption
            className="text-meta text-ink-2"
            variants={rise}
            initial="hidden"
            animate={written(3)}
          >
            论据来自你的素材「失业后的第一个月」，不是那篇爆款。
          </motion.figcaption>
        </div>
      </div>
    </motion.figure>
  );
}
