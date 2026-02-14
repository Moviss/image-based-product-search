"use client";

import { useApiKey } from "@/components/api-key-provider";
import { ApiKeyForm } from "@/components/api-key-form";

export function ApiKeyGate({ children }: { children: React.ReactNode }) {
  const { apiKey, setApiKey } = useApiKey();

  if (apiKey) {
    return <>{children}</>;
  }

  return <ApiKeyForm onValidated={setApiKey} />;
}
