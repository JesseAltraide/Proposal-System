import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { approvalRequestedEmail, sendMail } from "@/lib/email";
import { formatFullName } from "@/lib/names";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("salesperson");
  const { id } = await params;

  const supabase = await createClient();

  const { data: proposal } = await supabase.from("proposals").select("*").eq("id", id).single();
  if (!proposal || proposal.created_by !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: sections } = await supabase
    .from("proposal_sections")
    .select("generation_status")
    .eq("proposal_id", id);

  const hasMissing = sections?.some((s) => s.generation_status === "missing");
  if (hasMissing) {
    return NextResponse.json(
      { error: "Cannot submit while sections are missing required fields." },
      { status: 400 },
    );
  }

  // A first-time submission (draft -> pending_approval) and a reproposal
  // resubmission (awaiting_reproposal -> reproposal_sent) share this same
  // endpoint - the reproposal keeps its own status so the approver's queue
  // and the salesperson's dashboard can both tell which cycle it's in.
  const isReproposal = proposal.status === "awaiting_reproposal";
  const fromStatus = isReproposal ? "awaiting_reproposal" : "draft";
  const toStatus = isReproposal ? "reproposal_sent" : "pending_approval";

  // Concurrency guard: only a proposal still in the expected pre-submit
  // status can move forward - prevents a double-submit race from firing the
  // approver notification twice.
  const { data: updated, error } = await supabase
    .from("proposals")
    .update({ status: toStatus, approver_note: null })
    .eq("id", id)
    .eq("status", fromStatus)
    .select()
    .single();

  if (error || !updated) {
    return NextResponse.json(
      { error: "This proposal's state has changed - refresh and try again." },
      { status: 409 },
    );
  }

  const admin = createAdminClient();
  const { data: approvers } = await admin.from("profiles").select("id, email").eq("role", "approver");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { subject, html } = approvalRequestedEmail({
    proposalId: id,
    clientName: formatFullName(proposal.client_first_name ?? "", proposal.client_last_name ?? ""),
    companyName: proposal.company_name ?? "",
    salespersonName: proposal.salesperson_name ?? "",
    appUrl,
  });

  for (const approver of approvers ?? []) {
    const result = await sendMail({ to: approver.email, subject, html });
    await admin.from("notifications").insert({
      recipient_user_id: approver.id,
      proposal_id: id,
      event_type: "approval_requested",
      status: result.success ? "success" : "failed",
    });
  }

  return NextResponse.json({ proposal: updated });
}
