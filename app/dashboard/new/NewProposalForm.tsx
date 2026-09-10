"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  FIELD_LABELS,
  SECTION_LABELS,
  sectionsRequiringField,
  type IntakeFieldKey,
} from "@/lib/proposal/sections";
import { parseCsv, mapCsvRow, describeRow, type ImportedIntakeValues } from "@/lib/proposal/csv-import";
import { apiFetch, apiErrorMessage } from "@/lib/client-fetch";

const OPTIONAL_FIELDS: IntakeFieldKey[] = [
  "client_needs_summary",
  "project_scope",
  "goals_and_objectives",
  "recommended_services",
  "proposed_timeline",
  "estimated_pricing",
];

const FIELD_HINTS: Record<IntakeFieldKey, string> = {
  client_needs_summary: "The problem the client wants to solve.",
  project_scope: "What the client wants built or delivered.",
  goals_and_objectives: "The outcomes the client wants - revenue growth, efficiency, reduced manual work, etc.",
  recommended_services: "The proposed services, outputs, or deliverables.",
  proposed_timeline: "Expected duration, phases, or delivery window.",
  estimated_pricing: "Proposed price, range, or pricing notes.",
};

const NAME_PATTERN = "[A-Za-z]+";

type FormState = {
  client_first_name: string;
  client_last_name: string;
  client_email: string;
  company_name: string;
  date_of_call: string;
} & Record<IntakeFieldKey, string>;

const initialState: FormState = {
  client_first_name: "",
  client_last_name: "",
  client_email: "",
  company_name: "",
  date_of_call: "",
  client_needs_summary: "",
  project_scope: "",
  goals_and_objectives: "",
  recommended_services: "",
  proposed_timeline: "",
  estimated_pricing: "",
};

