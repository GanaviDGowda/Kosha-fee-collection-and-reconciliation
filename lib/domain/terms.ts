// Academic calendar for 2026-27. Kept in code because a fee-structure editor is out of scope;
// the due dates themselves live on each installment in the database.

export type Term = { term: number; label: string; from: string; to: string };

export const TERMS: readonly Term[] = [
  { term: 1, label: "Term 1", from: "2026-04-01", to: "2026-12-31" },
  { term: 2, label: "Term 2", from: "2027-01-01", to: "2027-03-31" },
];

/** The term a calendar date (YYYY-MM-DD) falls in; dates outside the year snap to the nearest term. */
export function termFor(isoDate: string): Term {
  const found = TERMS.find((t) => isoDate >= t.from && isoDate <= t.to);
  if (found) return found;
  return isoDate < TERMS[0]!.from ? TERMS[0]! : TERMS[TERMS.length - 1]!;
}
