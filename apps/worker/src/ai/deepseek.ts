import { TerminalJobError } from "../failures";
import {
  deepseekBaseUrl,
  deepseekModel,
  type GenerationKind,
  kindSettings,
  requestTimeoutMs,
} from "./config";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  calls: number;
};

export type ParseResult<T> =
  | { success: true; data: T }
  // `code` replaces AI_OUTPUT_INVALID as the job's error when the repair fails the same way.
  | { success: false; error: string; code?: string };

export type DeepSeekDeps = {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
};

const MAX_TRANSIENT_RETRIES = 2;

function defaultDeps(): DeepSeekDeps {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) throw new TerminalJobError("AI_NOT_CONFIGURED");
  return {
    fetch: globalThis.fetch,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    apiKey,
    baseUrl: deepseekBaseUrl(),
    model: deepseekModel(),
    timeoutMs: requestTimeoutMs(),
  };
}

/** A failure worth another identical request: network, timeout, 429 or 5xx. */
class TransientError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "TransientError";
  }
}

type Completion = {
  content: string;
  finishReason: string | null;
  usage: { prompt: number; completion: number; reasoning: number };
};

async function requestOnce(
  deps: DeepSeekDeps,
  body: Record<string, unknown>,
): Promise<Completion> {
  let response: Response;
  try {
    response = await deps.fetch(`${deps.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${deps.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(deps.timeoutMs),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    throw new TransientError(
      name === "TimeoutError" || name === "AbortError"
        ? "AI_TIMEOUT"
        : "AI_NETWORK_ERROR",
    );
  }
  if (response.status === 401 || response.status === 403)
    throw new TerminalJobError("AI_AUTH_FAILED");
  if (response.status === 402)
    throw new TerminalJobError("AI_INSUFFICIENT_BALANCE");
  if (response.status === 429) throw new TransientError("AI_RATE_LIMITED");
  if (response.status >= 500) throw new TransientError("AI_UPSTREAM_ERROR");
  if (!response.ok) throw new TerminalJobError("AI_REQUEST_REJECTED");
  let json: {
    choices?: {
      message?: { content?: string | null };
      finish_reason?: string;
    }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      completion_tokens_details?: { reasoning_tokens?: number };
    };
  };
  try {
    json = (await response.json()) as typeof json;
  } catch {
    throw new TransientError("AI_UPSTREAM_ERROR");
  }
  const choice = json.choices?.[0];
  return {
    content: choice?.message?.content ?? "",
    finishReason: choice?.finish_reason ?? null,
    usage: {
      prompt: json.usage?.prompt_tokens ?? 0,
      completion: json.usage?.completion_tokens ?? 0,
      reasoning: json.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    },
  };
}

/** Retries transient failures with a short backoff; terminal ones propagate at once. */
async function requestWithRetry(
  deps: DeepSeekDeps,
  body: Record<string, unknown>,
  usage: Usage,
): Promise<Completion> {
  for (let attempt = 0; ; attempt++) {
    try {
      const completion = await requestOnce(deps, body);
      usage.calls++;
      usage.inputTokens += completion.usage.prompt;
      usage.outputTokens += completion.usage.completion;
      usage.reasoningTokens += completion.usage.reasoning;
      return completion;
    } catch (error) {
      if (!(error instanceof TransientError)) throw error;
      if (attempt >= MAX_TRANSIENT_RETRIES)
        throw new TerminalJobError(error.code);
      await deps.sleep(1_000 * 2 ** attempt);
    }
  }
}

function problemWith<T>(
  completion: Completion,
  parse: (value: unknown) => ParseResult<T>,
): ParseResult<T> {
  if (completion.finishReason === "length")
    return { success: false, error: "输出被截断" };
  if (!completion.content.trim()) return { success: false, error: "输出为空" };
  let value: unknown;
  try {
    value = JSON.parse(completion.content);
  } catch {
    return { success: false, error: "输出不是合法的 json" };
  }
  return parse(value);
}

/**
 * Calls DeepSeek in JSON mode and validates the result. Empty, truncated or
 * invalid output is repaired once with a larger budget; a second failure is
 * terminal so the job does not burn more calls.
 */
export async function generateJson<T>(
  kind: GenerationKind,
  messages: ChatMessage[],
  parse: (value: unknown) => ParseResult<T>,
  deps: DeepSeekDeps = defaultDeps(),
): Promise<{ data: T; usage: Usage }> {
  const settings = kindSettings[kind];
  const usage: Usage = {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    calls: 0,
  };
  const base = {
    model: deps.model,
    response_format: { type: "json_object" },
    ...settings.thinking,
  };
  const first = await requestWithRetry(
    deps,
    { ...base, messages, max_tokens: settings.maxTokens },
    usage,
  );
  const checked = problemWith(first, parse);
  if (checked.success) return { data: checked.data, usage };
  const repairMessages: ChatMessage[] = [
    ...messages,
    ...(first.content.trim()
      ? [{ role: "assistant" as const, content: first.content }]
      : []),
    {
      role: "user",
      content: `上一次输出不符合要求：${checked.error}。请严格按要求重新输出完整的 json，不要输出其他文字。`,
    },
  ];
  const second = await requestWithRetry(
    deps,
    { ...base, messages: repairMessages, max_tokens: settings.repairMaxTokens },
    usage,
  );
  const repaired = problemWith(second, parse);
  if (repaired.success) return { data: repaired.data, usage };
  throw new TerminalJobError(repaired.code ?? "AI_OUTPUT_INVALID");
}
