// Decision #43 (progress.md): names are stored as separate first/last
// columns (profiles, proposals' client name) - this is the single place
// that combines them for display.
export function formatFullName(firstName: string, lastName: string): string {
  return [firstName, lastName].filter((part) => part && part.trim().length > 0).join(" ");
}

// User's explicit call (2026-09-10): letters only - no digits, no other
// alphanumeric/punctuation characters at all (not even spaces, hyphens, or
// apostrophes within a single first/last name field).
const NAME_PATTERN = /^[A-Za-z]+$/;

export function isValidNamePart(value: string): boolean {
  return NAME_PATTERN.test(value.trim());
}
