import "server-only";

// Used everywhere a server-side email/redirect needs to build an absolute
// URL back into the app. Previously every call site duplicated
// `process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"` - if that env
// var was never set on Vercel (an easy thing to miss, and something that
// needs a manual dashboard edit + redeploy every time), every link silently
// fell straight through to localhost, in production, for real users.
//
// Vercel sets `VERCEL_PROJECT_PRODUCTION_URL` automatically on every
// deployment - the stable production domain, no dashboard configuration
// needed at all - so that's now the real fallback, with localhost only ever
// used for actual local dev. `NEXT_PUBLIC_APP_URL` still wins if explicitly
// set (e.g. a custom domain that differs from the Vercel-assigned one).
export function getAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
