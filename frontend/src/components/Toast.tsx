import { createContext, useContext, useState, useCallback, useRef } from "react";
import { CheckCircle2, XCircle, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type ToastType = "success" | "error" | "warning";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toast: (type: ToastType, message: string) => void;
}

// ── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

// ── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (type: ToastType, message: string) => {
      const id = ++nextId.current;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast stack — bottom-right */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl",
              "animate-in slide-in-from-bottom-2 fade-in duration-200",
              t.type === "success" &&
                "bg-zinc-900 border-green-500/40 text-green-300",
              t.type === "error" &&
                "bg-zinc-900 border-red-500/40 text-red-300",
              t.type === "warning" &&
                "bg-zinc-900 border-amber-500/40 text-amber-300"
            )}
          >
            {t.type === "success" && (
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            )}
            {t.type === "error" && (
              <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
            )}
            {t.type === "warning" && (
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            )}
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="opacity-50 hover:opacity-100 transition-opacity mt-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useToast() {
  return useContext(ToastContext);
}
