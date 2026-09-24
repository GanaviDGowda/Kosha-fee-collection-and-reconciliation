import { describe, expect, it } from "vitest";
import { addDays, formatDate, formatDateTime, isoDateIST } from "@/lib/dates";
import { describeBalance } from "@/lib/domain/balance-sentence";

describe("dates", () => {
  it("formats like 24 Sep 2026 (not Sept) in IST", () => {
    expect(formatDate("2026-09-24")).toBe("24 Sep 2026");
    expect(formatDate("2026-09-23T20:00:00Z")).toBe("24 Sep 2026"); // 01:30 IST next day
    expect(formatDate("2027-01-05")).toBe("5 Jan 2027");
  });
  it("shows times in IST with a 24-hour clock", () => {
    expect(formatDateTime("2026-09-24T04:10:00Z")).toBe("24 Sep 2026, 09:40 IST");
  });
  it("computes IST calendar dates and adds days across month ends", () => {
    expect(isoDateIST("2026-08-31T19:00:00Z")).toBe("2026-09-01");
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("describeBalance", () => {
  const base = { balancePaise: 0, overduePaise: 0, oldestOverdueDate: null, nextDueDate: null, nextDuePaise: 0 };
  it("next installment", () => {
    expect(describeBalance({ ...base, balancePaise: 1_800_000, nextDueDate: "2026-10-15", nextDuePaise: 1_800_000 }).sentence).toBe(
      "Next installment of ₹18,000 due on 15 Oct 2026.",
    );
  });
  it("advance", () => {
    expect(describeBalance({ ...base, balancePaise: -250_000 })).toMatchObject({ label: "Advance", sentence: "Paid ₹2,500 more than billed. It will be used against future fees." });
  });
  it("overdue first, then what is next", () => {
    expect(
      describeBalance({ ...base, balancePaise: 13_000_000, overduePaise: 6_250_000, oldestOverdueDate: "2026-08-15", nextDueDate: "2027-01-15", nextDuePaise: 6_400_000 }),
    ).toMatchObject({ tone: "debit", sentence: "₹62,500 overdue since 15 Aug 2026.", followUp: "Next installment of ₹64,000 due on 15 Jan 2027." });
  });
  it("fully paid", () => {
    expect(describeBalance(base)).toMatchObject({ tone: "credit", sentence: "All fees for 2026-27 are paid." });
  });
});
