const MAX_FILE_BYTES = 1_048_576;
const MAX_REQUEST_BYTES = MAX_FILE_BYTES + 65_536;

type ImportResult =
  | {
      status: "ok";
      value: {
        title: string;
        content: string;
        kind: "text" | "markdown";
        sourceFilename: string;
      };
    }
  | { status: "invalid" | "large"; message: string };

export async function parseImport(request: Request): Promise<ImportResult> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    return { status: "invalid", message: "请选择 .md 或 .txt 文件。" };
  }
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) {
    return { status: "large", message: "文件不能超过 1 MiB。" };
  }
  if (!request.body) return { status: "invalid", message: "请选择文件。" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REQUEST_BYTES) {
      await reader.cancel();
      return { status: "large", message: "文件不能超过 1 MiB。" };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let form: FormData;
  try {
    form = await new Request("http://local/import", {
      method: "POST",
      headers: { "content-type": contentType },
      body: bytes.buffer,
    }).formData();
  } catch {
    return { status: "invalid", message: "文件上传格式无效。" };
  }
  const files = form.getAll("file");
  if (
    [...form.keys()].some((key) => key !== "file") ||
    files.length !== 1 ||
    !(files[0] instanceof File)
  ) {
    return { status: "invalid", message: "请只选择一个 .md 或 .txt 文件。" };
  }
  const file = files[0];
  if (file.size > MAX_FILE_BYTES)
    return { status: "large", message: "文件不能超过 1 MiB。" };
  const sourceFilename = file.name.split(/[\\/]/).at(-1)?.trim() ?? "";
  if (
    !sourceFilename ||
    sourceFilename.length > 255 ||
    [...sourceFilename].some((character) => character.charCodeAt(0) < 32)
  ) {
    return { status: "invalid", message: "文件名无效。" };
  }
  const extension = /\.(md|txt)$/i.exec(sourceFilename)?.[1]?.toLowerCase();
  if (!extension)
    return { status: "invalid", message: "只支持 .md 和 .txt 文件。" };
  const title = sourceFilename.slice(0, -(extension.length + 1)).trim();
  if (!title || title.length > 200)
    return { status: "invalid", message: "文件名标题需在 1 至 200 字之间。" };

  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true })
      .decode(await file.arrayBuffer())
      .replace(/^\uFEFF/, "");
  } catch {
    return { status: "invalid", message: "文件必须是 UTF-8 编码。" };
  }
  if (content.includes("\u0000"))
    return { status: "invalid", message: "文件包含不支持的控制字符。" };
  if (!content.trim() || content.length > 50_000) {
    return { status: "invalid", message: "正文不能为空，且最多 50000 字。" };
  }
  return {
    status: "ok",
    value: {
      title,
      content,
      kind: extension === "md" ? "markdown" : "text",
      sourceFilename,
    },
  };
}
