// Money is always integer paise. Everything in this file is formatting or parsing at the edge.

const inrFormatter = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
const inrWholeFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * 12500000 -> "₹1,25,000.00". With `{ paise: "auto" }` whole-rupee amounts drop the
 * ".00" ("₹1,25,000"), which reads better in sentences.
 */
export function formatINR(paise: number, opts: { paise?: "always" | "auto" } = {}): string {
  if (!Number.isSafeInteger(paise)) throw new TypeError(`formatINR expects integer paise, got ${paise}`);
  const whole = paise % 100 === 0;
  const formatter = opts.paise === "auto" && whole ? inrWholeFormatter : inrFormatter;
  return formatter.format(paise / 100);
}

export type ParseResult = { ok: true; paise: number } | { ok: false; error: string };

// Plain digits, Indian grouping (1,25,000) or international grouping (125,000).
const AMOUNT_RE = /^(\d+|\d{1,2}(?:,\d{2})*,\d{3}|\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?$/;

/**
 * Strict rupee string -> integer paise. Accepts "25000", "25,000.50", "₹1,25,000".
 * Rejects blanks, negatives, more than 2 decimals, exponents, stray characters and
 * amounts too large to be real. Never goes through floating point.
 */
export function toPaise(input: string): ParseResult {
  if (typeof input !== "string") return { ok: false, error: "Enter an amount." };
  const s = input.trim().replace(/^₹\s*/, "").replace(/^Rs\.?\s*/i, "");
  if (s === "") return { ok: false, error: "Enter an amount." };
  if (s.startsWith("-")) return { ok: false, error: "Amount cannot be negative." };

  const m = AMOUNT_RE.exec(s);
  if (!m) {
    if (/^\d[\d,]*\.\d{3,}$/.test(s)) return { ok: false, error: "Use at most 2 decimal places." };
    return { ok: false, error: "Enter the amount in rupees, like 25000 or 25,000.50." };
  }

  const rupeesPart = m[1]!.replace(/,/g, "");
  const fraction = (m[2] ?? "").padEnd(2, "0");
  if (rupeesPart.length > 11) return { ok: false, error: "Amount is too large." };

  const paise = Number(rupeesPart) * 100 + Number(fraction);
  if (!Number.isSafeInteger(paise)) return { ok: false, error: "Amount is too large." };
  return { ok: true, paise };
}

// ---------------------------------------------------------------------------
// Amount in words, Indian numbering: 2550050 -> "Twenty-five thousand five hundred rupees and fifty paise only"
// ---------------------------------------------------------------------------

const ONES = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n]!;
  const t = TENS[Math.floor(n / 10)]!;
  return n % 10 === 0 ? t : `${t}-${ONES[n % 10]}`;
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h > 0) parts.push(`${ONES[h]} hundred`);
  if (rest > 0) parts.push(belowHundred(rest));
  return parts.join(" ");
}

function integerInWords(n: number): string {
  if (n === 0) return "zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const rest = n % 1000;
  if (crore > 0) parts.push(`${integerInWords(crore)} crore`);
  if (lakh > 0) parts.push(`${belowHundred(lakh)} lakh`);
  if (thousand > 0) parts.push(`${belowHundred(thousand)} thousand`);
  if (rest > 0) parts.push(belowThousand(rest));
  return parts.join(" ");
}

export function amountInWords(paise: number): string {
  if (!Number.isSafeInteger(paise) || paise < 0) throw new TypeError(`amountInWords expects non-negative integer paise, got ${paise}`);
  const rupees = Math.floor(paise / 100);
  const p = paise % 100;
  let words: string;
  if (rupees > 0 && p > 0) words = `${integerInWords(rupees)} ${rupees === 1 ? "rupee" : "rupees"} and ${belowHundred(p)} paise`;
  else if (rupees > 0) words = `${integerInWords(rupees)} ${rupees === 1 ? "rupee" : "rupees"}`;
  else if (p > 0) words = `${belowHundred(p)} paise`;
  else words = "zero rupees";
  words += " only";
  return words.charAt(0).toUpperCase() + words.slice(1);
}
