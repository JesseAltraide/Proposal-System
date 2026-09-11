import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendToClient } from "@/lib/delivery";

// Manual "Resend to Client" - re-runs the exact same client-delivery
// pipeline that fires automatically on approval (fresh PDF, a NEW access
// grant/code, both client-facing emails resent). Useful when the automatic
// send failed (see the failed-delivery warning already surfaced on this
// page) or the client says they lost their code. Issuing a fresh grant means
// any previously sent code stops being the latest one for this proposal and
// stops matching - see progress.md's access-grant walkthrough.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("salesperson");
  const { id } = await params;

  const supabase = await createClient();
  const { data: proposal } = await supabase.from("proposals").select("*").eq("id", id).single();
  if (!proposal || proposal.created_by !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (proposal.status !== "approved") {
    return NextResponse.json({ error: "This proposal isn't approved yet - nothing to send." }, { status: 409 });
  }

  const admin = createAdminClient();
  const { data: sections } = await admin.from("proposal_sections").select("*").eq("proposal_id", id);

  await sendToClient(admin, proposal, sections ?? []);

  return NextResponse.json({ ok: true });
}
