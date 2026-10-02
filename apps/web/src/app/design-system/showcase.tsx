"use client";

import { FileText, Inbox } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { EvidenceMark, EvidenceSource } from "@/components/ui/evidence-mark";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { Input } from "@/components/ui/input";
import { SaveStatus } from "@/components/ui/save-status";
import { SelectField } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { Switch } from "@/components/ui/switch";

const colors = [
  "canvas",
  "sidebar",
  "surface",
  "sunken",
  "ink",
  "ink-2",
  "ink-3",
  "line",
  "line-strong",
  "accent",
  "accent-hover",
  "accent-soft",
  "evidence",
  "evidence-soft",
  "evidence-ink",
  "danger",
  "danger-soft",
] as const;
// 类名需写全，Tailwind 才能扫描到。
const swatch: Record<(typeof colors)[number], string> = {
  canvas: "bg-canvas",
  sidebar: "bg-sidebar",
  surface: "bg-surface",
  sunken: "bg-sunken",
  ink: "bg-ink",
  "ink-2": "bg-ink-2",
  "ink-3": "bg-ink-3",
  line: "bg-line",
  "line-strong": "bg-line-strong",
  accent: "bg-accent",
  "accent-hover": "bg-accent-hover",
  "accent-soft": "bg-accent-soft",
  evidence: "bg-evidence",
  "evidence-soft": "bg-evidence-soft",
  "evidence-ink": "bg-evidence-ink",
  danger: "bg-danger",
  "danger-soft": "bg-danger-soft",
};

