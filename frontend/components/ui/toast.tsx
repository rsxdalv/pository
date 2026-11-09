"use client";

import { createContext, useCallback, useContext, useState, ReactNode } from "react";

export type ToastVariant = "default" | "success" | "error";
export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  durationMs?: number;
}
interface ToastItem extends ToastOptions {
  id: number;
}

const ToastContext = createContext<{ toast: (opts: ToastOptions) => void } | undefined>(undefined);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (opts: ToastOptions) => {
      const id = nextId++;
      setItems((prev) => [...prev, { ...opts, id }]);
      setTimeout(() => dismiss(id), opts.durationMs ?? (opts.variant === "error" ? 8000 : 4000));
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.variant === "error" ? "alert" : "status"}
            className={`pointer-events-auto rounded-lg border bg-card p-4 shadow-lg ${
              t.variant === "error"
                ? "border-destructive/50"
                : t.variant === "success"
                  ? "border-emerald-500/50"
                  : "border-border"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className={`text-sm font-medium ${
                    t.variant === "error" ? "text-destructive" : "text-foreground"
                  }`}
                >
                  {t.title}
                </p>
                {t.description && (
                  <p className="mt-1 break-words text-sm text-muted-foreground">{t.description}</p>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
