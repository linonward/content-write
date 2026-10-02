import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { faqs, flow, type StepStatus } from "./content";

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

  it("answers the questions the landing rules require", () => {
    const questions = faqs.map((faq) => faq.question);
    expect(questions).toContain("这算不算洗稿？");
    expect(questions).toContain("能直接发布吗？");
  });
});
