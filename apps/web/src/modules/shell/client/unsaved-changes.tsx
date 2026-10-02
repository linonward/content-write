"use client";

import { useEffect, useId } from "react";

const unsaved = new Set<string>();

/** Editors register semantic dirty state, including the autosave debounce window. */
export function useUnsavedChanges(dirty: boolean) {
  const id = useId();
  useEffect(() => {
    if (dirty) unsaved.add(id);
    else unsaved.delete(id);
    return () => {
      unsaved.delete(id);
    };
  }, [dirty, id]);
}

export function hasUnsavedChanges() {
  return unsaved.size > 0;
}
