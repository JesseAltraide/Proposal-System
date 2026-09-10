"use client";

// Every mutating client action goes through this instead of raw fetch().
//
// Root cause this guards against (see progress.md's Errors & Fixes log,
// 2026-09-10): if the session's access token needed a refresh and that
// refresh lost a race (multiple auth checks firing for one navigation -
// since fixed by memoizing the server Supabase client, but not eliminated
// entirely), the API route's requireRole() redirects to /login. fetch()
// follows redirects by default and returns `ok: true` with the LOGIN PAGE'S
// HTML as the body - not JSON, not an error status. Silently treating that
// as success is exactly why "Mark Rejected" looked like it did nothing.
export interface ApiResult<T = unknown> {
  ok: boolean;
  status: number;
  body: T & { error?: unknown };
}

const SESSION_EXPIRED_ERROR = "Your session expired - refresh the page and sign in again.";

export async function apiFetch<T = unknown>(input: string, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await fetch(input, init);

  if (res.redirected) {
    return { ok: false, status: 401, body: { error: SESSION_EXPIRED_ERROR } as T & { error: string } };
  }

  const body = (await res.json().catch(() => ({}))) as T & { error?: unknown };
  return { ok: res.ok, status: res.status, body };
}

export function apiErrorMessage(body: { error?: unknown } | undefined, fallback: string): string {
  const err = body?.error;
  if (typeof err === "string") return err;
  // zod's .flatten() shape: { formErrors: string[], fieldErrors: Record<string, string[]> }
  if (err && typeof err === "object" && ("formErrors" in err || "fieldErrors" in err)) {
    const { formErrors, fieldErrors } = err as {
      formErrors?: string[];
      fieldErrors?: Record<string, string[]>;
    };
    if (formErrors?.length) return formErrors.join(", ");
    if (fieldErrors) {
      const messages = Object.values(fieldErrors).flat();
      if (messages.length) return messages.join(", ");
    }
  }
  return fallback;
}
