"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { processAuthFragment } from "@/lib/supabase/auth-fragment";

// Handles both flow shapes Supabase can redirect back with after an invite,
// magic-link, or recovery email is clicked:
//
// 1. Implicit flow: tokens embedded directly in the URL FRAGMENT
//    (#access_token=...&refresh_token=...) - this is what admin-generated
//    invite/recovery links actually use. Handled by the shared
//    processAuthFragment() helper (lib/supabase/auth-fragment.ts) - also
//    used by /login, since a misconfigured Supabase Site URL can land the
//    browser there instead of here (see that file's comment).
// 2. PKCE flow: a `?code=` query param, exchanged for a session - kept as
//    a fallback in case any future flow (e.g. OAuth) uses it. This one DOES
//    reach the server (it's a query param, not a fragment), so it's less
//    exposed to the same routing risk, but handled here for symmetry.
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handle() {
      const fragmentResult = await processAuthFragment();
      if (fragmentResult.handled) {
        if (fragmentResult.error) {
          setError(fragmentResult.error);
        } else {
          router.replace("/auth/set-password");
        }
        return;
      }

      const search = new URLSearchParams(window.location.search);
      const code = search.get("code");
      if (code) {
        const supabase = createClient();
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
