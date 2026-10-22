"use client";

import { useState } from "react";
import { Overview } from "@/components/overview";
import { Packages } from "@/components/packages";
import { ApiKeys } from "@/components/api-keys";
import { OidcOverrides } from "@/components/oidc-overrides";
import { ApiKeyProvider, useApiKey } from "@/lib/api-key-context";

type Tab = "overview" | "packages" | "keys" | "oidc";

function DashboardContent() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const { apiKey, clearApiKey, ssoUser } = useApiKey();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icon.svg" alt="Pository" className="h-10 w-10 rounded-lg" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">Pository</h1>
                <p className="text-sm text-muted-foreground">
                  Package Repository Manager
                </p>
              </div>
            </div>
            {ssoUser && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span title={`Signed in via Authelia SSO (${ssoUser.role})`}>
                  {ssoUser.name || ssoUser.user}
                </span>
                <a
                  href="https://sso.ttswebui.com/logout"
                  className="rounded-md border border-border px-3 py-1.5 transition-colors hover:border-destructive hover:text-destructive"
                >
                  Sign out
                </a>
              </div>
            )}
            {apiKey && !ssoUser && (
              <button
                onClick={clearApiKey}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                title="Clear API key and return to login"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                Logout
              </button>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex gap-6 px-6">
          <button
            onClick={() => setActiveTab("overview")}
            className={`border-b-2 py-3 text-sm font-medium transition-colors ${
              activeTab === "overview"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab("packages")}
            className={`border-b-2 py-3 text-sm font-medium transition-colors ${
              activeTab === "packages"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Packages
          </button>
          <button
            onClick={() => setActiveTab("keys")}
            className={`border-b-2 py-3 text-sm font-medium transition-colors ${
              activeTab === "keys"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            API Keys
          </button>
          <button
            onClick={() => setActiveTab("oidc")}
            className={`border-b-2 py-3 text-sm font-medium transition-colors ${
              activeTab === "oidc"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            OIDC Overrides
          </button>
        </nav>
      </header>

      {/* Content */}
      <main className="px-6 py-6">
        {activeTab === "overview" && <Overview />}
        {activeTab === "packages" && <Packages />}
        {activeTab === "keys" && <ApiKeys />}
        {activeTab === "oidc" && <OidcOverrides />}
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <ApiKeyProvider>
      <DashboardContent />
    </ApiKeyProvider>
  );
}

