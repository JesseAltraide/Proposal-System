import { z } from "zod";
import { isValidNamePart } from "@/lib/names";

const namePart = z.string().min(1, "Required").refine(isValidNamePart, "Letters only, no numbers");

// today() computed per-call, not at module load, so a long-lived server
// process doesn't validate against a stale "today" after midnight.
function today() {
  return new Date().toISOString().slice(0, 10);
}

export const intakeFormSchema = z.object({
  client_first_name: namePart,
  client_last_name: namePart,
  client_email: z.string().email("Must be a valid email"),
  company_name: z.string().min(1, "Required"),
  date_of_call: z
    .string()
    .min(1, "Required")
    .refine((value) => value <= today(), "Date of Call can't be in the future"),
  client_needs_summary: z.string().optional().default(""),
  project_scope: z.string().optional().default(""),
  goals_and_objectives: z.string().optional().default(""),
  recommended_services: z.string().optional().default(""),
  proposed_timeline: z.string().optional().default(""),
  estimated_pricing: z.string().optional().default(""),
  call_transcript: z.string().optional().default(""),
});

export type IntakeFormInput = z.infer<typeof intakeFormSchema>;

export const regenerateSchema = z.object({
  comment: z.string().optional().default(""),
  expectedVersion: z.number().int().positive(),
});

export const rejectSchema = z.object({
  note: z.string().min(1, "A reason is required to reject a proposal"),
});

