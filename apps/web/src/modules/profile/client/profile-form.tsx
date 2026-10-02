"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { request } from "@/modules/articles/client/request";

type Profile = {
  bio: string;
  topics: string[];
  audience: string;
  preferences: string;
  bannedWords: string[];
  version: number;
};
type Form = {
  bio: string;
  topics: string;
  audience: string;
  preferences: string;
  bannedWords: string;
};

/** Lists are typed as one line separated by 、 or commas. */
const split = (value: string) =>
  value
    .split(/[、,，;；\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
const toForm = (profile: Profile): Form => ({
  bio: profile.bio,
  topics: profile.topics.join("、"),
  audience: profile.audience,
  preferences: profile.preferences,
  bannedWords: profile.bannedWords.join("、"),
});

export function ProfileForm() {
  const [saved, setSaved] = useState<Profile | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const { profile } = await request<{ profile: Profile }>("/profile");
    setSaved(profile);
    setForm(toForm(profile));
  }, []);
  useEffect(() => {
    void load().catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : "加载失败。"),
    );
  }, [load]);

  if (!form || !saved)
    return error ? (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    ) : (
      <p className="text-sm text-muted-foreground">加载中…</p>
    );

  const topics = split(form.topics);
  const bannedWords = split(form.bannedWords);
  const dirty =
    JSON.stringify({ ...form, topics, bannedWords }) !==
    JSON.stringify({
      ...toForm(saved),
      topics: saved.topics,
      bannedWords: saved.bannedWords,
    });
  const set = (patch: Partial<Form>) => {
    setNotice("");
    setForm({ ...form, ...patch });
  };

  async function save() {
    if (!form || !saved) return;
    setPending(true);
    setError("");
    try {
      await request("/profile", {
        method: "PUT",
        body: JSON.stringify({
          expectedVersion: saved.version,
          bio: form.bio,
          topics,
          audience: form.audience,
          preferences: form.preferences,
          bannedWords,
        }),
      });
      await load();
      setNotice("已保存。之后的生成会使用新设置，已在进行的生成不受影响。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败。");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="max-w-[720px]">
      <CardHeader>
        <CardTitle>
          <h2>作者画像</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert role="status">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="profile-bio">作者简介</FieldLabel>
            <Textarea
              id="profile-bio"
              value={form.bio}
              maxLength={1000}
              rows={3}
              placeholder="例如：前后端都写过的独立开发者"
              onChange={(event) => set({ bio: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-topics">写作主题</FieldLabel>
            <Input
              id="profile-topics"
              value={form.topics}
              placeholder="职业转型、写作习惯、小团队协作"
              onChange={(event) => set({ topics: event.target.value })}
            />
            <FieldDescription>
              用顿号或逗号分隔，最多 10 个、每个 30 字以内。
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-audience">目标读者</FieldLabel>
            <Input
              id="profile-audience"
              value={form.audience}
              maxLength={200}
              placeholder="工作 3 到 8 年的程序员"
              onChange={(event) => set({ audience: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-preferences">表达偏好</FieldLabel>
            <Textarea
              id="profile-preferences"
              value={form.preferences}
              maxLength={1000}
              rows={3}
              placeholder="例如：短句，先给结论；少用形容词；不用网络流行语"
              onChange={(event) => set({ preferences: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-banned">禁用词</FieldLabel>
            <Input
              id="profile-banned"
              value={form.bannedWords}
              placeholder="赋能、抓手、闭环"
              onChange={(event) => set({ bannedWords: event.target.value })}
            />
            <FieldDescription>
              生成的选题、大纲和初稿不会使用这些词；最多 50 个、每个 20 字以内。
            </FieldDescription>
          </Field>
        </FieldGroup>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={!dirty || pending}
            onClick={() => void save()}
          >
            {pending ? "保存中…" : "保存"}
          </Button>
          <span className="text-xs text-muted-foreground">
            {saved.version ? `版本 ${saved.version}` : "尚未保存"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
