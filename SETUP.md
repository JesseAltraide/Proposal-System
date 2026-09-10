# Setup — connecting real services

The app builds and runs against placeholder `.env.local` values (see
`.env.local.example`). Nothing needs this until you actually want to test a
real flow end-to-end. Do these in order.

## 1. Supabase project

1. Create a project at https://supabase.com/dashboard.
2. Project Settings → API → copy the **Project URL**, **anon public key**,
   and **service_role key** into `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
3. SQL Editor → run every file in `supabase/migrations/` in filename order
   (0001 through the latest, e.g. `0007_multi_role_accounts.sql`).
4. **Wire up the custom access-token hook** (can't be done via SQL alone):
   Authentication → Hooks → "Customize Access Token (JWT) Claims hook" →
   select `public.custom_access_token_hook` → Enable. This is what puts
   `user_role` into every JWT so RLS policies can read it without a lookup.
5. **Configure Auth SMTP to use Gmail** (so invite emails route through the
   same account as everything else, per full-flow.md Stage 0):
   Project Settings → Authentication → SMTP Settings → enable custom SMTP:
   - Host: `smtp.gmail.com`, Port: `465`, Username: your Gmail address,
     Password: a Gmail **App Password** (not your normal password —
     generate one at https://myaccount.google.com/apppasswords, requires
     2-Step Verification enabled first).
   - Sender email: same Gmail address. Sender name: `Koya Talent`.
6. Authentication → URL Configuration → set **Site URL** to
   `NEXT_PUBLIC_APP_URL` (e.g. `http://localhost:3000` for local dev) and
   add `${NEXT_PUBLIC_APP_URL}/auth/callback` to **Redirect URLs**.

## 2. Claude API key

Get a key at https://console.anthropic.com/settings/keys and put it in
`ANTHROPIC_API_KEY`.

## 3. Gmail SMTP for app-sent emails

This is separate from step 1.5 (that's Supabase's own invite emails). The
app's own notification emails (approval requested/approved/rejected,
generation complete, client verification + delivery) go through
`lib/email.ts` via `nodemailer`, using the same Gmail account:

1. Same Gmail account as above (or a different one — doesn't have to match).
2. Generate an App Password (see link above).
3. Set `GMAIL_USER` and `GMAIL_APP_PASSWORD` in `.env.local`.

## 4. Seed the first approver

Once Supabase env vars are real:

```bash
npm run seed:admin -- you@example.com "a-strong-password" "Your Name"
```

This creates the first approver account **directly** (not via invite), per
full-flow.md Stage 0. From then on, that approver invites everyone else via
`/approvals/invite`.

## 5. Run it

```bash
npm run dev
```

Sign in at `/login` with the seeded approver account, invite a salesperson,
have them create a proposal at `/dashboard/new`.

## Known limitation (see progress.md decision #23)

All app-sent email shows the real Gmail account as sender, not a branded
`proposals@koyatalent.com` — Gmail SMTP can't send *as* a custom domain. A
real deployment would use Resend/SendGrid with a verified sending domain.
