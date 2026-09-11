import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { SECTION_ORDER } from "@/lib/proposal/sections";
import { formatFullName } from "@/lib/names";
import type { GenerationStatus, SectionKey } from "@/lib/supabase/database.types";

// Superset of the client-submitted intake fields plus server-derived ones
// (salesperson_name - auto-filled from the account, never client-submitted;
// see decision #45). Accepts nullable values too, since callers regenerating
// from a DB row shouldn't have to normalize first.
type GenerationInput = {
  client_first_name?: string | null;
  client_last_name?: string | null;
  client_email?: string | null;
  company_name?: string | null;
  date_of_call?: string | null;
  salesperson_name?: string | null;
  proposed_timeline?: string | null;
  estimated_pricing?: string | null;
  client_needs_summary?: string | null;
  project_scope?: string | null;
  goals_and_objectives?: string | null;
  recommended_services?: string | null;
  call_transcript?: string | null;
};

// Decision #32 (progress.md): Sonnet 5 - client-facing content plus a
// genuinely qualitative "scanty" judgment call justified the quality/cost
// trade-off over Haiku 4.5.
const MODEL = "claude-sonnet-5";

export interface GeneratedSection {
  section_key: SectionKey;
  content: string;
  generation_status: Extract<GenerationStatus, "generated" | "scanty">;
  scanty_reason: string | null;
  source_fields: string[];
}

const SYSTEM_PROMPT = `You are drafting sections of a client-facing sales proposal for Koya Talent, a professional services company. You will be given intake fields from a completed sales call and, optionally, a call transcript. You must draft ONLY the sections listed in the request (sections with missing required fields are never sent to you).

Follow this three-category rule strictly:

CATEGORY 1 - Names, dates, pricing, timeline figures (client_name, company_name, date_of_call, salesperson_name, proposed_timeline, estimated_pricing): pass through VERBATIM wherever they appear. Never rewrite, rephrase, round, or reformat these values.

CATEGORY 2 - client_needs_summary, project_scope, goals_and_objectives, and transcript excerpts: expand into clear, professional prose. You may rephrase and organize, but introduce NO new claims, numbers, or commitments beyond what is stated in the source material.

CATEGORY 3 - recommended_approach and deliverables content: you may genuinely generate substantive content here, but every claim must be traceable back to recommended_services plus the stated needs/goals. Never invent a service, technology, or deliverable that was not named or clearly implied by the source fields.

For EVERY section you draft, also make a judgment call: is the underlying source material for this section merely present, or is it actually unusable to draft from responsibly? Two distinct failure modes both count as "scanty," not just one:
1. THIN - a fact or method stated with no reasoning connecting it to the client's goals, or a one-line scope with no real detail. This is about depth of reasoning, not wordiness.
2. INCOHERENT - the field is filled in, but its content is not coherent English: gibberish, random keystrokes, a single unrelated word, a different language where English was expected, or text that does not actually describe anything about the client's needs, scope, goals, or services. Do NOT try to guess at plausible-sounding meaning behind incoherent input, invent a sensible-looking interpretation of it, or quietly paper over it with generic proposal language - if a field does not read as real, meaningful English describing the stated topic, treat that section as scanty on that basis and say so plainly in scanty_reason (e.g. "the Project Scope field does not contain coherent English - it reads as random characters, not a description of what's being built").

If thin, give a one-sentence scanty_reason explaining specifically what's missing (e.g. "recommended approach is named but no stated reasoning connects it to the client's stated goals"). If incoherent, say so explicitly per the rule above, naming which field(s). If the source material is genuinely sufficient and coherent, mark the section "generated" with scanty_reason null.

Also report source_fields: the list of intake field names (and "call_transcript" if you drew on it) that actually grounded this specific section's content - not every field in the request, only the ones this section's content is genuinely traceable to.

Do not include markdown headers in section content (the surrounding template already has section headings) - write plain paragraph prose only, matching the tone of a professional services proposal: warm but substantive, no filler platitudes beyond what the reference template itself uses.`;

const RETURN_SECTIONS_TOOL: Anthropic.Tool = {
  name: "return_proposal_sections",
  description: "Return the drafted content for every requested proposal section.",
  input_schema: {
    type: "object",
    properties: {
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            section_key: {
              type: "string",
              enum: SECTION_ORDER,
            },
            content: { type: "string" },
            generation_status: {
              type: "string",
              enum: ["generated", "scanty"],
            },
            scanty_reason: { type: ["string", "null"] },
            source_fields: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["section_key", "content", "generation_status", "scanty_reason", "source_fields"],
        },
      },
    },
    required: ["sections"],
  },
};

function client() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function buildIntakeBlock(values: GenerationInput, sectionsToGenerate: SectionKey[]) {
  const clientName = formatFullName(values.client_first_name ?? "", values.client_last_name ?? "");
  const lines = [
    `Sections to draft: ${sectionsToGenerate.join(", ")}`,
    "",
    "Intake fields:",
    `- client_name: ${clientName}`,
    `- company_name: ${values.company_name ?? ""}`,
    `- date_of_call: ${values.date_of_call ?? ""}`,
    `- salesperson_name: ${values.salesperson_name ?? ""}`,
    `- proposed_timeline: ${values.proposed_timeline ?? ""}`,
    `- estimated_pricing: ${values.estimated_pricing ?? ""}`,
    `- client_needs_summary: ${values.client_needs_summary ?? ""}`,
    `- project_scope: ${values.project_scope ?? ""}`,
    `- goals_and_objectives: ${values.goals_and_objectives ?? ""}`,
    `- recommended_services: ${values.recommended_services ?? ""}`,
  ];

  if (values.call_transcript && values.call_transcript.trim().length > 0) {
    lines.push("", "Call transcript (optional supporting material):", values.call_transcript);
  }

  return lines.join("\n");
}

/** Stage 3: one batched call for every section that passed Check A. */
export async function generateProposalSections(
  values: GenerationInput,
  sectionsToGenerate: SectionKey[],
  regenerationComment?: string,
): Promise<GeneratedSection[]> {
  if (sectionsToGenerate.length === 0) return [];

  let userContent = buildIntakeBlock(values, sectionsToGenerate);
  if (regenerationComment) {
    userContent += `\n\nAdditional context supplied by the salesperson for this regeneration - use it as extra grounding:\n${regenerationComment}`;
  }

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [RETURN_SECTIONS_TOOL],
    tool_choice: { type: "tool", name: "return_proposal_sections" },
    messages: [{ role: "user", content: userContent }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );

  if (!toolUse) {
    throw new Error("Claude did not return a tool_use block for return_proposal_sections");
  }

  const parsed = toolUse.input as { sections: GeneratedSection[] };
  return parsed.sections;
}
