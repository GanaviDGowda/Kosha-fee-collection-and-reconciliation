import { CommandPaletteProvider } from "@/components/shell/command-palette";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { getRole } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const role = await getRole();
  return (
    <CommandPaletteProvider role={role}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[70] focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="flex min-h-screen">
        {/* The column carries the border and background so it runs the full page height. */}
        <div className="no-print hidden border-r border-line bg-surface lg:block">
          <Sidebar role={role} />
        </div>
        <div className="min-w-0 flex-1">
          <Topbar role={role} />
          <main id="main" className="mx-auto w-full max-w-content px-4 py-6 sm:px-8 sm:py-8">
            {children}
          </main>
        </div>
      </div>
    </CommandPaletteProvider>
  );
}
