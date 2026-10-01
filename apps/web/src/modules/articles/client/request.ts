const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** A failed API call; `status` is 0 when the request never reached the server. */
export class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

/** Calls the article API with the session cookie; throws the server's message on failure. */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}/api${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new RequestError("网络连接失败，请检查网络后重试。", 0);
  }
  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string; code?: string };
  };
  if (!response.ok)
    throw new RequestError(
      payload.error?.message ?? "请求失败，请稍后重试。",
      response.status,
      payload.error?.code,
    );
  return payload;
}
