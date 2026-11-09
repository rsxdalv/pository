"use client";

import { useState } from "react";
import { useApiKey } from "@/lib/api-key-context";
import { PositoryAPI } from "@/lib/api";

export function ApiKeyPrompt() {
  const { setApiKey, loading } = useApiKey();
  const [input, setInput] = useState("");
  const [show, setShow] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = input.trim();
    if (!key || checking) return;
    setChecking(true);
    setError(null);
    try {
      // Any authenticated role may list packages, so this validates the key without needing admin.
      await new PositoryAPI(key).listPackages();
      setApiKey(key);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(
        err instanceof TypeError
          ? "Could not reach the Pository API. Check your network and the server URL."
          : /invalid|missing|unauthor|HTTP 40[13]/i.test(msg)
            ? "That API key was rejected. Check the value and try again."
            : msg || "Could not validate the key."
      );
    } finally {
      setChecking(false);
    }
  };

  if (loading) return null; // avoid flashing the prompt while checking for an SSO session

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-1 py-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <svg className="h-7 w-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
          </div>
          <h2 className="mt-5 text-2xl font-bold text-foreground">Sign in to Pository</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Single sign-on users are signed in automatically. Otherwise, paste an API key to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <div>
            <label htmlFor="apiKey" className="mb-2 block text-sm font-medium text-foreground">
              API key
            </label>
            <div className="relative">
              <input
                id="apiKey"
                type={show ? "text" : "password"}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Paste your API key"
                autoComplete="off"
                autoFocus
                spellCheck={false}
                aria-invalid={!!error}
                aria-describedby={error ? "apiKey-error" : undefined}
                className={`w-full rounded-md border bg-background py-2 pl-3 pr-16 font-mono text-sm text-foreground placeholder:font-sans placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
                  error ? "border-destructive" : "border-input"
                }`}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-pressed={show}
                className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {show ? "Hide" : "Show"}
              </button>
            </div>
            {error && (
              <p id="apiKey-error" role="alert" className="mt-2 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!input.trim() || checking}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {checking ? "Checking…" : "Continue"}
          </button>
        </form>

        <p className="mt-6 rounded-lg border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
          Your key is stored only in this browser and is sent only to the Pository API.
        </p>
      </div>
    </div>
  );
}
