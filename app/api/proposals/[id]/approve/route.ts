import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderProposalPdf } from "@/lib/pdf";
import { generateVerificationCode, hashCode, expiryDate } from "@/lib/access-grant";
import { approvedEmail, clientVerificationEmail, clientDeliveryEmail, sendMail } from "@/lib/email";
import { formatFullName } from "@/lib/names";
import type { Database } from "@/lib/supabase/database.types";

type Proposal = Database["public"]["Tables"]["proposals"]["Row"];
type Section = Database["public"]["Tables"]["proposal_sections"]["Row"];

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const approver = await requireRole("approver");
  const { id } = await params;

  const supabase = await createClient();

  const { data: proposal } = await supabase.from("proposals").select("*").eq("id", id).single();
  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Enforced server-side regardless of role: a proposal's creator can never
  // approve their own work, even if that user somehow holds both roles
  // (build-spec's explicit requirement - not just "lacks approver role").
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
  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("proposals")
    .update({
      status: "approved",
      // Decision #41: (re)start the client-response tracking cycle on every
      // approval, including re-approvals after a Stage 8 reproposal.
      client_response_status: "pending",
      approved_at: new Date().toISOString(),
      last_client_response_reminder_at: null,
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

  const { data: sections } = await admin.from("proposal_sections").select("*").eq("proposal_id", id);

  await runDeliveryPipeline(admin, updated, sections ?? []);

  return NextResponse.json({ proposal: updated });
}

// Performance note (progress.md, 2026-09-10): this used to await the PDF
// render, the access grant insert, and all three emails one after another -
// every Approve click paid for the full sum of their latencies in series.
// None of these actually depend on each other except "verification email
// needs the access grant's code" and "the two client emails need the
// salesperson's reply-to address" - so the independent groups below run
// concurrently via Promise.all instead. Each step still logs its own
// success/failure to delivery_log/notifications exactly as before; only the
// ordering changed, not the recorded outcome of any individual step.
async function runDeliveryPipeline(
  admin: ReturnType<typeof createAdminClient>,
  proposal: Proposal,
  sections: Section[],
) {
  const [pdfUploaded, grantResult, salesperson] = await Promise.all([
    generateAndStorePdf(admin, proposal, sections),
    createAccessGrant(admin, proposal),
    admin.from("profiles").select("id, email").eq("id", proposal.created_by).single().then((r) => r.data),
  ]);

  // Decision #21 (progress.md): client-facing emails show the salesperson's
  // name as display name with their real email as Reply-To - the "verified
  // company domain" half of that decision isn't achievable under Gmail SMTP
  // (decision #23's named limitation), but display name + Reply-To still are.
  const senderDisplayName = proposal.salesperson_name
    ? `${proposal.salesperson_name} via Koya Talent`
    : "Koya Talent";
  const replyTo = salesperson?.email;

  await Promise.all([
    sendVerificationEmail(admin, proposal, grantResult, senderDisplayName, replyTo),
    sendClientDeliveryNotification(admin, proposal, senderDisplayName, replyTo),
    sendApprovedNotification(admin, proposal, salesperson),
  ]);

  return pdfUploaded;
}

async function generateAndStorePdf(
  admin: ReturnType<typeof createAdminClient>,
  proposal: Proposal,
  sections: Section[],
): Promise<boolean> {
  try {
    const pdfBuffer = await renderProposalPdf(proposal, sections);
    const { error: uploadError } = await admin.storage
      .from("proposal-pdfs")
      .upload(`${proposal.id}.pdf`, pdfBuffer, { contentType: "application/pdf", upsert: true });

    if (uploadError) throw uploadError;
    await admin.from("delivery_log").insert({ proposal_id: proposal.id, event_type: "pdf_generated", status: "success" });
    return true;
  } catch (err) {
    await admin.from("delivery_log").insert({
      proposal_id: proposal.id,
      event_type: "pdf_generated",
      status: "failed",
      detail: err instanceof Error ? err.message : "Unknown PDF generation error",
    });
    return false;
  }
}

// Safe to run independently of the PDF step - the verification endpoint
// checks status === 'approved' regardless, see progress.md decision #20.
async function createAccessGrant(admin: ReturnType<typeof createAdminClient>, proposal: Proposal) {
  const code = generateVerificationCode();
  const { error } = await admin.from("access_grants").insert({
    proposal_id: proposal.id,
    client_email: proposal.client_email ?? "",
    verification_code_hash: hashCode(code),
    expires_at: expiryDate().toISOString(),
  });
  return { code, error };
}

async function sendVerificationEmail(
  admin: ReturnType<typeof createAdminClient>,
  proposal: Proposal,
  grantResult: { code: string; error: { message: string } | null },
  senderDisplayName: string,
  replyTo: string | undefined,
) {
  if (grantResult.error) {
    await admin.from("delivery_log").insert({
      proposal_id: proposal.id,
      event_type: "access_code_sent",
      status: "failed",
      detail: grantResult.error.message,
    });
    return;
  }
  if (!proposal.client_email) return;

  const { subject, html } = clientVerificationEmail({
    companyName: proposal.company_name ?? "",
    code: grantResult.code,
    appUrl: appUrl(),
    proposalId: proposal.id,
  });
  const result = await sendMail({ to: proposal.client_email, subject, html, displayName: senderDisplayName, replyTo });
  await admin.from("delivery_log").insert({
    proposal_id: proposal.id,
    event_type: "access_code_sent",
    status: result.success ? "success" : "failed",
    detail: result.detail,
  });
}

async function sendClientDeliveryNotification(
  admin: ReturnType<typeof createAdminClient>,
  proposal: Proposal,
  senderDisplayName: string,
  replyTo: string | undefined,
) {
  if (!proposal.client_email) return;

  const deliveryContent = clientDeliveryEmail({
    clientName: formatFullName(proposal.client_first_name ?? "", proposal.client_last_name ?? ""),
    companyName: proposal.company_name ?? "",
    salespersonName: proposal.salesperson_name ?? "",
    proposalId: proposal.id,
    appUrl: appUrl(),
  });
  const result = await sendMail({ to: proposal.client_email, ...deliveryContent, displayName: senderDisplayName, replyTo });
  await admin.from("delivery_log").insert({
    proposal_id: proposal.id,
    event_type: "client_notification_sent",
    status: result.success ? "success" : "failed",
    detail: result.detail,
  });
}

async function sendApprovedNotification(
  admin: ReturnType<typeof createAdminClient>,
  proposal: Proposal,
  salesperson: { id: string; email: string } | null,
) {
  const { subject, html } = approvedEmail({
    proposalId: proposal.id,
    companyName: proposal.company_name ?? "",
    appUrl: appUrl(),
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
