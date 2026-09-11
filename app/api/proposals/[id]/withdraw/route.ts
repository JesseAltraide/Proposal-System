import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withdrawSchema } from "@/lib/proposal/schema";
import { withdrawnEmail, sendMail } from "@/lib/email";

// Salesperson pulls a proposal back out of an approver's queue, before a
// decision has been made - only allowed from `pending_approval` (not
// `reproposal_sent`, a deliberately narrower scope than reject/submit's
// shared handling of both cycles - a withdrawn reproposal would need to go
// back to `awaiting_reproposal`, not `draft`, which is a different enough
// case that it's left out for now rather than assumed). Requires a reason,
// same discipline as a rejection, and notifies every current approver with
// that reason attached - the same "who to notify" pattern already used by
// the submit route.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("salesperson");
  const { id } = await params;

  const body = await request.json();
  const parsed = withdrawSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { reason } = parsed.data;

  const supabase = await createClient();
  const { data: proposal } = await supabase.from("proposals").select("*").eq("id", id).single();
  if (!proposal || proposal.created_by !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Concurrency guard: same atomic conditional-update pattern as every other
  // state-changing write in this app - if an approver decides it in the same
  // instant, only one of the two actions can actually land.
  const { data: updated, error } = await supabase
    .from("proposals")
    .update({ status: "draft", withdrawal_reason: reason })
    .eq("id", id)
    .eq("status", "pending_approval")
    .select()
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { error: "Can only withdraw a proposal that's still waiting on an approval decision - refresh and try again." },
      { status: 409 },
    );
  }

  const admin = createAdminClient();
  const { data: approvers } = await admin.from("profiles").select("id, email").eq("role", "approver");

  const { subject, html } = withdrawnEmail({
    companyName: proposal.company_name ?? "",
    salespersonName: proposal.salesperson_name ?? "",
    reason,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  });

  for (const approver of approvers ?? []) {
    const result = await sendMail({ to: approver.email, subject, html });
    await admin.from("notifications").insert({
      recipient_user_id: approver.id,
      proposal_id: id,
      event_type: "withdrawn",
      status: result.success ? "success" : "failed",
    });
  }

  return NextResponse.json({ proposal: updated });
}
