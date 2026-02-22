"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { PositoryAPI } from "./api";

interface ApiKeyContextType {
  apiKey: string | null;
  setApiKey: (key: string) => void;
  api: PositoryAPI | null;
}

const ApiKeyContext = createContext<ApiKeyContextType | undefined>(undefined);

export function ApiKeyProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKeyState] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("pository_api_key");
    }
    return null;
  });

  const setApiKey = (key: string) => {
    setApiKeyState(key);
    if (typeof window !== "undefined") {
      localStorage.setItem("pository_api_key", key);
    }
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
