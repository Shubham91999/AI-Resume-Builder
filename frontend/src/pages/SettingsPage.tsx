import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getLLMProviders, validateKey } from "@/services/api";
import { cn } from "@/lib/utils";
import {
  Check,
  X,
  Loader2,
  Eye,
  EyeOff,
  ExternalLink,
  Star,
  KeyRound,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface ModelInfo {
  key: string;
  name: string;
  model_id: string;
  description: string;
  recommended: boolean;
}

interface ProviderInfo {
  id: string;
  name: string;
  models: ModelInfo[];
  key_env_var: string;
  key_url: string;
}

type KeyStatus = "idle" | "validating" | "valid" | "invalid";

interface ProviderState {
  key: string;
  status: KeyStatus;
  error: string | null;
  showKey: boolean;
}

// ── LocalStorage helpers ─────────────────────────────────────────────────────

const STORAGE_KEY = "art_api_keys";
const MODEL_STORAGE_KEY = "art_selected_model";

function loadKeys(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveKeys(keys: Record<string, string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

function loadSelectedModel(): { provider: string; model_key: string } | null {
  try {
    const raw = localStorage.getItem(MODEL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Handle legacy format where key was called 'model' instead of 'model_key'
    if (parsed?.provider && parsed?.model_key) return parsed;
    if (parsed?.provider && parsed?.model) return { provider: parsed.provider, model_key: parsed.model };
    return null;
  } catch {
    return null;
  }
}

function saveSelectedModel(provider: string, model_key: string) {
  localStorage.setItem(
    MODEL_STORAGE_KEY,
    JSON.stringify({ provider, model_key })
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [providerStates, setProviderStates] = useState<
    Record<string, ProviderState>
  >({});
  const [selectedModel, setSelectedModel] = useState<{
    provider: string;
    model_key: string;
  } | null>(null);

  // Fetch provider list
  const {
    data: providersData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["llm-providers"],
    queryFn: getLLMProviders,
  });

  const providers: ProviderInfo[] = providersData?.providers ?? [];

  // Init provider states from localStorage on first load
  useEffect(() => {
    if (providers.length === 0) return;
    const savedKeys = loadKeys();
    const initial: Record<string, ProviderState> = {};
    for (const p of providers) {
      initial[p.id] = {
        key: savedKeys[p.id] ?? "",
        status: savedKeys[p.id] ? "valid" : "idle", // trust saved keys
        error: null,
        showKey: false,
      };
    }
    setProviderStates(initial);

    // Restore selected model
    const saved = loadSelectedModel();
    if (saved) {
      setSelectedModel(saved);
    } else {
      // Auto-select first recommended model from first provider with a key
      for (const p of providers) {
        if (savedKeys[p.id]) {
          const rec = p.models.find((m) => m.recommended) ?? p.models[0];
          if (rec) {
            setSelectedModel({ provider: p.id, model_key: rec.key });
            saveSelectedModel(p.id, rec.key);
            break;
          }
        }
      }
    }
  }, [providers]);

  // Validate key mutation
  const validateMutation = useMutation({
    mutationFn: (params: { provider: string; key: string }) =>
      validateKey(params.provider, params.key),
  });

  const updateProviderState = useCallback(
    (id: string, patch: Partial<ProviderState>) => {
      setProviderStates((prev) => ({
        ...prev,
        [id]: { ...prev[id], ...patch },
      }));
    },
    []
  );

  const handleKeyChange = (providerId: string, value: string) => {
    updateProviderState(providerId, {
      key: value,
      status: value ? "idle" : "idle",
      error: null,
    });
  };

  const handleValidate = async (providerId: string) => {
    const key = providerStates[providerId]?.key?.trim();
    if (!key) return;

    updateProviderState(providerId, { status: "validating", error: null });

    try {
      const result = await validateMutation.mutateAsync({
        provider: providerId,
        key,
      });
      if (result.valid) {
        updateProviderState(providerId, { status: "valid", error: null });
        // Save to localStorage
        const saved = loadKeys();
        saved[providerId] = key;
        saveKeys(saved);

        // Auto-select model if none selected
        if (!selectedModel) {
          const prov = providers.find((p) => p.id === providerId);
          const rec =
            prov?.models.find((m) => m.recommended) ?? prov?.models[0];
          if (rec) {
            setSelectedModel({ provider: providerId, model_key: rec.key });
            saveSelectedModel(providerId, rec.key);
          }
        }
      } else {
        updateProviderState(providerId, {
          status: "invalid",
          error: result.error ?? "Invalid key",
        });
      }
    } catch {
      updateProviderState(providerId, {
        status: "invalid",
        error: "Network error — is the backend running?",
      });
    }
  };

  const handleClearKey = (providerId: string) => {
    updateProviderState(providerId, {
      key: "",
      status: "idle",
      error: null,
    });
    const saved = loadKeys();
    delete saved[providerId];
    saveKeys(saved);

    // If we cleared the selected model's provider, clear selection
    if (selectedModel?.provider === providerId) {
      setSelectedModel(null);
      localStorage.removeItem(MODEL_STORAGE_KEY);
    }
  };

  const handleModelSelect = (providerId: string, modelKey: string) => {
    const state = providerStates[providerId];
    if (!state || state.status !== "valid") return;
    setSelectedModel({ provider: providerId, model_key: modelKey });
    saveSelectedModel(providerId, modelKey);
  };

  const validProviderCount = Object.values(providerStates).filter(
    (s) => s.status === "valid"
  ).length;

  // ── Render ──────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">
          Loading providers...
        </span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
        <p className="font-medium text-destructive">
          Failed to load LLM providers
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Make sure the backend is running on{" "}
          <code className="text-xs">localhost:8000</code>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <KeyRound className="h-6 w-6" /> Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Add at least one API key to get started. All keys are stored in your
          browser only — never sent to our server for storage.
        </p>
        {validProviderCount > 0 && (
          <p className="text-sm text-primary mt-2 font-medium">
            ✅ {validProviderCount} provider{validProviderCount > 1 ? "s" : ""}{" "}
            configured
          </p>
        )}
      </div>

      {/* Provider cards */}
      <div className="space-y-6">
        {providers.map((provider) => {
          const state = providerStates[provider.id];
          if (!state) return null;

          return (
            <div
              key={provider.id}
              className={cn(
                "rounded-lg border p-6 transition-colors",
                state.status === "valid"
                  ? "border-primary/30 bg-primary/[0.02]"
                  : "border-border"
              )}
            >
              {/* Provider header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold">{provider.name}</h2>
                  <a
                    href={provider.key_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Get API key <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <StatusBadge status={state.status} />
              </div>

              {/* Key input row */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={state.showKey ? "text" : "password"}
                    value={state.key}
                    onChange={(e) =>
                      handleKeyChange(provider.id, e.target.value)
                    }
                    placeholder={`Paste your ${provider.name} API key...`}
                    className={cn(
                      "w-full rounded-md border px-3 py-2 pr-10 text-sm font-mono",
                      "bg-background placeholder:text-muted-foreground",
                      "focus:outline-none focus:ring-2 focus:ring-ring",
                      state.status === "invalid" && "border-destructive"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updateProviderState(provider.id, {
                        showKey: !state.showKey,
                      })
                    }
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {state.showKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleValidate(provider.id)}
                  disabled={
                    !state.key.trim() || state.status === "validating"
                  }
                  className={cn(
                    "rounded-md px-4 py-2 text-sm font-medium transition-colors",
                    "bg-primary text-primary-foreground hover:bg-primary/90",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {state.status === "validating" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Validate"
                  )}
                </button>

                {state.status === "valid" && (
                  <button
                    type="button"
                    onClick={() => handleClearKey(provider.id)}
                    className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Remove key"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Error message */}
              {state.error && (
                <p className="mt-2 text-sm text-destructive">{state.error}</p>
              )}

              {/* Models list (only when validated) */}
              {state.status === "valid" && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Available Models
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {provider.models.map((model) => {
                      const isSelected =
                        selectedModel?.provider === provider.id &&
                        selectedModel?.model_key === model.key;
                      return (
                        <button
                          key={model.key}
                          onClick={() =>
                            handleModelSelect(provider.id, model.key)
                          }
                          className={cn(
                            "flex flex-col items-start rounded-md border p-3 text-left text-sm transition-colors",
                            isSelected
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "border-border hover:border-primary/30 hover:bg-muted/50"
                          )}
                        >
                          <div className="flex items-center gap-1.5 font-medium">
                            {model.name}
                            {model.recommended && (
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground mt-0.5">
                            {model.description}
                          </span>
                          {isSelected && (
                            <span className="mt-1.5 text-xs font-medium text-primary flex items-center gap-1">
                              <Check className="h-3 w-3" /> Selected
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected model summary */}
      {selectedModel && (
        <div className="rounded-lg border border-primary/20 bg-primary/[0.02] p-4">
          <p className="text-sm">
            <span className="font-medium">Active model:</span>{" "}
            {providers
              .find((p) => p.id === selectedModel.provider)
              ?.models.find((m) => m.key === selectedModel.model_key)?.name ??
              selectedModel.model_key}{" "}
            <span className="text-muted-foreground">
              via{" "}
              {providers.find((p) => p.id === selectedModel.provider)?.name}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

// ── StatusBadge sub-component ───────────────────────────────────────────────

function StatusBadge({ status }: { status: KeyStatus }) {
  switch (status) {
    case "valid":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
          <Check className="h-3 w-3" /> Valid
        </span>
      );
    case "invalid":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
          <X className="h-3 w-3" /> Invalid
        </span>
      );
    case "validating":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
          <Loader2 className="h-3 w-3 animate-spin" /> Checking...
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
          Not configured
        </span>
      );
  }
}
