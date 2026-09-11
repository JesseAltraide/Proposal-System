"use client";

import { createClient } from "./client";

export interface AuthFragmentResult {
  handled: boolean;
  error?: string;
}

// Shared by /login and /auth/callback - implicit-flow tokens
// (#access_token=...&refresh_token=...) only ever reach the browser, never
// the server, so this can only run client-side wherever the browser actually
// lands. That "wherever" isn't guaranteed to be /auth/callback: if
// Supabase's dashboard Site URL/Redirect-URLs allowlist doesn't include our
// custom redirectTo, Supabase silently substitutes its own Site URL (often
// still the bare root "/") instead - and proxy.ts's middleware 307s away
// from "/" to /login BEFORE any client component on "/" ever gets a chance
// to mount, since middleware runs server-side ahead of rendering. /login is
// the one page guaranteed to actually render in that scenario (it's in
// PUBLIC_PATHS), which is why it needs this too, not just /auth/callback.
export async function processAuthFragment(): Promise<AuthFragmentResult> {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  const hashError = hash.get("error_description") || hash.get("error");
  if (hashError) return { handled: true, error: hashError };

  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (!accessToken || !refreshToken) return { handled: false };

  const supabase = createClient();
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  // Clear the hash regardless of outcome - a refresh/back-nav shouldn't
  // re-submit a token that's either already consumed or already failed.
  window.history.replaceState(null, "", window.location.pathname + window.location.search);

  if (error) return { handled: true, error: error.message };
  return { handled: true };
}
