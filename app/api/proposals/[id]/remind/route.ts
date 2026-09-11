import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { approvalRequestedEmail, sendMail } from "@/lib/email";
import { getAppUrl } from "@/lib/app-url";

// Lets the salesperson nudge approvers about a proposal that's been sitting
// in pending_approval - re-sends the same approval-requested email.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("salesperson");
  const { id } = await params;

  const supabase = await createClient();
  const { data: proposal } = await supabase.from("proposals").select("*").eq("id", id).single();

  if (!proposal || proposal.created_by !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (proposal.status !== "pending_approval" && proposal.status !== "reproposal_sent") {
    return NextResponse.json({ error: "This proposal isn't waiting on approval right now." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: approvers } = await admin.from("profiles").select("id, email").eq("role", "approver");

  const appUrl = getAppUrl();
  const { subject, html } = approvalRequestedEmail({
    proposalId: id,
    clientName: `${proposal.client_first_name ?? ""} ${proposal.client_last_name ?? ""}`.trim(),
    companyName: proposal.company_name ?? "",
    salespersonName: proposal.salesperson_name ?? "",
    appUrl,
  });

  let anySuccess = false;
  for (const approver of approvers ?? []) {
    const result = await sendMail({ to: approver.email, subject: `Reminder: ${subject}`, html });
    anySuccess ||= result.success;
    await admin.from("notifications").insert({
      recipient_user_id: approver.id,
      proposal_id: id,
      event_type: "approval_reminder",
      status: result.success ? "success" : "failed",
    });
  }

  return NextResponse.json({ sent: anySuccess });
}
