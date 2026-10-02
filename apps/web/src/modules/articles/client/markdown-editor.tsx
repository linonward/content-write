"use client";

import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { EditorView, minimalSetup } from "codemirror";
import { useEffect, useRef } from "react";

// 替代 CodeMirror 默认高亮（固定的浅色值），颜色引用设计 token，随浅色/深色主题切换。
const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "bold", textDecoration: "underline" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, textDecoration: "underline" },
  {
    tag: [tags.url, tags.contentSeparator, tags.labelName],
    color: "var(--color-accent)",
  },
  { tag: [tags.meta, tags.comment], color: "var(--color-ink-2)" },
  { tag: tags.monospace, fontFamily: "var(--font-mono)" },
]);

export type TextRange = { start: number; end: number };

/** CodeMirror Markdown editor. Mounted in an effect because it needs the DOM. */
export function MarkdownEditor({
  id,
  value,
  onChange,
  onSelectionChange,
  label,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Main selection as UTF-16 offsets into the text, the same units the API uses. */
  onSelectionChange?: (range: TextRange) => void;
  label: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const change = useRef(onChange);
  change.current = onChange;
  const select = useRef(onSelectionChange);
  select.current = onSelectionChange;

  // biome-ignore lint/correctness/useExhaustiveDependencies: created once; later values arrive through the sync effect below.
  useEffect(() => {
    if (!host.current) return;
    view.current = new EditorView({
      parent: host.current,
      doc: value,
      extensions: [
        minimalSetup,
        markdown(),
        syntaxHighlighting(markdownHighlight),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ id, "aria-label": label }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) change.current(update.state.doc.toString());
          if (update.docChanged || update.selectionSet) {
            const { from, to } = update.state.selection.main;
            select.current?.({ start: from, end: to });
          }
        }),
        EditorView.theme({
          "&": { minHeight: "24rem", fontSize: "15px" },
          ".cm-content": { fontFamily: "inherit", lineHeight: "1.8" },
          "&.cm-focused": { outline: "none" },
          ".cm-cursor, .cm-dropCursor": {
            borderLeftColor: "var(--color-ink)",
          },
          "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
            {
              backgroundColor:
                "color-mix(in oklab, var(--color-accent) 24%, transparent)",
            },
        }),
      ],
    });
    return () => {
      view.current?.destroy();
      view.current = null;
    };
  }, []);

  // Replaces the document only when the text came from outside (load latest, restore).
  useEffect(() => {
    const current = view.current;
    if (current && current.state.doc.toString() !== value)
      current.dispatch({
        changes: { from: 0, to: current.state.doc.length, insert: value },
      });
  }, [value]);

  return (
    <div
      ref={host}
      className="rounded-sm border bg-canvas px-3 py-2 focus-within:ring-2 focus-within:ring-accent/20"
    />
  );
}