const TRANSCRIPT_ACCEPT = ".txt,.docx,.pdf";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function NewProposalForm({ salespersonName }: { salespersonName: string }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialState);
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [touched, setTouched] = useState<Partial<Record<IntakeFieldKey, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [csvRows, setCsvRows] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvWarnings, setCsvWarnings] = useState<string[]>([]);

  function handleChange(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleBlur(key: IntakeFieldKey) {
    setTouched((t) => ({ ...t, [key]: true }));
  }

  function applyImportedValues(mapping: { values: Partial<ImportedIntakeValues>; warnings: string[] }) {
    setForm((f) => ({ ...f, ...mapping.values }));
    setCsvWarnings(mapping.warnings);
    setCsvRows(null);
  }

  async function handleCsvFile(file: File) {
    setCsvError(null);
    setCsvWarnings([]);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length < 2) {
        setCsvError("Couldn't find any response rows in that file.");
        return;
      }
      const [headers, ...rows] = parsed;
      if (rows.length === 1) {
        applyImportedValues(mapCsvRow(headers, rows[0]));
      } else {
        setCsvRows({ headers, rows });
      }
    } catch {
      setCsvError("Couldn't read that file as CSV.");
    }
  }

  const filledContentFieldCount = OPTIONAL_FIELDS.filter((f) => form[f].trim().length > 0).length;
  const notEnoughContent = filledContentFieldCount < 2;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (notEnoughContent) {
      setError("At least 2 of the proposal content fields need something written in them before you can generate a proposal.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    for (const [key, value] of Object.entries(form)) {
      formData.set(key, value);
    }
    if (transcriptFile) {
      formData.set("call_transcript_file", transcriptFile);
    }

    const { ok, body } = await apiFetch<{ id: string }>("/api/proposals", {
      method: "POST",
      body: formData,
    });

    if (!ok) {
      setError(apiErrorMessage(body, "Failed to create proposal."));
      setSubmitting(false);
      return;
    }

    const { id } = body;
    router.push(`/dashboard/${id}`);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-lg font-semibold text-neutral-900">New Proposal</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Fields left blank won&apos;t block submitting this form - they&apos;ll just leave the
        related section un-generated until you fill them in and regenerate.
      </p>

      <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-5">
        <label className="mb-1 block text-sm font-medium text-neutral-900">
          Import from Google Forms (optional)
        </label>
        <p className="mb-2 text-xs text-neutral-400">
          Upload the CSV export of your Google Forms responses (Responses tab → Sheets icon →
          File → Download → CSV) - matching fields will auto-fill below.
        </p>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => e.target.files?.[0] && handleCsvFile(e.target.files[0])}
          className="block w-full text-sm text-neutral-700 file:mr-3 file:rounded-md file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-neutral-700 hover:file:bg-neutral-50"
        />
        {csvError && <p className="mt-2 text-xs text-red-600">{csvError}</p>}
        {csvWarnings.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {csvWarnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-700">
                {w}
              </li>
            ))}
          </ul>
        )}
        {csvRows && (
          <div className="mt-3 space-y-1 rounded-md border border-neutral-200 p-2">
            <p className="text-xs font-medium text-neutral-700">Multiple responses found - pick one:</p>
            {csvRows.rows.map((row, i) => (
              <button
                key={i}
                type="button"
                onClick={() => applyImportedValues(mapCsvRow(csvRows.headers, row))}
                className="block w-full rounded-md px-2 py-1 text-left text-xs text-neutral-700 hover:bg-neutral-50"
              >
                {describeRow(csvRows.headers, row)}
              </button>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <fieldset className="grid grid-cols-2 gap-4 rounded-lg border border-neutral-200 bg-white p-5">
          <legend className="px-1 text-sm font-medium text-neutral-900">Client details</legend>

          <TextField
            label="Client First Name"
            value={form.client_first_name}
            onChange={(v) => handleChange("client_first_name", v)}
            pattern={NAME_PATTERN}
            required
          />
          <TextField
            label="Client Last Name"
            value={form.client_last_name}
            onChange={(v) => handleChange("client_last_name", v)}
            pattern={NAME_PATTERN}
            required
          />
          <TextField label="Client Email" type="email" value={form.client_email} onChange={(v) => handleChange("client_email", v)} required />
          <TextField label="Company Name" value={form.company_name} onChange={(v) => handleChange("company_name", v)} required />
          <TextField
            label="Date of Call"
            type="date"
            value={form.date_of_call}
            onChange={(v) => handleChange("date_of_call", v)}
            max={todayIso()}
            required
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Salesperson</label>
            <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
              {salespersonName}
            </p>
          </div>
        </fieldset>

        <fieldset className="space-y-5 rounded-lg border border-neutral-200 bg-white p-5">
          <legend className="px-1 text-sm font-medium text-neutral-900">Proposal content</legend>

          {OPTIONAL_FIELDS.map((field) => {
            const affectedSections = sectionsRequiringField(field);
            const showWarning = touched[field] && form[field].trim().length === 0 && affectedSections.length > 0;

            return (
              <div key={field}>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  {FIELD_LABELS[field]}
                </label>
                <p className="mb-1 text-xs text-neutral-400">{FIELD_HINTS[field]}</p>
                <textarea
                  rows={3}
                  value={form[field]}
                  onChange={(e) => handleChange(field, e.target.value)}
                  onBlur={() => handleBlur(field)}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
                />
                {showWarning && (
                  <p className="mt-1 text-xs text-amber-700">
                    {affectedSections.map((s) => SECTION_LABELS[s]).join(", ")} won&apos;t generate
                    properly without this.
                  </p>
                )}
              </div>
            );
          })}
        </fieldset>

        <fieldset className="rounded-lg border border-neutral-200 bg-white p-5">
          <legend className="px-1 text-sm font-medium text-neutral-900">Supporting material (optional)</legend>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Call transcript</label>
          <p className="mb-1 text-xs text-neutral-400">
            Attach the call transcript if you have one (.txt, .docx, or .pdf) - used as extra
            grounding for generation. PDF extraction only reads embedded text, not scanned images.
          </p>
          <input
            type="file"
            accept={TRANSCRIPT_ACCEPT}
            onChange={(e) => setTranscriptFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-neutral-700 file:mr-3 file:rounded-md file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-neutral-700 hover:file:bg-neutral-50"
          />
          {transcriptFile && (
            <p className="mt-1 text-xs text-neutral-500">
              {transcriptFile.name} ({Math.round(transcriptFile.size / 1024)} KB)
            </p>
          )}
        </fieldset>

        {notEnoughContent && (
          <p className="text-sm text-amber-700">
            At least 2 of the proposal content fields above need something written in them ({filledContentFieldCount}/2 so far) - a near-empty form isn&apos;t enough to generate anything from.
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting || notEnoughContent}
          className="w-full rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Generating your proposal - this can take up to 30 seconds..." : "Generate Proposal"}
        </button>
      </form>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  pattern,
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  pattern?: string;
  max?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-neutral-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        required={required}
        pattern={pattern}
        title={pattern ? "Letters only, no numbers" : undefined}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
      />
    </div>
  );
}