const kinds = [
  { value: "", label: "全部类型" },
  { value: "text", label: "文字" },
  { value: "markdown", label: "Markdown" },
  { value: "link", label: "链接" },
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-4"
    >
      <h2 id={`${id}-title`} className="text-title-section">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Showcase() {
  const [kind, setKind] = useState("");
  const [form, setForm] = useState("text");
  const [evidence, setEvidence] = useState<string | null>(null);

  return (
    <main className="mx-auto flex w-full max-w-workspace flex-col gap-12 px-8 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-label text-accent">开发用 · 不在生产环境</p>
        <h1 className="font-serif text-title-article">设计系统</h1>
        <p className="max-w-reading text-ink-2">
          与 docs/design-system.md 及设计稿“00 基础规范”“01
          组件”逐项比对的组件清单。
        </p>
      </header>

      <Section id="colors" title="颜色">
        <ul className="grid grid-cols-6 gap-3 max-md:grid-cols-3">
          {colors.map((name) => (
            <li key={name} className="flex flex-col gap-1.5">
              <span
                className={`h-12 rounded-sm border border-line ${swatch[name]}`}
              />
              <span className="font-mono text-mono text-ink-2">{name}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="type" title="排版">
        <div className="flex flex-col gap-3 rounded-md border border-line bg-surface p-6">
          <p className="font-serif text-title-page">title-page 素材箱</p>
          <p className="font-serif text-title-article">
            title-article 看懂一篇爆款
          </p>
          <p className="text-title-section">title-section 区块标题</p>
          <p className="text-title-card">title-card 面板标题</p>
          <p className="text-body">body 界面正文、表单说明。</p>
          <p className="max-w-reading font-serif text-reading">
            reading
            素材原文与预览正文使用宋体，行高放宽，每行不超过三十六个汉字，读起来像纸面。
          </p>
          <p className="text-editor">editor Markdown 编辑区</p>
          <p className="text-label">label 表单标签、按钮</p>
          <p className="text-meta text-ink-2 tabular-nums">
            meta 版本 3 · 2026-10-02
          </p>
          <p className="font-mono text-mono">mono e1 s2 v3</p>
        </div>
      </Section>

      <Section id="buttons" title="按钮">
        <div className="flex flex-wrap items-center gap-3">
          <Button>主按钮</Button>
          <Button variant="secondary">次按钮</Button>
          <Button variant="ghost">幽灵按钮</Button>
          <Button variant="danger">删除</Button>
          <Button variant="danger-solid">确认删除</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled>主按钮</Button>
          <Button variant="secondary" disabled>
            次按钮
          </Button>
          <Button variant="ghost" disabled>
            幽灵按钮
          </Button>
          <Button variant="danger" disabled>
            删除
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">sm 30</Button>
          <Button size="md">md 36</Button>
          <Button size="lg">lg 44</Button>
          <Button variant="ghost" size="icon-sm" aria-label="收起侧栏">
            <FileText />
          </Button>
          <Button variant="secondary" size="icon" aria-label="素材箱">
            <Inbox />
          </Button>
        </div>
      </Section>

      <Section id="inputs" title="输入与选择">
        <div className="grid grid-cols-3 gap-6 max-md:grid-cols-1">
          <Field>
            <FieldLabel htmlFor="ds-title">标题</FieldLabel>
            <Input id="ds-title" placeholder="输入标题" />
          </Field>
          <Field data-invalid>
            <FieldLabel htmlFor="ds-error">链接</FieldLabel>
            <Input id="ds-error" aria-invalid defaultValue="example" />
            <FieldError>请输入以 http 或 https 开头的地址。</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="ds-disabled">禁用</FieldLabel>
            <Input id="ds-disabled" disabled defaultValue="不可编辑" />
          </Field>
          <Field>
            <FieldLabel>素材类型</FieldLabel>
            <SelectField
              aria-label="素材类型（标准）"
              options={kinds.slice(1)}
              value={form}
              onValueChange={setForm}
            />
          </Field>
          <Field>
            <FieldLabel>禁用</FieldLabel>
            <SelectField
              aria-label="禁用的选择框"
              options={kinds}
              value=""
              onValueChange={() => {}}
              disabled
            />
          </Field>
          <Field>
            <FieldLabel>紧凑（筛选栏）</FieldLabel>
            <div className="flex gap-2">
              <SelectField
                aria-label="素材类型（紧凑）"
                size="compact"
                active={kind !== ""}
                options={kinds}
                value={kind}
                onValueChange={setKind}
              />
            </div>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-6 max-md:grid-cols-1">
          <FileDropzone id="ds-file" name="file" accept=".md,.txt" />
          <div className="flex items-center gap-3 text-label">
            <Switch defaultChecked aria-label="抓取网页" />
            抓取网页正文
            <SaveStatus state="saved" />
            <SaveStatus state="saving" />
            <SaveStatus state="failed" />
          </div>
        </div>
      </Section>

      <Section id="status" title="状态胶囊与标注">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone="pending">未整理</StatusPill>
          <StatusPill tone="processing">处理中</StatusPill>
          <StatusPill tone="done">已整理</StatusPill>
          <StatusPill tone="expired">已过期</StatusPill>
          <StatusPill tone="failed">失败</StatusPill>
          <Badge variant="mock">模拟</Badge>
          <Badge variant="muted">版本 3</Badge>
        </div>
      </Section>

      <Section id="evidence" title="证据标记与联动高亮">
        <div className="grid grid-cols-2 gap-6 rounded-md border border-line bg-surface p-6 max-md:grid-cols-1">
          <p className="text-body">
            作者先收集素材，再按结构写作
            {["e1", "e2"].map((id) => (
              <EvidenceMark
                key={id}
                onMouseEnter={() => setEvidence(id)}
                onMouseLeave={() => setEvidence(null)}
                onFocus={() => setEvidence(id)}
                onBlur={() => setEvidence(null)}
              >
                {id}
              </EvidenceMark>
            ))}
            。
          </p>
          <p className="font-serif text-reading">
            <EvidenceSource active={evidence === "e1"}>
              我一般先把零散的想法记下来，
            </EvidenceSource>
            过几天再回头看哪些能连成一篇。
            <EvidenceSource active={evidence === "e2"}>
              结构定了之后，写起来快很多。
            </EvidenceSource>
          </p>
        </div>
      </Section>

      <Section id="feedback" title="面板、提示与空状态">
        <div className="grid grid-cols-2 gap-6 max-md:grid-cols-1">
          <Card>
            <CardHeader>
              <CardTitle>面板标题</CardTitle>
              <CardAction>
                <Button size="sm" variant="secondary">
                  操作
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="text-ink-2">
              surface 底、1px line 边、圆角 10、内边距 24，无阴影。
            </CardContent>
          </Card>
          <Card>
            <Empty>
              <EmptyHeader>
                <EmptyMedia>
                  <Inbox />
                </EmptyMedia>
                <EmptyTitle>还没有素材</EmptyTitle>
                <EmptyDescription>
                  保存一段文字、一个 Markdown 文件或一个链接。
                </EmptyDescription>
              </EmptyHeader>
              <Button variant="secondary">添加素材</Button>
            </Empty>
          </Card>
        </div>
        <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
          <Alert>
            <AlertTitle>提示</AlertTitle>
            <AlertDescription>打开页面不会自动调用模型。</AlertDescription>
          </Alert>
          <Alert variant="success">
            <AlertTitle>已整理</AlertTitle>
            <AlertDescription>摘要、观点和片段已生成。</AlertDescription>
          </Alert>
          <Alert variant="warning">
            <AlertTitle>证据缺口</AlertTitle>
            <AlertDescription>第 3 节缺少素材支撑。</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertTitle>处理失败</AlertTitle>
            <AlertDescription>请稍后重试。</AlertDescription>
          </Alert>
        </div>
      </Section>

      <Section id="dialog" title="对话框">
        <Dialog>
          <DialogTrigger
            render={<Button variant="secondary" className="self-start" />}
          >
            打开对话框
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>用这个框架写</DialogTitle>
              <DialogDescription>
                选择 1～10 条自己的已整理素材，创建文章并预填 brief。
              </DialogDescription>
            </DialogHeader>
            <p className="text-ink-2">已选 0 / 10</p>
            <DialogFooter>
              <DialogClose render={<Button variant="secondary" />}>
                取消
              </DialogClose>
              <Button>创建文章</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>
    </main>
  );
}
