import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashCode } from "@/lib/access-grant";

const verifySchema = z.object({
  proposalId: z.string().uuid(),
  email: z.string().email(),
  code: z.string().min(6).max(6),
});

const GENERIC_ERROR = "We couldn't verify that code for this proposal. Double-check your email and code, or contact your sales rep.";

// Public endpoint - the client never authenticates with Supabase Auth at
// all. Security lives entirely here: BOTH the email match AND
// status === 'approved' must hold before anything is served, so a
// prematurely shared/guessed link stays inert regardless of how it leaked
// (progress.md decision #20).
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { proposalId, email, code } = parsed.data;

  const admin = createAdminClient();

  const { data: proposal } = await admin.from("proposals").select("id, status").eq("id", proposalId).single();
  // Must be `sent`, not just `approved` - an approved-but-not-yet-sent
  // proposal has no PDF/grant a client should ever be able to reach, even if
  // they somehow guessed the URL (approval alone no longer creates either).
  if (!proposal || proposal.status !== "sent") {
    await admin.from("delivery_log").insert({
      proposal_id: proposalId,
      event_type: "access_verified",
      status: "failed",
      detail: "Proposal not found or not approved",
    });
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 403 });
  }

  const { data: grant } = await admin
    .from("access_grants")
    .select("*")
    .eq("proposal_id", proposalId)
    .ilike("client_email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const codeMatches = grant && grant.verification_code_hash === hashCode(code);
  const notExpired = grant && new Date(grant.expires_at) > new Date();

  if (!grant || !codeMatches || !notExpired) {
    await admin.from("delivery_log").insert({
      proposal_id: proposalId,
      event_type: "access_verified",
      status: "failed",
      detail: !grant ? "No grant for this email" : !codeMatches ? "Code mismatch" : "Grant expired",
    });
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 403 });
  }

  if (!grant.verified_at) {
    await admin.from("access_grants").update({ verified_at: new Date().toISOString() }).eq("id", grant.id);
  }

  await admin.from("delivery_log").insert({ proposal_id: proposalId, event_type: "access_verified", status: "success" });

  const { data: signedUrlData, error: signedUrlError } = await admin.storage
    .from("proposal-pdfs")
    .createSignedUrl(`${proposalId}.pdf`, 60 * 10);

  if (signedUrlError || !signedUrlData) {
    await admin.from("delivery_log").insert({
      proposal_id: proposalId,
      event_type: "proposal_viewed",
      status: "failed",
      detail: signedUrlError?.message ?? "Could not create signed URL",
    });
    return NextResponse.json(
      { error: "Your proposal document isn't available right now - please contact your sales rep." },
      { status: 500 },
    );
  }

  await admin.from("delivery_log").insert({ proposal_id: proposalId, event_type: "proposal_viewed", status: "success" });

  return NextResponse.json({ url: signedUrlData.signedUrl });
}
