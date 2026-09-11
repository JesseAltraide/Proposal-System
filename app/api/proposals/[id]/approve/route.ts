import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { approvedEmail, sendMail } from "@/lib/email";
import { getAppUrl } from "@/lib/app-url";
import type { Database } from "@/lib/supabase/database.types";

type Proposal = Database["public"]["Tables"]["proposals"]["Row"];

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const approver = await requireRole("approver");
  const { id } = await params;

  const supabase = await createClient();

  const { data: proposal } = await supabase.from("proposals").select("*").eq("id", id).single();
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Enforced server-side regardless of role: a proposal's creator can never
  // approve their own work, even if that user somehow holds both roles
  // (build-spec's explicit requirement - not just "lacks approver role").
  // Enforced server-side regardless of role: a proposal's creator can never
  // approve their own work, even if that user somehow holds both roles
  // (build-spec's explicit requirement - not just "lacks approver role").
  // With #57's multi-role accounts, "same email holds both roles" collapses
  // to "same account ID", so this ID check alone already covers that case -
  // no separate role-history check needed. The remaining open case (decision
  // #40) is the SAME human holding TWO SEPARATE accounts/emails, which is
  // not detectable this way - see progress.md, flagged as a question, not
  // solved here.
  if (proposal.created_by === approver.id) {
    return NextResponse.json({ error: "You cannot approve your own proposal." }, { status: 403 });
  }

  // Concurrency guard: only one of two near-simultaneous approve/reject
  // requests can win - the loser affects zero rows and is told it's already
  // decided, which is exactly what stops this pipeline from firing twice.
  //
  // Runs on the ADMIN client, not the user's session client - see
  // progress.md's Errors & Fixes log: RLS's SELECT policy for approvers only
  // covers `pending_approval`/`client_rejected` rows, so `.select()` chained
  // onto this UPDATE (needed for its RETURNING data) would fail to see the
  // row once its status flips to `approved`, and PostgREST rolls back the
  // ENTIRE transaction when that happens - silently undoing the UPDATE even
  // though the WHERE clause matched. RLS's job here is row visibility for
  // browsing (decision #31), not gating an already-authorized, already
  // concurrency-guarded mutation.
  // Approval no longer auto-sends anything to the client (user's explicit
  // change) - it only records the decision and lets the salesperson know.
  // client_response_status/last_client_response_reminder_at are NOT reset
  // here anymore either - those only make sense once the proposal is
  // actually `sent` (see send-to-client/route.ts), not merely `approved`.
  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("proposals")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .in("status", ["pending_approval", "reproposal_sent"])
    .select()
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "Already decided by another approver." }, { status: 409 });
  }

  await admin.from("approvals").insert({
    proposal_id: id,
    approver_id: approver.id,
    decision: "approved",
  });

  const { data: salesperson } = await admin
    .from("profiles")
    .select("id, email")
    .eq("id", updated.created_by)
    .single();

  await sendApprovedNotification(admin, updated, salesperson);

  return NextResponse.json({ proposal: updated });
}

async function sendApprovedNotification(
  admin: ReturnType<typeof createAdminClient>,
  proposal: Proposal,
  salesperson: { id: string; email: string } | null,
) {
  const { subject, html } = approvedEmail({
    proposalId: proposal.id,
    companyName: proposal.company_name ?? "",
    appUrl: getAppUrl(),
  });

  const result = salesperson
    ? await sendMail({ to: salesperson.email, subject, html })
    : { success: false, detail: "Salesperson profile not found" };

  await admin.from("notifications").insert({
    recipient_user_id: proposal.created_by,
    proposal_id: proposal.id,
    event_type: "approved",
    status: result.success ? "success" : "failed",
  });
}
