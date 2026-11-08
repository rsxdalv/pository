"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { PositoryAPI, API_URL } from "./api";

export type Role = "admin" | "write" | "read";

export interface SsoUser {
  user: string;
  name?: string;
  groups: string[];
  role: string;
}

// Same-origin path that nginx protects with Authelia and proxies to /api/v1 on the backend
const SSO_BASE = "/sso";
// In SSO mode there is no key; components only test apiKey for truthiness / SWR cache keys
const SSO_SENTINEL = "sso-session";

interface ApiKeyContextType {
  ssoUser: SsoUser | null;
  loading: boolean;
  apiKey: string | null;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  api: PositoryAPI | null;
  /** Caller role; null while unknown / signed out. */
  role: Role | null;
}

function isRole(r: unknown): r is Role {
  return r === "admin" || r === "write" || r === "read";
}

const ApiKeyContext = createContext<ApiKeyContextType | undefined>(undefined);

export function ApiKeyProvider({ children }: { children: ReactNode }) {
  // Always start null so server render matches initial client render (no hydration mismatch)
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [ssoUser, setSsoUser] = useState<SsoUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyRole, setKeyRole] = useState<Role | null>(null);

  // Prefer an Authelia SSO session; fall back to a stored API key (local dev / no proxy)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${SSO_BASE}/api/v1/whoami`, { credentials: "same-origin" });
        const ct = res.headers.get("content-type") || "";
        if (res.ok && ct.includes("application/json")) {
          const who = await res.json();
          if (!cancelled && who.authType === "sso") {
            setSsoUser(who);
            setLoading(false);
            return;
          }
        }
      } catch {
        // no SSO proxy available
      }
      if (cancelled) return;
      let stored: string | null = null;
      try {
        stored = localStorage.getItem("pository_api_key");
      } catch {
        // storage unavailable
      }
      if (stored) setApiKeyState(stored);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Learn the role of an API key holder
  useEffect(() => {
    if (!apiKey || ssoUser) {
      setKeyRole(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/whoami`, { headers: { "X-Api-Key": apiKey } });
        if (!res.ok) return;
        const who = await res.json();
        if (!cancelled && isRole(who.role)) setKeyRole(who.role);
      } catch {
        // role stays unknown
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiKey, ssoUser]);

  const setApiKey = (key: string) => {
    setApiKeyState(key);
    try {
      localStorage.setItem("pository_api_key", key);
    } catch {
      // ignore
    }
  };

  const clearApiKey = () => {
    setApiKeyState(null);
    setKeyRole(null);
    try {
      localStorage.removeItem("pository_api_key");
    } catch {
      // ignore
    }
  };

  const role: Role | null = ssoUser ? (isRole(ssoUser.role) ? ssoUser.role : null) : keyRole;

  const effectiveKey = ssoUser ? SSO_SENTINEL : apiKey;
  const api = ssoUser
    ? new PositoryAPI(null, `${SSO_BASE}`)
    : apiKey
      ? new PositoryAPI(apiKey)
      : null;

  return (
    <ApiKeyContext.Provider
      value={{ ssoUser, loading, apiKey: effectiveKey, setApiKey, clearApiKey, api, role }}
    >
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
