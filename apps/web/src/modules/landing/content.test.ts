import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  claim,
  copyRunChars,
  faqs,
  flow,
  principles,
  type StepStatus,
} from "./content";

// 落地页上的开发状态必须与看板一致（docs/design-system.md“落地页”）。
const board = readFileSync(
  new URL("../../../../../.ai/tasks/index.md", import.meta.url),
  "utf8",
);

function boardStatus(task: string) {
  const row = board.split("\n").find((line) => line.startsWith(`| ${task} |`));
  if (!row) throw new Error(`${task} is not on the board`);
  return row.split("|")[3]?.trim() ?? "";
}

function expected(tasks: string[]): StepStatus {
  const states = tasks.map(boardStatus);
  if (states.every((state) => state === "已完成")) return "done";
  if (states.some((state) => state === "已完成" || /进行中|待合并/.test(state)))
    return "in-progress";
  return "not-started";
}

describe("landing content", () => {
  it.each(flow.flatMap((row) => row.steps))(
    "$title matches the task board",
    (step) => {
      expect(step.status).toBe(expected(step.tasks));
    },
  );

  it("leads with evidence from the author's materials and the original staying out", () => {
    expect(claim).toContain("证据只来自你自己的素材");
    expect(claim).toContain("原文不会进你的稿子");
    // 绝对说法无法验证（docs/product.md 第 1 节）。
    const copy = JSON.stringify([claim, principles, faqs]);
    expect(copy).not.toMatch(/一个字都不|一字不/);
  });

  it("states the copy check the worker actually runs", () => {
    const worker = readFileSync(
      new URL("../../../../worker/src/reference-copy.ts", import.meta.url),
      "utf8",
    );
    const chars = /export const COPY_RUN_CHARS = (\d+);/.exec(worker)?.[1];
    expect(Number(chars)).toBe(copyRunChars);
    const principle = principles.find(
      (item) => item.title === "只取结构，不搬文字",
    );
    expect(principle?.body).toContain(`连续 ${copyRunChars} 个字`);
    const answer = faqs.find(
      (faq) => faq.question === "这算不算洗稿？",
    )?.answer;
    expect(answer).toContain("对照原文检查");
    expect(answer).toContain("论据只来自你自己的素材");
  });

  it("answers the questions the landing rules require", () => {
    const questions = faqs.map((faq) => faq.question);
    expect(questions).toContain("这算不算洗稿？");
    expect(questions).toContain("能直接发布吗？");
  });
});
