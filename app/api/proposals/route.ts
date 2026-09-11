import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { intakeFormSchema } from "@/lib/proposal/schema";
import {
  CONTENT_FIELDS,
  MIN_CONTENT_FIELDS_TO_GENERATE,
  runStructuralCheck,
  SECTION_ORDER,
} from "@/lib/proposal/sections";
import { generateProposalSections } from "@/lib/anthropic";
import { generationCompleteEmail, sendMail } from "@/lib/email";
import { extractTranscriptText, isSupportedTranscriptFile } from "@/lib/proposal/transcript-parser";
import type { SectionKey } from "@/lib/supabase/database.types";

// Stage 1-3: create the proposal, run Check A, and (if enough sections
// qualify) run the single batched Claude generation call.
export async function POST(request: Request) {
  const user = await requireRole("salesperson");

  const formData = await request.formData();
  const rawFields: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") rawFields[key] = value;
  }

  const transcriptFile = formData.get("call_transcript_file");
  let transcriptText = "";
  if (transcriptFile instanceof File && transcriptFile.size > 0) {
    if (!isSupportedTranscriptFile(transcriptFile.name)) {
      return NextResponse.json(
        { error: "Unsupported transcript file type - use .txt, .docx, or .pdf." },
        { status: 400 },
      );
    }
    try {
      transcriptText = await extractTranscriptText(transcriptFile);
    } catch (err) {
      return NextResponse.json(
        { error: `Could not read the transcript file: ${err instanceof Error ? err.message : "unknown error"}` },
        { status: 400 },
      );
    }
  }

  const parsed = intakeFormSchema.safeParse({ ...rawFields, call_transcript: transcriptText });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const values = parsed.data;

  // Change (progress.md, 2026-09-10): what was previously a silent fallback
  // (create the draft anyway, mark every section `missing`) is now a hard
  // rejection before any row is even created - matches the client-side rule
  // on the intake form. Revises decision #33's original behavior.
  //
  // Gate is on filled CONTENT_FIELDS directly (not qualifying sections below,
  // a different count used only to decide which sections Claude generates) -
  // corrected from an earlier "2" threshold that also didn't match this
  // measure, per the user's explicit correction.
  const filledContentFieldCount = CONTENT_FIELDS.filter((f) => values[f].trim().length > 0).length;
  if (filledContentFieldCount < MIN_CONTENT_FIELDS_TO_GENERATE) {
    return NextResponse.json(
      {
        error: `At least ${MIN_CONTENT_FIELDS_TO_GENERATE} proposal content fields need something written in them before you can generate a proposal.`,
      },
      { status: 400 },
    );
  }

  const structuralCheck = runStructuralCheck(values);
  const qualifyingSections = SECTION_ORDER.filter((s) => structuralCheck[s].passed);

  const supabase = await createClient();

  const { data: proposal, error: insertError } = await supabase
    .from("proposals")
    .insert({
      created_by: user.id,
      status: "draft",
      client_first_name: values.client_first_name,
      client_last_name: values.client_last_name,
      client_email: values.client_email,
      company_name: values.company_name,
      date_of_call: values.date_of_call,
      // Decision #45: never accepted from the client - always the logged-in
      // salesperson's own account name.
      salesperson_name: user.fullName,
      proposed_timeline: values.proposed_timeline || null,
      estimated_pricing: values.estimated_pricing || null,
      client_needs_summary: values.client_needs_summary || null,
      project_scope: values.project_scope || null,
      goals_and_objectives: values.goals_and_objectives || null,
      recommended_services: values.recommended_services || null,
      call_transcript: values.call_transcript || null,
    })
    .select()
    .single();

  if (insertError || !proposal) {
    return NextResponse.json({ error: insertError?.message ?? "Failed to create proposal" }, { status: 500 });
  }

  // filledContentFieldCount >= MIN_CONTENT_FIELDS_TO_GENERATE is guaranteed
  // here (checked above, before the row was even created) - always generate.
  //
  // Claude being down/erroring here used to crash the request unhandled,
  // leaving the just-inserted proposal row behind with no sections - a
  // broken, permanently-empty draft the salesperson had no way to fix. Now
  // caught explicitly: the orphaned row is deleted so the salesperson just
  // sees a clean "try again" instead of a dead proposal cluttering their list.
  let generated;
  try {
    generated = await generateProposalSections(
      { ...values, salesperson_name: user.fullName },
      qualifyingSections,
    );
  } catch (err) {
    await supabase.from("proposals").delete().eq("id", proposal.id);
    return NextResponse.json(
      { error: "Claude isn't responding right now. Nothing was saved - try again in a moment." },
      { status: 502 },
    );
  }

  const generatedByKey = new Map(generated.map((g) => [g.section_key, g]));

  const sectionRows = SECTION_ORDER.map((sectionKey: SectionKey) => {
    const passedCheckA = structuralCheck[sectionKey].passed;
    const generatedSection = generatedByKey.get(sectionKey);

    if (passedCheckA && generatedSection) {
      return {
        proposal_id: proposal.id,
        section_key: sectionKey,
        content: generatedSection.content,
        source_fields: generatedSection.source_fields,
        generation_status: generatedSection.generation_status,
        scanty_reason: generatedSection.scanty_reason,
        version: 1,
        regeneration_count: 0,
      };
    }

    return {
      proposal_id: proposal.id,
      section_key: sectionKey,
      content: null,
      source_fields: [],
      generation_status: "missing" as const,
      scanty_reason: null,
      version: 1,
      regeneration_count: 0,
    };
  });

  const { error: sectionsError } = await supabase.from("proposal_sections").insert(sectionRows);

  if (sectionsError) {
    return NextResponse.json(
      { error: `Proposal created but sections failed to save: ${sectionsError.message}` },
      { status: 500 },
    );
  }

  const { subject, html } = generationCompleteEmail({
    proposalId: proposal.id,
    companyName: values.company_name,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  });
  const result = await sendMail({ to: user.email, subject, html });

  const admin = createAdminClient();
  await admin.from("notifications").insert({
    recipient_user_id: user.id,
    proposal_id: proposal.id,
    event_type: "generation_complete",
    status: result.success ? "success" : "failed",
  });

  return NextResponse.json({ id: proposal.id, generated: true });
}
