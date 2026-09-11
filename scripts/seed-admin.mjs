// Seeds the first admin account directly (not via invite). An admin's only
// job is user management (invite/delete) - it does not review proposals
// itself, so a separate approver account still needs inviting afterward
// from /admin/users.
//
// Usage:
//   node --env-file=.env.local scripts/seed-admin.mjs <email> <password> <first name> <last name>

import { createClient } from "@supabase/supabase-js";

const [email, password, firstName, lastName] = process.argv.slice(2);

if (!email || !password || !firstName || !lastName) {
  console.error("Usage: node --env-file=.env.local scripts/seed-admin.mjs <email> <password> <first name> <last name>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey || url.includes("YOUR_PROJECT_REF") || serviceKey.includes("placeholder")) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are still placeholders in .env.local.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { first_name: firstName, last_name: lastName, role: "admin" },
});

if (error) {
  console.error("Failed to create admin user:", error.message);
  process.exit(1);
}

console.log(`Seeded admin account: ${data.user.email} (${data.user.id})`);
console.log("Sign in and invite an approver + salesperson from /admin/users.");
console.log("The public.profiles row is created automatically by the on_auth_user_created trigger.");
