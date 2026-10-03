import type { Executor } from "@content-write/db/client";
import {
  articles,
  breakdowns,
  referenceArticleRevisions,
} from "@content-write/db/schema";
import { and, eq } from "drizzle-orm";
import type { ParseResult } from "./ai/deepseek";

/** The original a framework came from. Title and body are compared separately. */
export type ReferenceText = { title: string; content: string };

/** Job error code when generated text still carries the original after the one repair. */
export const REFERENCE_COPIED = "REFERENCE_COPIED";

/**
 * Generated text, and the descriptions a breakdown keeps, may not share a run
 * this long with the reference original. Counted in units, whitespace ignored.
 * Chosen on the T029 articles: see `.ai/verifications/T038.md`.
 */
export const COPY_RUN_CHARS = 12;

const LATIN = /^[A-Za-z0-9]/;

/**
 * Comparison units: one per character, except that a run of Latin letters or
 * digits counts once. A product name or a number both texts mention is then
 * one or two units, not a dozen characters of "copying".
 */
function units(value: string) {
  return value.match(/[A-Za-z0-9]+|[^\sA-Za-z0-9]/gu) ?? [];
}

/** Every run of `length` units in the text, keyed for lookup. */
function* runsOf(tokens: string[], length: number) {
  for (let at = 0; at + length <= tokens.length; at++)
    yield tokens.slice(at, at + length);
}

const key = (run: string[]) => run.join("\u0000");

/** The run as text, with spaces only between Latin words. */
function readable(run: string[]) {
  return run
    .map((unit, index) =>
      index > 0 && LATIN.test(unit) && LATIN.test(run[index - 1])
        ? ` ${unit}`
        : unit,
    )
    .join("");
}

/**
 * First run of `length` units that one of the texts shares with one of the
 * originals. Each text is checked on its own so adjacent fields cannot form a
 * false run. Runs already present in `allowed` do not count.
 */
export function sharedRun(
  originals: string[],
  texts: string[],
  length: number,
  allowed: string[] = [],
) {
  const keysOf = (values: string[]) => {
    const keys = new Set<string>();
    for (const value of values)
      for (const run of runsOf(units(value), length)) keys.add(key(run));
    return keys;
  };
  const copied = keysOf(originals);
  const kept = keysOf(allowed);
  for (const text of texts)
    for (const run of runsOf(units(text), length)) {
      const id = key(run);
      if (copied.has(id) && !kept.has(id)) return readable(run);
    }
  return null;
}

/**
 * The run generated text copies from the reference, or null. `allowed` is text
 * the author already had (the selection being edited): the model keeping it is
 * not the model bringing the original in.
 */
export function copiedRun(
  reference: ReferenceText,
  texts: string[],
  allowed: string[] = [],
) {
  return sharedRun(
    [reference.title, reference.content],
    texts,
    COPY_RUN_CHARS,
    allowed,
  );
}

/**
 * Wraps a model-output parser so text copying the reference original counts as
 * a structural error and goes through the single repair. Without a bound
 * reference nothing is checked.
 */
export function withoutReferenceCopy<T>(
  parse: (value: unknown) => ParseResult<T>,
  reference: ReferenceText | null,
  texts: (data: T) => string[],
  allowed: string[] = [],
) {
  return (value: unknown): ParseResult<T> => {
    const parsed = parse(value);
    if (!parsed.success || !reference) return parsed;
    const run = copiedRun(reference, texts(parsed.data), allowed);
    return run
      ? {
          success: false,
          // Sent back to the model for its one repair; failure logs never include it.
          error: `输出里出现了框架来源文章的原文「${run}」；框架只借结构，这一处请用作者自己的素材和说法重写，不要沿用那篇文章的句子或短语`,
          code: REFERENCE_COPIED,
        }
      : parsed;
  };
}

/**
 * The original behind an article's framework, at the version that was broken
 * down. Null when the article has no framework or the reference was deleted:
 * the original is gone then and only the framework snapshot remains.
 */
export async function readBoundReference(
  db: Executor,
  userId: string,
  articleId: string,
): Promise<ReferenceText | null> {
  const [reference] = await db
    .select({
      title: referenceArticleRevisions.title,
      content: referenceArticleRevisions.content,
    })
    .from(articles)
    .innerJoin(
      breakdowns,
      and(
        eq(breakdowns.id, articles.breakdownId),
        eq(breakdowns.userId, userId),
      ),
    )
    .innerJoin(
      referenceArticleRevisions,
      and(
        eq(
          referenceArticleRevisions.referenceArticleId,
          breakdowns.referenceArticleId,
        ),
        eq(referenceArticleRevisions.version, breakdowns.referenceVersion),
        eq(referenceArticleRevisions.userId, userId),
      ),
    )
    .where(and(eq(articles.id, articleId), eq(articles.userId, userId)));
  return reference ?? null;
}
