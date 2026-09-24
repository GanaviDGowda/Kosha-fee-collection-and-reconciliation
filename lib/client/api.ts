// Browser-side fetch helper for the API. Returns data, or throws ApiClientError carrying the
// server's { code, message, field } so forms can show the message next to the right field.

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: init.body === undefined ? undefined : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiClientError(0, "network", "Could not reach the server. Check your connection and try again. Nothing was changed.");
  }
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code: string; message: string; field?: string } } | null;
  if (!res.ok || !json || json.error) {
    const e = json?.error;
    throw new ApiClientError(res.status, e?.code ?? "unknown", e?.message ?? `The server returned ${res.status}. Try again.`, e?.field);
  }
  return json.data as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Try again.";
}
