import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

// For use in Server Components, Route Handlers, and Server Actions.
// Reads/writes the user's session via cookies so RLS policies evaluate under
// the requesting user's own JWT (never the service role).
//
// Wrapped in React's cache() so every layout/page/component in a single
// request tree shares ONE client instance instead of each independently
// calling supabase.auth.getUser() (which can trigger a token refresh).
// Without this, a single navigation could fire 2-3 concurrent refresh
// attempts against the same soon-to-be-rotated refresh token - Supabase
// treats concurrent reuse of a refresh token as a security event and
// invalidates the whole session, which is what caused real, reproducible
// sign-outs during navigation (see progress.md's Errors & Fixes log).
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component during render - middleware
            // refreshes the session instead, so this is safe to ignore.
          }
        },
      },
    },
  );
});
