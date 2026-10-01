import { describe, expect, it } from "vitest";
import {
  clearLocalCopies,
  readLocalCopy,
  recoveryState,
  removeLocalCopy,
  writeLocalCopy,
} from "./local-copy";

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
    clear: () => items.clear(),
  };
}

const copy = {
  baseVersion: 4,
  title: "本机标题",
  body: "本机正文",
  savedAt: "2026-10-02T00:00:00.000Z",
};
const server = { version: 4, title: "服务端标题", body: "服务端正文" };

describe("local recovery copy", () => {
  it("round-trips per article and ignores malformed entries", () => {
    const storage = memoryStorage();
    writeLocalCopy(storage, "a1", copy);
    expect(readLocalCopy(storage, "a1")).toEqual(copy);
    expect(readLocalCopy(storage, "a2")).toBeNull();
    storage.setItem("content-write:article:a3", "{not json");
    expect(readLocalCopy(storage, "a3")).toBeNull();
    storage.setItem(
      "content-write:article:a4",
      JSON.stringify({ title: "缺少版本" }),
    );
    expect(readLocalCopy(storage, "a4")).toBeNull();
    removeLocalCopy(storage, "a1");
    expect(readLocalCopy(storage, "a1")).toBeNull();
  });

  it("clears every article copy on sign-out and leaves other keys", () => {
    const storage = memoryStorage();
    writeLocalCopy(storage, "a1", copy);
    writeLocalCopy(storage, "a2", copy);
    storage.setItem("unrelated", "keep");
    clearLocalCopies(storage);
    expect(storage.length).toBe(1);
    expect(storage.getItem("unrelated")).toBe("keep");
  });

  it("never treats a copy based on an older version as current", () => {
    expect(recoveryState(null, server)).toBe("none");
    expect(
      recoveryState(
        { ...copy, title: server.title, body: server.body },
        server,
      ),
    ).toBe("same");
    expect(recoveryState(copy, server)).toBe("restorable");
    expect(recoveryState({ ...copy, baseVersion: 3 }, server)).toBe("outdated");
    expect(recoveryState({ ...copy, baseVersion: 9 }, server)).toBe("outdated");
  });
});
