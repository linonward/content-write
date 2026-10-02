import { randomUUID } from "node:crypto";
import { readProfileRevision } from "@content-write/db/author-profile";
import { getDb } from "@content-write/db/client";
import { aiJobs } from "@content-write/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../src/app";
import {
  cleanup,
  confirm,
  confirmedArticle,
  failure,
  generate,
  signIn,
  write,
} from "./helpers";

const profile = {
  bio: "前后端都写过的独立开发者",
  topics: ["写作习惯", "小团队协作"],
  audience: "工作 3 到 8 年的程序员",
  preferences: "短句，先给结论",
  bannedWords: ["赋能", "闭环"],
};

async function read(cookie: string) {
  const response = await app.request("/api/profile", { headers: { cookie } });
  expect(response.status).toBe(200);
  return (
    (await response.json()) as {
      profile: typeof profile & { version: number };
    }
  ).profile;
}

const save = (cookie: string, expectedVersion: number, body = profile) =>
  write(cookie, "/profile", { expectedVersion, ...body }, { method: "PUT" });

async function jobProfile(jobId: string) {
  const [job] = await getDb()
    .select({ userId: aiJobs.userId, version: aiJobs.profileVersion })
    .from(aiJobs)
    .where(eq(aiJobs.id, jobId));
  return job;
}

describe("author profile", () => {
  afterAll(cleanup);

  it("saves versions per author and rejects stale or invalid input", async () => {
    const owner = await signIn("profile-owner");
    const other = await signIn("profile-other");
    expect((await app.request("/api/profile")).status).toBe(401);
    expect(await read(owner)).toMatchObject({
      version: 0,
      bio: "",
      topics: [],
    });

    const created = await save(owner, 0, {
      ...profile,
      topics: [" 写作习惯 ", "写作习惯", "", "小团队协作"],
    });
    expect(await created.json()).toEqual({ version: 1 });
    expect(await read(owner)).toMatchObject({ ...profile, version: 1 });
    // Another author still has none, and cannot overwrite this one.
    expect((await read(other)).version).toBe(0);
    expect(await failure(await save(owner, 0))).toMatchObject({
      status: 409,
      code: "PROFILE_VERSION_CONFLICT",
    });

    expect((await save(owner, 1, { ...profile, bio: "改过" })).status).toBe(
      200,
    );
    expect(await failure(await save(owner, 1))).toMatchObject({
      status: 409,
      code: "PROFILE_VERSION_CONFLICT",
    });
    for (const invalid of [
      { ...profile, bio: "字".repeat(1001) },
      { ...profile, topics: Array.from({ length: 11 }, (_, i) => `主题${i}`) },
      { ...profile, bannedWords: ["字".repeat(21)] },
    ])
      expect(await failure(await save(owner, 2, invalid))).toMatchObject({
        status: 422,
        code: "INVALID_PROFILE",
      });
    expect(
      (
        await write(
          owner,
          "/profile",
          { expectedVersion: 2, ...profile },
          { method: "PUT", source: "https://untrusted.example" },
        )
      ).status,
    ).toBe(403);
  });

  it("generations record and keep the profile version they were queued with", async () => {
    const owner = await signIn("profile-jobs");
    // Without a profile, jobs record none.
    const { articleId } = await confirmedArticle(owner);
    const outlineJob = await getDb()
      .select({ version: aiJobs.profileVersion })
      .from(aiJobs)
      .where(eq(aiJobs.articleId, articleId));
    expect(outlineJob.map((job) => job.version)).toEqual([null]);

    await save(owner, 0);
    const version = await confirm(owner, articleId);
    const draftJob = await generate(owner, articleId, version);
    expect((await jobProfile(draftJob)).version).toBe(1);

    // A later save does not change what the queued job will use.
    await save(owner, 1, { ...profile, bio: "后来改的简介" });
    const queued = await jobProfile(draftJob);
    expect(
      (await readProfileRevision(getDb(), queued.userId, queued.version))?.bio,
    ).toBe(profile.bio);
  });

  it("treats a profile change as a different generation input", async () => {
    const owner = await signIn("profile-idempotency");
    const { articleId } = await confirmedArticle(owner);
    const version = await confirm(owner, articleId);
    const key = randomUUID();
    const first = await write(
      owner,
      `/articles/${articleId}/draft/generate`,
      { expectedVersion: version },
      { key },
    );
    expect(first.status).toBe(202);
    await save(owner, 0);
    expect(
      await failure(
        await write(
          owner,
          `/articles/${articleId}/draft/generate`,
          { expectedVersion: version },
          { key },
        ),
      ),
    ).toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });
  });
});
