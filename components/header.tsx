"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApiKey } from "@/components/api-key-provider";

export function Header() {
  const pathname = usePathname();
  const { apiKey, clearApiKey } = useApiKey();

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-semibold">
            Furniture Search
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/"
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                pathname === "/"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Search
            </Link>
            <Link
              href="/admin"
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                pathname === "/admin"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Admin
            </Link>
          </nav>
        </div>
        {apiKey && (
          <button
            onClick={clearApiKey}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Change API Key
          </button>
        )}
      </div>
    </header>
  );
}
