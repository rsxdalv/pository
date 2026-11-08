import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import pkg from "../package.json";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: `Pository - v${pkg.version}`,
  description: "A lightweight Debian package artifact repository management dashboard",
};

// Runs before paint: applies stored theme ("light" | "dark" | "system") to <html>
const themeScript = `(function(){try{var t=localStorage.getItem("pository_theme")||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var c=document.documentElement.classList;d?c.add("dark"):c.remove("dark");}catch(e){document.documentElement.classList.add("dark");}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${inter.className} flex min-h-screen flex-col`}>
        <div className="flex-1">{children}</div>
        <footer className="border-t border-border px-4 py-4 text-xs text-muted-foreground sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Pository v{pkg.version}</span>
            <span className="hidden sm:inline">
              Shortcuts: <kbd className="rounded border border-border px-1">/</kbd> search,{" "}
              <kbd className="rounded border border-border px-1">1</kbd>-
              <kbd className="rounded border border-border px-1">4</kbd> tabs
            </span>
            <a
              href="https://github.com/rsxdalv/pository"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded underline-offset-2 hover:text-foreground hover:underline"
            >
              GitHub
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
