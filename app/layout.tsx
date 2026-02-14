import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ApiKeyProvider } from "@/components/api-key-provider";
import { Header } from "@/components/header";
import { ApiKeyGate } from "@/components/api-key-gate";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Image-Based Product Search",
  description:
    "Upload a furniture image and find matching products from the catalog using AI-powered visual search.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ApiKeyProvider>
          <Header />
          <main className="mx-auto max-w-5xl px-4 py-6">
            <ApiKeyGate>{children}</ApiKeyGate>
          </main>
        </ApiKeyProvider>
      </body>
    </html>
  );
}
