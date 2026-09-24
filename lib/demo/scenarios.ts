// The seven scenario students created by supabase/migrations/003_seed.sql.
// Roll numbers must match the seed; the demo guide and tests link to them.

export type Scenario = {
  key: string;
  rollNo: string;
  name: string;
  story: string;
  tryThis: string;
};

export const SCENARIOS: readonly Scenario[] = [
  {
    key: "fully-paid",
    rollNo: "BCA25-001",
    name: "Ananya Rao",
    story: "Paid the whole year: term 1 by bank transfer, term 2 by UPI.",
    tryThis: "Open a receipt and print it.",
  },
  {
    key: "partial",
    rollNo: "CSE24-001",
    name: "Rohan Kulkarni",
    story: "One UPI payment cleared tuition and part of hostel.",
    tryThis: "Record a payment and read the allocation preview before submitting.",
  },
  {
    key: "overdue",
    rollNo: "BCOM26-001",
    name: "Vikram Singh",
    story: "Nothing paid; term 1 fees are overdue.",
    tryThis: "Record a cash payment and watch the statement and balance update.",
  },
  {
    key: "concession",
    rollNo: "CSE25-002",
    name: "Priya Nair",
    story: "25% merit concession on term 1 tuition, rest of term 1 paid by card.",
    tryThis: "As admin, apply a concession on a term 2 installment.",
  },
  {
    key: "reversed",
    rollNo: "CSE24-003",
    name: "Arjun Mehta",
    story: "A bank transfer was returned by the bank and reversed, so tuition reopened.",
    tryThis: "Find the muted original row and its reversal in the statement.",
  },
  {
    key: "pending",
    rollNo: "BCA26-002",
    name: "Sneha Iyer",
    story: "A UPI payment timed out at the gateway and is still pending.",
    tryThis: "Use Check status, or upload the sample settlement file and mark it as paid.",
  },
  {
    key: "advance",
    rollNo: "BCOM25-002",
    name: "Karthik Reddy",
    story: "Paid the full year plus Rs 2,500 extra, held as an advance.",
    tryThis: "See how the advance shows as a credit balance.",
  },
] as const;

// The student account used when the role switcher is set to "student".
export const DEMO_STUDENT_ROLL_NO = "BCA26-002";
