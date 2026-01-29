"use client";

import { useState } from "react";
import { useApiKey } from "@/lib/api-key-context";

export function ApiKeyPrompt() {
  const { setApiKey } = useApiKey();
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      setApiKey(input.trim());
    }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <svg
              className="h-8 w-8 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
          </div>
          <h2 className="mt-6 text-2xl font-bold text-foreground">
            API Key Required
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your API key to access the Pository dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="apiKey"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              API Key
            </label>
            <input
              id="apiKey"
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter your API key"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Continue
          </button>
        </form>

        <div className="rounded-lg border border-border bg-muted/50 p-4">
          <p className="text-xs text-muted-foreground">
            Your API key is stored locally in your browser and is never sent to any
            server except the Pository API.
          </p>
        </div>
      </div>
    </div>
  );
}
