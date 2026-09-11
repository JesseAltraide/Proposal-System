import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const switchSchema = z.object({ role: z.enum(["salesperson", "approver", "admin"]) });

// Switches which of this account's granted roles (user_roles) is the
// "active" one reflected in profiles.role - and therefore in the JWT, once
// the client forces a token refresh after this call. Only ever switches to
// a role the account was actually granted; never creates a new grant.
export async function POST(request: Request) {
  const user = await requireUser();

  const body = await request.json();
  const parsed = switchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { role } = parsed.data;
  const admin = createAdminClient();

  const { data: grant } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", role)
    .maybeSingle();

  if (!grant) {
    return NextResponse.json(
      { error: `This account doesn't have ${role} access.` },
      { status: 403 },
    );
  }

  const { error } = await admin.from("profiles").update({ role }).eq("id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ role });
}
