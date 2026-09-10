import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Decision #41 (progress.md): the client never sets this themselves - only
// the salesperson who owns the proposal, tracking what actually happened
// after delivery. Allowed transitions: pending->accepted, pending->rejected,
// rejected->accepted (client came back around after pushback). Starting a
// reproposal is only allowed while this is `rejected` (the user's explicit
// call) - that action is a SEPARATE endpoint (start-reproposal, no approver
// gate) and drives the proposal's own awaiting_reproposal/reproposal_sent
// states, not this column - it does reset this column back to `pending`,
// but as a side effect of that endpoint, not this one.
const bodySchema = z.object({
  status: z.enum(["accepted", "rejected"]),
});

const ALLOWED_FROM: Record<"accepted" | "rejected", string[]> = {
  rejected: ["pending"],
  accepted: ["pending", "rejected"],
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("salesperson");
  const { id } = await params;

  const body = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { status } = parsed.data;

  const supabase = await createClient();

  const { data: proposal } = await supabase
    .from("proposals")
    .select("id, created_by, status, client_response_status")
    .eq("id", id)
    .single();

  if (!proposal || proposal.created_by !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (proposal.status !== "approved") {
    return NextResponse.json({ error: "Only an approved proposal has a client response to set." }, { status: 400 });
  }

  const currentStatus = proposal.client_response_status ?? "pending";
  if (!ALLOWED_FROM[status].includes(currentStatus)) {
    return NextResponse.json(
      { error: `Can't move client response from "${currentStatus}" to "${status}".` },
      { status: 400 },
    );
  }

  // Concurrency guard: same atomic conditional-update pattern as every other
  // state-changing write in this app.
  const { data: updated, error } = await supabase
    .from("proposals")
    .update({ client_response_status: status })
    .eq("id", id)
    .eq("client_response_status", currentStatus)
    .select()
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "This changed elsewhere - refresh and try again." }, { status: 409 });
  }

  return NextResponse.json({ proposal: updated });
}
