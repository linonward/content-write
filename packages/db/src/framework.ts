import type { BreakdownResult } from "./schema";

/** The reusable part of a breakdown: functions and techniques, never the original's text. */
export type FrameworkSnapshot = {
  name: string;
  titlePattern: string;
  hook: { type: string; technique: string };
  slots: { id: string; name: string; purpose: string; technique: string }[];
  rhythm: string;
  ending: { type: string; technique: string };
};

/**
 * Copies only structure from a breakdown. Spans quote someone else's article,
 * and the audience describes theirs, so neither is carried into the author's.
 */
export function frameworkSnapshot(result: BreakdownResult): FrameworkSnapshot {
  return {
    name: result.hook.type,
    titlePattern: result.titlePattern,
    hook: { type: result.hook.type, technique: result.hook.technique },
    slots: result.slots.map(({ id, name, purpose, technique }) => ({
      id,
      name,
      purpose,
      technique,
    })),
    rhythm: result.rhythm,
    ending: { type: result.ending.type, technique: result.ending.technique },
  };
}

/**
 * Slot references must belong to the bound framework, once each. A generated
 * outline must be `complete`: one section per slot, in the framework's order.
 * The author may later drop, add or reorder sections, so saved outlines are not.
 */
export function slotsMatch(
  sections: { slotId?: string }[],
  framework: FrameworkSnapshot | null,
  options: { complete?: boolean } = {},
) {
  const used = sections.flatMap((section) =>
    section.slotId === undefined ? [] : [section.slotId],
  );
  if (!framework) return used.length === 0;
  const known = framework.slots.map((slot) => slot.id);
  if (options.complete)
    return (
      sections.length === known.length &&
      sections.every((section, index) => section.slotId === known[index])
    );
  return (
    new Set(used).size === used.length &&
    used.every((slotId) => known.includes(slotId))
  );
}
