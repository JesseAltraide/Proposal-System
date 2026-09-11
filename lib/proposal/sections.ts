import type { SectionKey } from "@/lib/supabase/database.types";

// Single source of truth for Check A (structural completeness) - shared by
// the in-form live-warning UI (Stage 1) and the server-side pre-generation
// check (Stage 2), so the two can never drift apart.
//
// IntakeFieldKey values below must match the proposals table column names.
export type IntakeFieldKey =
  | "client_needs_summary"
  | "project_scope"
  | "goals_and_objectives"
  | "recommended_services"
  | "proposed_timeline"
  | "estimated_pricing";

// The 6 fillable proposal-content fields (excludes client-identity fields
// like name/email/company, which are required separately and aren't part
// of the "how much has actually been written" check).
export const CONTENT_FIELDS: IntakeFieldKey[] = [
  "client_needs_summary",
  "project_scope",
  "goals_and_objectives",
  "recommended_services",
  "proposed_timeline",
  "estimated_pricing",
];

// Minimum number of CONTENT_FIELDS that must be filled before a proposal can
// be generated at all - shared by the client-side form warning and the
// server-side hard gate so the two numbers can never drift apart.
export const MIN_CONTENT_FIELDS_TO_GENERATE = 4;

export const SECTION_ORDER: SectionKey[] = [
  "introduction",
  "proposed_solution",
  "deliverables",
  "timeline",
  "pricing",
  "next_steps",
];

export const SECTION_LABELS: Record<SectionKey, string> = {
  introduction: "Introduction",
  proposed_solution: "Proposed Solution",
  deliverables: "Deliverables",
  timeline: "Timeline",
  pricing: "Pricing",
  next_steps: "Next Steps",
};

// Required intake fields per section. An empty array means the section has
// no required field and always passes Check A (see progress.md decision #30
// re: next_steps).
export const REQUIRED_FIELDS: Record<SectionKey, IntakeFieldKey[]> = {
  introduction: ["client_needs_summary", "goals_and_objectives"],
  proposed_solution: ["project_scope", "recommended_services"],
  deliverables: ["recommended_services"],
  timeline: ["proposed_timeline"],
  pricing: ["estimated_pricing"],
  next_steps: [],
};

export const FIELD_LABELS: Record<IntakeFieldKey, string> = {
  client_needs_summary: "Summary of Client's Needs",
  project_scope: "Project Scope",
  goals_and_objectives: "Goals and Objectives",
  recommended_services: "Recommended Services or Deliverables",
  proposed_timeline: "Proposed Timeline",
  estimated_pricing: "Estimated Pricing",
};

export type IntakeFormValues = Record<IntakeFieldKey, string> & {
  client_first_name: string;
  client_last_name: string;
  client_email: string;
  company_name: string;
  date_of_call: string;
  call_transcript?: string;
};

// Reverse of REQUIRED_FIELDS - which section(s) a given intake field feeds,
// used for the live in-form warning as the salesperson fills the form.
export function sectionsRequiringField(field: IntakeFieldKey): SectionKey[] {
  return SECTION_ORDER.filter((section) => REQUIRED_FIELDS[section].includes(field));
}

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim().length === 0;
}

/** Check A: which required fields (if any) are blank for a given section. */
export function missingFieldsForSection(
  section: SectionKey,
  values: Partial<Record<IntakeFieldKey, string | null>>,
): IntakeFieldKey[] {
  return REQUIRED_FIELDS[section].filter((field) => isBlank(values[field]));
}

/** Check A across the whole form - used both for live warnings and pre-generation. */
export function runStructuralCheck(
  values: Partial<Record<IntakeFieldKey, string | null>>,
): Record<SectionKey, { passed: boolean; missingFields: IntakeFieldKey[] }> {
  const result = {} as Record<SectionKey, { passed: boolean; missingFields: IntakeFieldKey[] }>;
  for (const section of SECTION_ORDER) {
    const missingFields = missingFieldsForSection(section, values);
    result[section] = { passed: missingFields.length === 0, missingFields };
  }
  return result;
}
