import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const EDITABLE_FIELDS = [
  "client_needs_summary",
  "project_scope",
  "goals_and_objectives",
  "recommended_services",
  "proposed_timeline",
  "estimated_pricing",
  "call_transcript",
] as const;

// z.record(z.enum(EDITABLE_FIELDS), z.string()) looks right but isn't: zod
// treats a record keyed by an enum as matching TypeScript's
// Record<Enum, string> - i.e. every enum key must be present - so saving
// just one field failed validation on all the others being "missing". A
// partial object schema is the correct way to express "some subset of
// these fields, each a string if present".
const patchSchema = z.object({
  fields: z
    .object(Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, z.string()])) as Record<
      (typeof EDITABLE_FIELDS)[number],
      z.ZodString
    >)
    .partial()
    .refine((fields) => Object.keys(fields).length > 0, "At least one field is required"),
});

// Editing the underlying intake fields is allowed (this is how a `missing`
// section gets fixed, per full-flow.md Stage 4: "Fixing this means going
// back and filling the field, then regenerating that section"). This is
// distinct from the build-spec's "no free-text editing" non-goal, which
// refers to hand-editing GENERATED section content directly - that still
// only ever happens through Regenerate.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("salesperson");
  const { id } = await params;

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: proposal } = await supabase.from("proposals").select("id, created_by, status").eq("id", id).single();
  if (!proposal || proposal.created_by !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (proposal.status !== "draft" && proposal.status !== "awaiting_reproposal") {
    return NextResponse.json({ error: "Only an editable draft or reproposal can be edited" }, { status: 409 });
  }

  const { error } = await supabase.from("proposals").update(parsed.data.fields).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
