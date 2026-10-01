import { randomUUID } from "node:crypto";
import { rateLimit, user } from "@content-write/db/auth-schema";
import { getDb, getPool } from "@content-write/db/client";
import { materialRevisions } from "@content-write/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app";
import { auth } from "../../src/modules/identity/auth";

const suffix = randomUUID();
const email = `import-${suffix}@example.test`;
const otherEmail = `other-import-${suffix}@example.test`;
const password = `integration-${suffix}`;
const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const createdIds: string[] = [];

async function signIn(address: string) {
  // In-process requests have no socket IP and share a single test rate-limit bucket.
  await getDb().delete(rateLimit);
  const created = await auth.api.createUser({
    body: { email: address, name: address, password, role: "user" },
  });
  createdIds.push(created.user.id);
  const response = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email: address, password }),
  });
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

function upload(
  files: { name: string; bytes: Uint8Array }[],
  cookie?: string,
  source = origin,
) {
  const form = new FormData();
  for (const file of files)
    form.append("file", new File([file.bytes], file.name));
  return app.request(
    new Request("http://localhost:3001/api/materials/import", {
      method: "POST",
      headers: { origin: source, ...(cookie ? { cookie } : {}) },
      body: form,
    }),
  );
}

const utf8 = (value: string) => new TextEncoder().encode(value);

describe("file import", () => {
  afterAll(async () => {
    for (const id of createdIds)
      await getDb().delete(user).where(eq(user.id, id));
    await getPool().end();
  });

  it("imports UTF-8 Markdown and text, preserving provenance and revisions", async () => {
    const cookie = await signIn(email);
    const other = await signIn(otherEmail);
    const markdown = "# 标题\n\n正文 **加粗**。\n";
    const created = await upload(
      [{ name: "思路.md", bytes: utf8(markdown) }],
      cookie,
    );
    expect(created.status).toBe(201);
    const item = (
      (await created.json()) as {
        material: {
          id: string;
          kind: string;
          sourceFilename: string;
          content: string;
          title: string;
        };
      }
    ).material;
    expect(item).toMatchObject({
      kind: "markdown",
      sourceFilename: "思路.md",
      content: markdown,
      title: "思路",
    });
    const detail = await app.request(`/api/materials/${item.id}`, {
      headers: { cookie },
    });
    expect(
      ((await detail.json()) as { material: { sourceFilename: string } })
        .material.sourceFilename,
    ).toBe("思路.md");
    expect(
      (
        await app.request(`/api/materials/${item.id}`, {
          headers: { cookie: other },
        })
      ).status,
    ).toBe(404);
    const update = await app.request(`/api/materials/${item.id}`, {
      method: "PATCH",
      headers: { cookie, origin, "content-type": "application/json" },
      body: JSON.stringify({
        title: "改写",
        content: "新版",
        expectedVersion: 1,
      }),
    });
    expect(update.status).toBe(200);
    expect(
      ((await update.json()) as { material: { sourceFilename: string } })
        .material.sourceFilename,
    ).toBe("思路.md");
    const revisions = await getDb()
      .select()
      .from(materialRevisions)
      .where(eq(materialRevisions.materialId, item.id));
    expect(revisions).toHaveLength(2);
    expect(
      revisions.every(
        (revision) =>
          revision.kind === "markdown" && revision.sourceFilename === "思路.md",
      ),
    ).toBe(true);
    const text = await upload(
      [{ name: "笔记.TXT", bytes: utf8("纯文本") }],
      cookie,
    );
    expect(text.status).toBe(201);
    expect(
      (
        (await text.json()) as {
          material: { kind: string; sourceFilename: string };
        }
      ).material,
    ).toMatchObject({ kind: "text", sourceFilename: "笔记.TXT" });
    expect(
      (
        await app.request(`/api/materials/${item.id}`, {
          method: "DELETE",
          headers: { cookie, origin },
        })
      ).status,
    ).toBe(204);
    expect(
      await getDb()
        .select()
        .from(materialRevisions)
        .where(eq(materialRevisions.materialId, item.id)),
    ).toHaveLength(0);
  });

  it("rejects unauthenticated and cross-origin uploads and invalid files", async () => {
    const cookie = await signIn(`reject-${suffix}@example.test`);
    const valid = [{ name: "ok.md", bytes: utf8("内容") }];
    expect((await upload(valid)).status).toBe(401);
    expect(
      (await upload(valid, cookie, "https://untrusted.example")).status,
    ).toBe(403);
    expect(
      (await upload([{ name: "wrong.html", bytes: utf8("内容") }], cookie))
        .status,
    ).toBe(422);
    expect(
      (
        await upload(
          [{ name: "bad.md", bytes: new Uint8Array([0xff]) }],
          cookie,
        )
      ).status,
    ).toBe(422);
    expect(
      (await upload([{ name: "empty.md", bytes: utf8("  \n") }], cookie))
        .status,
    ).toBe(422);
    expect(
      (
        await upload(
          [{ name: "long.md", bytes: utf8("字".repeat(50_001)) }],
          cookie,
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await upload(
          [{ name: "large.md", bytes: new Uint8Array(1_048_577) }],
          cookie,
        )
      ).status,
    ).toBe(413);
    expect((await upload([valid[0], valid[0]], cookie)).status).toBe(422);
  });
});
