import { Outlet } from "react-router-dom";
import Stepper from "@/components/Stepper";

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-5xl px-4">
          <div className="flex items-center justify-between py-3">
            <h1 className="text-lg font-bold tracking-tight">
              🎯 AI Resume Tailor
            </h1>
            <span className="text-xs text-muted-foreground">v0.1 MVP</span>
          </div>
          <Stepper />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <Outlet />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        AI Resume Tailor — Free &amp; Open Source
      </footer>
    </div>
  );
}
