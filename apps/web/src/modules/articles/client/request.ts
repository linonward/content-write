const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Calls the article API with the session cookie; throws the server's message on failure. */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const payload = (await response.json()) as T & {
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(payload.error?.message ?? "请求失败，请稍后重试。");
  return payload;
}
