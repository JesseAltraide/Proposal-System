import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/email";

const grantSchema = z.object({ role: z.enum(["salesperson", "approver", "admin"]) });

// Grants an ADDITIONAL role onto an account that already exists - the
// counterpart to /api/admin/invite, which now only ever creates brand-new
// accounts. Deliberately takes no name fields at all: the person's name is
// already on file in `profiles`, so there's nothing to re-enter and nothing
// that could accidentally drift if someone typed it differently the second
// time around (the actual risk that prompted splitting this into its own
// endpoint, rather than reusing the invite form for existing emails).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const { id } = await params;

  const body = await request.json();
  const parsed = grantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { role } = parsed.data;

  const admin = createAdminClient();

  const { data: profile } = await admin.from("profiles").select("id, email").eq("id", id).single();
  if (!profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: existingRole } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", id)
    .eq("role", role)
    .maybeSingle();

  if (existingRole) {
    return NextResponse.json(
      { error: `${profile.email} already has ${role} access.` },
      { status: 409 },
    );
  }

  const { error: grantError } = await admin.from("user_roles").insert({ user_id: id, role });
  if (grantError) {
    return NextResponse.json({ error: grantError.message }, { status: 500 });
  }

  await sendMail({
    to: profile.email,
    subject: `You now have ${role} access on Koya Proposal App`,
    html: `<p>Your account (${profile.email}) has been granted <strong>${role}</strong> access, in addition to any role you already had.</p><p>Switch to it any time from the role switcher in the app's nav bar.</p>`,
  });

  return NextResponse.json({ granted: role });
}
