/** Longest selection an edit may cover; longer text has to be edited in parts. */
export const MAX_SELECTION_CHARS = 8_000;

/** Same limit as body saves: an applied edit cannot grow the body past it. */
export const MAX_BODY_CHARS = 50_000;

type Selection = { start: number; end: number; selectionText: string };

/**
 * A suggestion still fits the body while the article is at its base version
 * and the selected text is unchanged at the same UTF-16 offsets. API apply and
 * the worker both check this before using a suggestion.
 */
export function selectionCurrent(
  article: { version: number; body: string | null },
  suggestion: Selection & { baseVersion: number },
) {
  return (
    article.version === suggestion.baseVersion &&
    article.body !== null &&
    article.body.slice(suggestion.start, suggestion.end) ===
      suggestion.selectionText
  );
}

export function replaceSelection(
  body: string,
  selection: Selection,
  replacement: string,
) {
  return (
    body.slice(0, selection.start) + replacement + body.slice(selection.end)
  );
}
