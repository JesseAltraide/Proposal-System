import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rejectSchema } from "@/lib/proposal/schema";
import { rejectedEmail, sendMail } from "@/lib/email";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const approver = await requireRole("approver");
  const { id } = await params;

  const body = await request.json();
  const parsed = rejectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { note } = parsed.data;

  const supabase = await createClient();

  const { data: proposal } = await supabase.from("proposals").select("*").eq("id", id).single();
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Enforced server-side regardless of role - see approve/route.ts.
  if (proposal.created_by === approver.id) {
    return NextResponse.json({ error: "You cannot reject your own proposal." }, { status: 403 });
  }

  // A rejected reproposal (reproposal_sent) goes back to awaiting_reproposal,
  // not draft - it stays inside its own reproposal cycle rather than being
  // relabeled as a brand-new submission.
  const isReproposal = proposal.status === "reproposal_sent";
  const fromStatus = isReproposal ? "reproposal_sent" : "pending_approval";
  const backToStatus = isReproposal ? "awaiting_reproposal" : "draft";

  // Concurrency guard: same pattern as approve - only one decision can land.
  // Runs on the admin client - see progress.md's Errors & Fixes log /
  // approve/route.ts: the approver's SELECT policy doesn't cover `draft`
  // rows, so `.select()` on this UPDATE would fail its RETURNING re-fetch
  // and PostgREST would roll back the whole UPDATE.
  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("proposals")
    .update({ status: backToStatus, approver_note: note })
    .eq("id", id)
    .eq("status", fromStatus)
    .select()
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "Already decided by another approver." }, { status: 409 });
  }

  await admin.from("approvals").insert({
    proposal_id: id,
    approver_id: approver.id,
    decision: "rejected",
    note,
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { subject, html } = rejectedEmail({
    proposalId: id,
    companyName: proposal.company_name ?? "",
    note,
    appUrl,
  });

  const { data: salesperson } = await admin.from("profiles").select("id, email").eq("id", proposal.created_by).single();
  const sendResult = salesperson
    ? await sendMail({ to: salesperson.email, subject, html })
    : { success: false, detail: "Salesperson profile not found" };

  await admin.from("notifications").insert({
    recipient_user_id: proposal.created_by,
    proposal_id: id,
    event_type: "rejected",
    status: sendResult.success ? "success" : "failed",
  });

  return NextResponse.json({ proposal: updated });
}
