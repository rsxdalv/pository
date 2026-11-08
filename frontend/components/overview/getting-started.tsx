"use client";

import { aptRepoUrl, API_URL } from "@/lib/api";
import { CopyButton } from "./shared";

function Snippet({ title, code }: { title: string; code: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto rounded-md border border-border bg-muted p-3 text-xs leading-relaxed text-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function GettingStarted() {
  const base = API_URL.replace(/\/$/, "");
  const apt = `deb [trusted=yes] ${aptRepoUrl("default")} stable main`;
  const curl = [
    `curl -fS -X POST "${base}/api/v1/packages" \\`,
    `  -H "X-Api-Key: $POSITORY_API_KEY" \\`,
    `  -F "file=@./my-package_1.0.0_amd64.deb"`,
  ].join("\n");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Snippet title="Add the apt source (/etc/apt/sources.list.d/pository.list)" code={apt} />
      <Snippet title="Upload from CI with a write key" code={curl} />
    </div>
  );
}
