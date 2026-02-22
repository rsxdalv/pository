"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { PositoryAPI } from "./api";

interface ApiKeyContextType {
  apiKey: string | null;
  setApiKey: (key: string) => void;
  api: PositoryAPI | null;
}

const ApiKeyContext = createContext<ApiKeyContextType | undefined>(undefined);

export function ApiKeyProvider({ children }: { children: ReactNode }) {
  // Always start null so server render matches initial client render (no hydration mismatch)
  const [apiKey, setApiKeyState] = useState<string | null>(null);

  // Load from localStorage after mount (client only)
  useEffect(() => {
    const stored = localStorage.getItem("pository_api_key");
    if (stored) setApiKeyState(stored);
  }, []);

  const setApiKey = (key: string) => {
    setApiKeyState(key);
    localStorage.setItem("pository_api_key", key);
  };

  const api = apiKey ? new PositoryAPI(apiKey) : null;

  return (
    <ApiKeyContext.Provider value={{ apiKey, setApiKey, api }}>
      {children}
    </ApiKeyContext.Provider>
  );
}

export function useApiKey() {
  const context = useContext(ApiKeyContext);
  if (context === undefined) {
    throw new Error("useApiKey must be used within an ApiKeyProvider");
  }
  return context;
}
