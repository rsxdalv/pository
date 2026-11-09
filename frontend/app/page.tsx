"use client";

import { Suspense, useCallback, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Overview } from "@/components/overview";
import { Packages } from "@/components/packages";
import { ApiKeys } from "@/components/api-keys";
import { OidcOverrides } from "@/components/oidc-overrides";
import { ApiKeyProvider, useApiKey } from "@/lib/api-key-context";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { ThemeToggle } from "@/components/shell/theme-toggle";

type Tab = "overview" | "packages" | "keys" | "oidc";

const TABS: { id: Tab; label: string; admin?: boolean; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "M4 13h6V4H4zm10 7h6V4h-6zM4 20h6v-4H4z" },
  {
    id: "packages",
    label: "Packages",
    icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  },
  {
    id: "keys",
    label: "API Keys",
    admin: true,
    icon: "M15 7a4 4 0 11-3.9 4.9L3 20v-3l2-2h2v-2h2l2.1-2.1A4 4 0 0115 7z",
  },
  {
    id: "oidc",
    label: "OIDC Overrides",
    admin: true,
    icon: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  },
];

function isTab(v: string | null): v is Tab {
  return v === "overview" || v === "packages" || v === "keys" || v === "oidc";
}

function ssoPortal(): string {
  const env = process.env.NEXT_PUBLIC_SSO_URL;
  if (env) return env.replace(/\/$/, "");
  if (typeof window !== "undefined" && window.location.hostname.endsWith(".dev.ttswebui.com")) {
    return "https://sso.dev.ttswebui.com";
  }
  return "https://sso.ttswebui.com";
}

function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

const ROLE_STYLES: Record<string, string> = {
  admin: "bg-destructive/15 text-destructive",
  write: "bg-primary/15 text-primary",
  read: "bg-muted text-muted-foreground",
};

function Spinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

function DashboardContent() {
  const { apiKey, clearApiKey, ssoUser, loading, role } = useApiKey();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const visibleTabs = useMemo(
    () => TABS.filter((t) => !t.admin || role === "admin"),
    [role]
  );
  const raw = searchParams.get("tab");
  const requested: Tab = isTab(raw) ? raw : "overview";
  // Admin-only tabs fall back to overview once we know the role isn't admin
  const activeTab: Tab =
    TABS.find((t) => t.id === requested)?.admin && !loading && role !== "admin" && role !== null
      ? "overview"
      : requested;

  const setTab = useCallback(
    (tab: Tab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      if (tab !== "packages") params.delete("pkg");
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  // Keyboard shortcuts: "/" focuses search, 1-4 switch tabs
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === "/") {
        const search = document.getElementById("global-search");
        if (search) {
          e.preventDefault();
          search.focus();
        }
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= visibleTabs.length) setTab(visibleTabs[n - 1].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visibleTabs, setTab]);

  const logoutHref =
    typeof window !== "undefined"
      ? `${ssoPortal()}/logout?rd=${encodeURIComponent(window.location.origin)}`
      : "#";

  return (
    <div className="min-h-full bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card/90 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/icon.svg" alt="" className="h-9 w-9 shrink-0 rounded-lg" />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold leading-tight text-foreground">
                Pository
              </h1>
              <p className="hidden text-xs text-muted-foreground sm:block">
                Package Repository Manager
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {role && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${ROLE_STYLES[role]}`}
                title={`Role: ${role}`}
              >
                {role}
              </span>
            )}
            {ssoUser && (
              <span
                className="hidden max-w-[10rem] truncate text-muted-foreground sm:inline"
                title={`Signed in via SSO (${ssoUser.role})`}
              >
                {ssoUser.name || ssoUser.user}
              </span>
            )}
            <ThemeToggle />
            {ssoUser && (
              <a
                href={logoutHref}
                className="rounded-md border border-border px-3 py-1.5 text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
              >
                Sign out
              </a>
            )}
            {apiKey && !ssoUser && (
              <button
                type="button"
                onClick={clearApiKey}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                title="Clear API key and return to login"
              >
                <Icon d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                <span>Logout</span>
              </button>
            )}
          </div>
        </div>

        <nav aria-label="Main" className="scrollbar-none overflow-x-auto px-2 sm:px-4">
          <ul className="flex min-w-max gap-1">
            {visibleTabs.map((t, i) => {
              const active = t.id === activeTab;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setTab(t.id)}
                    aria-current={active ? "page" : undefined}
                    title={`${t.label} (${i + 1})`}
                    className={`relative flex items-center gap-2 whitespace-nowrap rounded-t-md px-3 py-3 text-sm font-medium transition-colors ${
                      active
                        ? "text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    <Icon d={t.icon} />
                    {t.label}
                    {active && (
                      <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main className="px-4 py-6 sm:px-6">
        {loading ? (
          <Spinner />
        ) : (
          <>
            {activeTab === "overview" && <Overview />}
            {activeTab === "packages" && <Packages />}
            {activeTab === "keys" && <ApiKeys />}
            {activeTab === "oidc" && <OidcOverrides />}
          </>
        )}
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <ApiKeyProvider>
      <ToastProvider>
        <ConfirmProvider>
          <Suspense fallback={<Spinner />}>
            <DashboardContent />
          </Suspense>
        </ConfirmProvider>
      </ToastProvider>
    </ApiKeyProvider>
  );
}
