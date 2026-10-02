import { diffChars } from "diff";

export type DiffPart = {
  kind: "same" | "removed" | "added";
  text: string;
  /** Position in both texts; stable for rendering lists. */
  key: string;
};

/**
 * Character diff between the selected text and a suggestion, which suits
 * Chinese prose without word spaces. Returns null when the texts differ too
 * much to diff quickly; the caller then shows both versions in full.
 */
export function editDiff(before: string, after: string): DiffPart[] | null {
  const changes = diffChars(before, after, { timeout: 200 });
  if (!changes) return null;
  let oldPos = 0;
  let newPos = 0;
  return changes.map((change) => {
    const kind = change.added ? "added" : change.removed ? "removed" : "same";
    const key = `${kind}:${oldPos}:${newPos}`;
    if (kind !== "added") oldPos += change.value.length;
    if (kind !== "removed") newPos += change.value.length;
    return { kind, text: change.value, key };
  });
}
