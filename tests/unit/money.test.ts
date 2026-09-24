import { describe, expect, it } from "vitest";
import { amountInWords, formatINR, toPaise } from "@/lib/money";

describe("formatINR", () => {
  it("uses Indian digit grouping and the rupee sign", () => {
    expect(formatINR(12_500_000)).toBe("₹1,25,000.00");
    expect(formatINR(1_000_000_000)).toBe("₹1,00,00,000.00");
    expect(formatINR(5)).toBe("₹0.05");
    expect(formatINR(0)).toBe("₹0.00");
  });

  it("drops .00 for whole rupees only when asked", () => {
    expect(formatINR(1_800_000, { paise: "auto" })).toBe("₹18,000");
    expect(formatINR(1_800_050, { paise: "auto" })).toBe("₹18,000.50");
  });

  it("shows negatives (advance) with a minus sign", () => {
    expect(formatINR(-250_000)).toBe("-₹2,500.00");
  });

  it("refuses non-integer paise so float money never gets formatted silently", () => {
    expect(() => formatINR(10.5)).toThrow(TypeError);
  });
});

describe("toPaise", () => {
  const ok = (input: string, paise: number) => expect(toPaise(input)).toEqual({ ok: true, paise });
  const bad = (input: string) => expect(toPaise(input).ok).toBe(false);

  it("parses plain, decimal and grouped amounts exactly", () => {
    ok("25000", 2_500_000);
    ok("25000.5", 2_500_050);
    ok("25000.50", 2_500_050);
    ok("0.01", 1);
    ok("1,25,000", 12_500_000);
    ok("125,000.75", 12_500_075);
    ok("₹ 18,000", 1_800_000);
    ok("Rs. 500", 50_000);
    ok("  42  ", 4_200);
    ok("0", 0);
  });

  it("does not suffer float rounding (0.1 + 0.2 style bugs)", () => {
    ok("0.29", 29);
    ok("1.15", 115);
    ok("4.35", 435);
    ok("99999999.99", 9_999_999_999);
  });

  it("rejects blanks", () => {
    bad("");
    bad("   ");
    expect(toPaise("")).toEqual({ ok: false, error: "Enter an amount." });
  });

  it("rejects negatives", () => {
    expect(toPaise("-100")).toEqual({ ok: false, error: "Amount cannot be negative." });
    bad("- 5");
  });

  it("rejects more than 2 decimal places", () => {
    expect(toPaise("10.555")).toEqual({ ok: false, error: "Use at most 2 decimal places." });
    bad("1,000.001");
  });

  it("rejects junk, exponents and malformed grouping", () => {
    bad("abc");
    bad("1e5");
    bad("12.");
    bad(".5");
    bad("1,2,3");
    bad("12,34");
    bad("1.000,50");
    bad("+100");
    bad("100 rupees");
    bad("NaN");
    bad("Infinity");
  });

  it("rejects absurdly large amounts", () => {
    bad("123456789012345");
  });
});

describe("amountInWords (Indian numbering)", () => {
  it("writes the receipt phrase", () => {
    expect(amountInWords(2_500_000)).toBe("Twenty-five thousand rupees only");
    expect(amountInWords(12_500_000)).toBe("One lakh twenty-five thousand rupees only");
    expect(amountInWords(1_000_000_000)).toBe("One crore rupees only");
  });

  it("handles hundreds, tens and paise", () => {
    expect(amountInWords(8_650_000)).toBe("Eighty-six thousand five hundred rupees only");
    expect(amountInWords(100)).toBe("One rupee only");
    expect(amountInWords(2_550_050)).toBe("Twenty-five thousand five hundred rupees and fifty paise only");
    expect(amountInWords(5)).toBe("Five paise only");
    expect(amountInWords(0)).toBe("Zero rupees only");
    expect(amountInWords(1_562_500)).toBe("Fifteen thousand six hundred twenty-five rupees only");
  });

  it("rejects negative or fractional paise", () => {
    expect(() => amountInWords(-1)).toThrow();
    expect(() => amountInWords(1.5)).toThrow();
  });
});
