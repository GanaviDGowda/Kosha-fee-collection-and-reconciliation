import Link from "next/link";
import { EmptyState, Panel } from "@/components/ui/panel";

export default function StudentNotFound() {
  return (
    <Panel>
      <EmptyState
        title="Student not found"
        action={
          <Link href="/students" className="text-accent hover:underline">
            Go to the students list
          </Link>
        }
      >
        There is no student with that roll number. Check it, or search with Ctrl K.
      </EmptyState>
    </Panel>
  );
}
