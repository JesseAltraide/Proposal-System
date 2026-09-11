import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { regenerateSchema } from "@/lib/proposal/schema";
import { missingFieldsForSection, FIELD_LABELS, SECTION_ORDER } from "@/lib/proposal/sections";
import { generateProposalSections } from "@/lib/anthropic";
import type { SectionKey } from "@/lib/supabase/database.types";

// See app/api/proposals/route.ts for why this matters - same reasoning
// applies here, this route calls Claude too.
export const maxDuration = 60;

const REGEN_CAP = 5;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; sectionKey: string }> },
) {
  const user = await requireRole("salesperson");
  const { id, sectionKey: rawSectionKey } = await params;

  if (!SECTION_ORDER.includes(rawSectionKey as SectionKey)) {
    return NextResponse.json({ error: "Unknown section" }, { status: 404 });
  }
  const sectionKey = rawSectionKey as SectionKey;

  const body = await request.json();
  const parsed = regenerateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { comment, expectedVersion } = parsed.data;

  const supabase = await createClient();

  const { data: proposal } = await supabase.from("proposals").select("*").eq("id", id).single();
  if (!proposal || proposal.created_by !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (proposal.status !== "draft") {
    return NextResponse.json({ error: "This proposal is not editable right now" }, { status: 409 });
  }

  const { data: section } = await supabase
    .from("proposal_sections")
    .select("*")
    .eq("proposal_id", id)
    .eq("section_key", sectionKey)
    .single();

  if (!section) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }
  if (section.version !== expectedVersion) {
    return NextResponse.json(
      { error: "This section changed elsewhere - refresh and try again." },
      { status: 409 },
    );
  }
  if (section.regeneration_count >= REGEN_CAP) {
    return NextResponse.json({ error: "Regeneration limit reached for this section." }, { status: 400 });
  }
  // Attempt number about to be made (regeneration_count is attempts already used).
  const attemptNumber = section.regeneration_count + 1;
  if (attemptNumber >= REGEN_CAP && comment.trim().length === 0) {
    return NextResponse.json(
      { error: "Add context in the comment field - required on the final regeneration attempt." },
      { status: 400 },
    );
  }

  // Re-run Check A against current field values - a previously `missing`
  // section can now qualify if the salesperson just edited the source field.
  const key = sectionKey as SectionKey;
  const stillMissing = missingFieldsForSection(key, proposal);
  if (stillMissing.length > 0) {
    return NextResponse.json(
      {
        error: `Still missing: ${stillMissing.map((f) => FIELD_LABELS[f]).join(", ")}`,
      },
      { status: 400 },
    );
  }

  // Claude being down/erroring used to crash the request unhandled. Caught
  // explicitly now - the existing section content is untouched either way
  // (the update below only runs once Claude actually returns something), so
  // this is just about giving a real "Claude isn't responding" message
  // instead of a generic failure.
  let generated;
  try {
    [generated] = await generateProposalSections(proposal, [key], comment || undefined);
  } catch (err) {
    return NextResponse.json(
      { error: "Claude isn't responding right now. Your existing content is unchanged - try again in a moment." },
      { status: 502 },
    );
  }
  if (!generated) {
    return NextResponse.json({ error: "Claude did not return content for this section." }, { status: 502 });
  }

  // Concurrency guard: single conditional UPDATE keyed on the version we
  // just read. If another request regenerated this section in the meantime,
  // this affects zero rows and we tell the caller to refresh rather than
  // silently overwriting their concurrent change.
  const { data: updated, error: updateError } = await supabase
    .from("proposal_sections")
    .update({
      previous_content: section.content,
      content: generated.content,
      generation_status: generated.generation_status,
      scanty_reason: generated.scanty_reason,
      source_fields: generated.source_fields,
      suggestions: generated.suggestions,
      version: section.version + 1,
      regeneration_count: section.regeneration_count + 1,
    })
    .eq("id", section.id)
    .eq("version", expectedVersion)
    .select()
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: "This section changed elsewhere - refresh and try again." },
      { status: 409 },
    );
  }

  return NextResponse.json({ section: updated });
}
