import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderProposalPdf } from "@/lib/pdf";
import { generateVerificationCode, hashCode, expiryDate } from "@/lib/access-grant";
import { clientVerificationEmail, clientDeliveryEmail, sendMail } from "@/lib/email";
import { formatFullName } from "@/lib/names";
import type { Database } from "@/lib/supabase/database.types";

type Proposal = Database["public"]["Tables"]["proposals"]["Row"];
type Section = Database["public"]["Tables"]["proposal_sections"]["Row"];
type Admin = ReturnType<typeof createAdminClient>;

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// Extracted from the original approve/route.ts (which used to inline all of
// this) so the exact same client-delivery pipeline can be re-triggered on
// demand via the salesperson's "Resend to Client" button, not just once,
// automatically, at approval time.

export async function generateAndStorePdf(admin: Admin, proposal: Proposal, sections: Section[]): Promise<boolean> {
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
export async function createAccessGrant(admin: Admin, proposal: Proposal) {
  const code = generateVerificationCode();
  const { error } = await admin.from("access_grants").insert({
    proposal_id: proposal.id,
    client_email: proposal.client_email ?? "",
    verification_code_hash: hashCode(code),
    expires_at: expiryDate().toISOString(),
  });
  return { code, error };
}

export async function sendVerificationEmail(
  admin: Admin,
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
  const result = await sendMail({ to: proposal.client_email, subject, html, displayName: senderDisplayName, replyTo, cc: replyTo });
  await admin.from("delivery_log").insert({
    proposal_id: proposal.id,
    event_type: "access_code_sent",
    status: result.success ? "success" : "failed",
    detail: result.detail,
  });
}

export async function sendClientDeliveryNotification(
  admin: Admin,
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
  const result = await sendMail({ to: proposal.client_email, ...deliveryContent, displayName: senderDisplayName, replyTo, cc: replyTo });
  await admin.from("delivery_log").insert({
    proposal_id: proposal.id,
    event_type: "client_notification_sent",
    status: result.success ? "success" : "failed",
    detail: result.detail,
  });
}

// The full client-facing delivery pipeline: (re)generate the PDF, issue a
// FRESH access grant (a new code - see progress.md, any previously sent code
// stops being the "latest" grant and stops matching), and send both
// client-facing emails. Used both by the automatic send on approval and by
// the salesperson's manual "Resend to Client" action - one implementation,
// two call sites, so they can never drift apart.
export async function sendToClient(admin: Admin, proposal: Proposal, sections: Section[]): Promise<boolean> {
  const [pdfUploaded, grantResult, salesperson] = await Promise.all([
    generateAndStorePdf(admin, proposal, sections),
    createAccessGrant(admin, proposal),
    admin.from("profiles").select("id, email").eq("id", proposal.created_by).single().then((r) => r.data),
  ]);

  // Decision #21 (progress.md): client-facing emails show the salesperson's
  // name as display name with their real email as Reply-To.
  const senderDisplayName = proposal.salesperson_name
    ? `${proposal.salesperson_name} via Koya Talent`
    : "Koya Talent";
  const replyTo = salesperson?.email;

  await Promise.all([
    sendVerificationEmail(admin, proposal, grantResult, senderDisplayName, replyTo),
    sendClientDeliveryNotification(admin, proposal, senderDisplayName, replyTo),
  ]);

  return pdfUploaded;
}
