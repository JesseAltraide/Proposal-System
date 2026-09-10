"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Handles both flow shapes Supabase can redirect back with after an invite,
// magic-link, or recovery email is clicked:
//
// 1. Implicit flow: tokens embedded directly in the URL FRAGMENT
//    (#access_token=...&refresh_token=...) - this is what admin-generated
//    invite/recovery links actually use. Fragments never reach the server,
//    so this can only be read and handled client-side (a server Route
//    Handler here would never see them at all - see progress.md's
//    Errors & Fixes log for the bug this replaced).
// 2. PKCE flow: a `?code=` query param, exchanged for a session - kept as
//    a fallback in case any future flow (e.g. OAuth) uses it.
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handle() {
      const supabase = createClient();
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const search = new URLSearchParams(window.location.search);

      const hashError = hash.get("error_description") || hash.get("error");
      if (hashError) {
        setError(hashError);
        return;
      }

      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          setError(error.message);
          return;
        }
        router.replace("/auth/set-password");
        return;
      }

      const code = search.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setError(error.message);
          return;
        }
        router.replace("/auth/set-password");
        return;
      }

      setError("No auth token or code found in the link.");
    }

    handle();
  }, [router]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <p className="mb-4 text-sm text-red-600">{error}</p>
          <a href="/login" className="text-sm text-neutral-600 underline">
            Back to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <p className="text-sm text-neutral-500">Verifying...</p>
    </div>
  );
}
