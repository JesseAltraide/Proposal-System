import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SECTION_ORDER } from "@/lib/proposal/sections";
import type { SectionKey } from "@/lib/supabase/database.types";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; sectionKey: string }> },
) {
  const user = await requireRole("salesperson");
  const { id, sectionKey: rawSectionKey } = await params;

  if (!SECTION_ORDER.includes(rawSectionKey as SectionKey)) {
    return NextResponse.json({ error: "Unknown section" }, { status: 404 });
  }
  const sectionKey = rawSectionKey as SectionKey;

  const supabase = await createClient();

  const { data: proposal } = await supabase.from("proposals").select("id, created_by, status").eq("id", id).single();
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

  if (!section || section.previous_content === null) {
    return NextResponse.json({ error: "Nothing to undo for this section." }, { status: 400 });
  }

  const { data: updated, error } = await supabase
    .from("proposal_sections")
    .update({
      content: section.previous_content,
      previous_content: null,
      version: section.version + 1,
      generation_status: "generated",
      scanty_reason: null,
    })
    .eq("id", section.id)
    .eq("version", section.version)
    .select()
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "This section changed elsewhere - refresh and try again." }, { status: 409 });
  }

  return NextResponse.json({ section: updated });
}
