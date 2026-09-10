// Client-safe CSV parsing for the Google Forms import feature (decision #44).
// Handles RFC4180-style quoting (needed since fields like Estimated Pricing
// commonly contain commas, e.g. "$18,000 - $24,000").

import { isValidNamePart } from "@/lib/names";

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

// Matches the Google Form's own labels (see intake-form-fields.md /
// the live reference form) - the whole point of CSV import is that these
// already line up with FIELD_LABELS in lib/proposal/sections.ts.
const HEADER_MAP: Record<string, string> = {
  "client name": "client_name",
  "client email": "client_email",
  "company name": "company_name",
  "date of call": "date_of_call",
  "summary of client's needs": "client_needs_summary",
  "project scope": "project_scope",
  "goals & objectives": "goals_and_objectives",
  "goals and objectives": "goals_and_objectives",
  "recommended services/deliverables": "recommended_services",
  "recommended services or deliverables": "recommended_services",
  "proposed timeline": "proposed_timeline",
  "estimated pricing": "estimated_pricing",
};

function toIsoDate(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";

  // Read back with LOCAL getters, not UTC ones - `new Date("9/1/2026")`
  // parses as local midnight, so .toISOString() (which converts to UTC
  // first) can shift the date back a day in any timezone behind UTC.
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface ImportedIntakeValues {
  client_first_name: string;
  client_last_name: string;
  client_email: string;
  company_name: string;
  date_of_call: string;
  client_needs_summary: string;
  project_scope: string;
  goals_and_objectives: string;
  recommended_services: string;
  proposed_timeline: string;
  estimated_pricing: string;
}

/** Splits a single combined name into first/last on the first space - *  matches the same heuristic used server-side for the one-time DB backfill. */
export function splitName(fullName: string): { first: string; last: string } {
  const trimmed = fullName.trim();
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) return { first: trimmed, last: "" };
  return { first: trimmed.slice(0, spaceIndex), last: trimmed.slice(spaceIndex + 1).trim() };
}

export interface CsvRowMapping {
  values: Partial<ImportedIntakeValues>;
  // Fields that had something in the source CSV but couldn't be used as-is
  // (e.g. a name containing a number) - left blank rather than guessed at,
  // for the salesperson to fill in by hand. See decision (2026-09-10):
  // a name that fails validation on import is never silently coerced.
  warnings: string[];
}

export function mapCsvRow(headers: string[], row: string[]): CsvRowMapping {
  const result: Partial<ImportedIntakeValues> = {};
  const warnings: string[] = [];

  headers.forEach((rawHeader, i) => {
    const key = HEADER_MAP[rawHeader.trim().toLowerCase()];
    const value = row[i]?.trim() ?? "";
    if (!key || !value) return;

    if (key === "client_name") {
      const { first, last } = splitName(value);
      if (isValidNamePart(first) && isValidNamePart(last)) {
        result.client_first_name = first;
        result.client_last_name = last;
      } else {
        warnings.push(`Client Name "${value}" isn't letters-only - fill in First/Last Name manually.`);
      }
    } else if (key === "date_of_call") {
      const iso = toIsoDate(value);
      if (iso) result.date_of_call = iso;
      else warnings.push(`Date of Call "${value}" couldn't be read - fill it in manually.`);
    } else {
      (result as Record<string, string>)[key] = value;
    }
  });

  return { values: result, warnings };
}

/** A short human label for a parsed response row, used when there's more
 *  than one to choose from. */
export function describeRow(headers: string[], row: string[]): string {
  const { values } = mapCsvRow(headers, row);
  const name = [values.client_first_name, values.client_last_name].filter(Boolean).join(" ");
  return [name, values.company_name].filter(Boolean).join(" - ") || "Untitled response";
}
