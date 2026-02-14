"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const API_KEY_PREFIX = "sk-ant-";

interface ApiKeyFormProps {
  onValidated: (key: string) => void;
}

export function ApiKeyForm({ onValidated }: ApiKeyFormProps) {
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const key = inputValue.trim();
    if (!key) return;

    // Client-side format check
    if (!key.startsWith(API_KEY_PREFIX)) {
      setError(`API key must start with "${API_KEY_PREFIX}".`);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Validation failed");
        return;
      }

      if (data.valid) {
        onValidated(key);
      } else {
        setError("Invalid API key. Please check your key and try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  const errorId = "api-key-error";

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Enter your API key</CardTitle>
          <CardDescription>
            An Anthropic API key is required to use this application.
            Your key is stored in memory only and never saved to disk.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" data-1p-ignore>
            <div className="flex flex-col gap-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="sk-ant-..."
                disabled={isLoading}
                autoFocus
                autoComplete="off"
                data-1p-ignore
                aria-invalid={!!error}
                aria-describedby={error ? errorId : undefined}
              />
              {error && (
                <p id={errorId} className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || !inputValue.trim()}
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin" />
                  Validating...
                </>
              ) : (
                "Validate & Continue"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
