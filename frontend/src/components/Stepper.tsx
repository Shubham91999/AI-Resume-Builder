import { useLocation, useNavigate } from "react-router-dom";
import { STEPS } from "@/config/steps";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export default function Stepper() {
  const location = useLocation();
  const navigate = useNavigate();

  const currentIndex = STEPS.findIndex((s) => s.path === location.pathname);

  return (
    <nav className="flex items-center gap-1 overflow-x-auto py-4 px-2">
      {STEPS.map((step, i) => {
        const isActive = i === currentIndex;
        const isCompleted = i < currentIndex;

        return (
          <button
            key={step.id}
            onClick={() => navigate(step.path)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
              isActive && "bg-primary text-primary-foreground",
              isCompleted && "bg-primary/10 text-primary",
              !isActive && !isCompleted && "text-muted-foreground hover:bg-muted"
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold border",
                isActive && "border-primary-foreground bg-primary-foreground text-primary",
                isCompleted && "border-primary bg-primary text-primary-foreground",
                !isActive && !isCompleted && "border-muted-foreground"
              )}
            >
              {isCompleted ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className="hidden sm:inline">{step.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
