import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidNamePart } from "@/lib/names";
import { sendMail } from "@/lib/email";

const nameSchema = z.string().min(1).refine(isValidNamePart, "Must be letters only, no numbers");

const inviteSchema = z.object({
  email: z.string().email(),
  firstName: nameSchema,
  lastName: nameSchema,
  role: z.enum(["salesperson", "approver"]),
});

// Only an existing approver can invite new users (salespeople or more
// approvers) - matches Stage 0: the seeded admin/approver is the one
// onboarding everyone else, per full-flow.md.
export async function POST(request: Request) {
  await requireRole("approver");

  const body = await request.json();
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, firstName, lastName, role } = parsed.data;
  const admin = createAdminClient();

  // One email = one Supabase Auth account, but that account can hold BOTH
  // a salesperson and an approver role (see 0007_multi_role_accounts.sql) -
  // just never the same role twice. If this email already has an account,
  // grant the new role onto it instead of trying to create a second one
  // (which Supabase Auth would reject anyway on email uniqueness).
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingProfile) {
    const { data: existingRole } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", existingProfile.id)
      .eq("role", role)
      .maybeSingle();

    if (existingRole) {
      return NextResponse.json(
        { error: `${email} already has ${role} access - can't grant the same role twice.` },
        { status: 409 },
      );
    }

    const { error: grantError } = await admin
      .from("user_roles")
      .insert({ user_id: existingProfile.id, role });

    if (grantError) {
      return NextResponse.json({ error: grantError.message }, { status: 500 });
    }

    await sendMail({
      to: email,
      subject: `You now have ${role} access on Koya Proposal App`,
      html: `<p>Your existing account (${email}) has been granted <strong>${role}</strong> access, in addition to any role you already had.</p><p>Switch to it any time from the role switcher in the app's nav bar.</p>`,
    });

    return NextResponse.json({ granted: role, existingAccount: true });
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { first_name: firstName, last_name: lastName, role },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ user: data.user });
}
