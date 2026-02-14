/**
 * Step 4 verification — API Route Handlers end-to-end.
 *
 * Usage:
 *   1. Start the dev server: npm run dev
 *   2. In another terminal: npx tsx --env-file=.env.local scripts/verify-step4.ts
 *
 * Requires:
 *   - ANTHROPIC_API_KEY in .env.local
 *   - A test image at promptfoo/test-images/modern-sofa.jpg
 *   - Next.js dev server running on http://localhost:3000
 */

import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY environment variable.");
  process.exit(1);
}

const API_KEY: string = process.env.ANTHROPIC_API_KEY;

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function readNdjsonStream(response: Response): Promise<unknown[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const chunks: unknown[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop()!;

    for (const line of lines) {
      if (line.trim()) {
        chunks.push(JSON.parse(line));
      }
    }
  }

  if (buffer.trim()) {
    chunks.push(JSON.parse(buffer));
  }

  return chunks;
}

function loadImageAsBlob(relativePath: string): { blob: Blob; fileName: string } {
  const fullPath = path.join(process.cwd(), relativePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`Missing test image: ${relativePath}`);
    process.exit(1);
  }
  const buffer = fs.readFileSync(fullPath);
  const ext = path.extname(fullPath).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  };
  const blob = new Blob([buffer], { type: mimeMap[ext] ?? "image/jpeg" });
  return { blob, fileName: path.basename(fullPath) };
}

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const label = `${passed + failed + 1}. ${name}`;
  try {
    await fn();
    passed++;
    console.log(`${label.padEnd(50, ".")} ✓`);
  } catch (error) {
    failed++;
    console.log(`${label.padEnd(50, ".")} ✗`);
    console.error(`   ${(error as Error).message}`);
  }
}

async function main() {
  console.log("Step 4 Verification — API Route Handlers");
  console.log("=========================================\n");

  // --- Test 1: POST /api/key (valid key) ---
  await test("POST /api/key (valid key)", async () => {
    const res = await fetch(`${BASE_URL}/api/key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: API_KEY }),
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.valid === true, `Expected valid=true, got ${JSON.stringify(data)}`);
  });

  // --- Test 2: POST /api/key (invalid key) ---
  await test("POST /api/key (invalid key)", async () => {
    const res = await fetch(`${BASE_URL}/api/key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: "sk-ant-invalid-key-12345" }),
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.valid === false, `Expected valid=false, got ${JSON.stringify(data)}`);
  });

  // --- Test 3: POST /api/key (missing key) ---
  await test("POST /api/key (missing key)", async () => {
    const res = await fetch(`${BASE_URL}/api/key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    const data = await res.json();
    assert("error" in data, "Expected error field in response");
  });

  // --- Test 4: POST /api/search (furniture image) ---
  await test("POST /api/search (furniture image)", async () => {
    const { blob, fileName } = loadImageAsBlob("promptfoo/test-images/modern-sofa.jpg");
    const formData = new FormData();
    formData.append("image", blob, fileName);

    const res = await fetch(`${BASE_URL}/api/search`, {
      method: "POST",
      headers: { "X-API-Key": API_KEY },
      body: formData,
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);

    const chunks = await readNdjsonStream(res);
    assert(chunks.length >= 2, `Expected at least 2 chunks, got ${chunks.length}`);

    const first = chunks[0] as Record<string, unknown>;
    assert(first.phase === "candidates", `Expected phase=candidates, got ${first.phase}`);
    assert(Array.isArray(first.candidates), "Expected candidates array");
    assert((first.candidates as unknown[]).length > 0, "Expected non-empty candidates");

    const second = chunks[1] as Record<string, unknown>;
    assert(second.phase === "results", `Expected phase=results, got ${second.phase}`);
    assert(Array.isArray(second.results), "Expected results array");
    assert("scoreThreshold" in second, "Expected scoreThreshold in results chunk");

    const results = second.results as Array<{ score: number }>;
    for (let i = 1; i < results.length; i++) {
      assert(results[i].score <= results[i - 1].score, "Results not sorted by score descending");
    }

    const candidates = first.candidates as unknown[];
    const analysis = first.analysis as Record<string, unknown>;
    const scores = results.map((r) => r.score);
    console.log(`   → Phase 1: ${candidates.length} candidates (${analysis.category} / ${analysis.type})`);
    console.log(`   → Phase 2: ${results.length} scored results [${scores.join(", ")}]`);
  });

  // --- Test 5: POST /api/search (non-furniture) ---
  await test("POST /api/search (non-furniture)", async () => {
    const { blob, fileName } = loadImageAsBlob("promptfoo/test-images/landscape.jpg");
    const formData = new FormData();
    formData.append("image", blob, fileName);

    const res = await fetch(`${BASE_URL}/api/search`, {
      method: "POST",
      headers: { "X-API-Key": API_KEY },
      body: formData,
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);

    const chunks = await readNdjsonStream(res);
    assert(chunks.length === 1, `Expected 1 chunk, got ${chunks.length}`);

    const first = chunks[0] as Record<string, unknown>;
    assert(first.phase === "not-furniture", `Expected phase=not-furniture, got ${first.phase}`);
  });

  // --- Test 6: POST /api/search (validation) ---
  await test("POST /api/search (validation)", async () => {
    // Missing image
    const formData1 = new FormData();
    const res1 = await fetch(`${BASE_URL}/api/search`, {
      method: "POST",
      headers: { "X-API-Key": API_KEY },
      body: formData1,
    });
    assert(res1.status === 400, `Missing image: expected 400, got ${res1.status}`);

    // Invalid file type
    const formData2 = new FormData();
    const txtBlob = new Blob(["hello"], { type: "text/plain" });
    formData2.append("image", txtBlob, "test.txt");
    const res2 = await fetch(`${BASE_URL}/api/search`, {
      method: "POST",
      headers: { "X-API-Key": API_KEY },
      body: formData2,
    });
    assert(res2.status === 400, `Invalid type: expected 400, got ${res2.status}`);
    const data2 = await res2.json();
    assert(
      (data2.error as string).includes("Allowed"),
      "Expected error to mention allowed types",
    );

    // Missing API key
    const formData3 = new FormData();
    const { blob, fileName } = loadImageAsBlob("promptfoo/test-images/modern-sofa.jpg");
    formData3.append("image", blob, fileName);
    const res3 = await fetch(`${BASE_URL}/api/search`, {
      method: "POST",
      body: formData3,
    });
    assert(res3.status === 401, `Missing key: expected 401, got ${res3.status}`);
  });

  // --- Test 7: GET /api/admin/config ---
  await test("GET /api/admin/config", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/config`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert("resultsCount" in data, "Missing resultsCount");
    assert("maxCandidates" in data, "Missing maxCandidates");
    assert("scoreThreshold" in data, "Missing scoreThreshold");
    assert("imageAnalysisPrompt" in data, "Missing imageAnalysisPrompt");
    assert("rerankingPrompt" in data, "Missing rerankingPrompt");
  });

  // --- Test 8: PUT /api/admin/config (valid) ---
  await test("PUT /api/admin/config (valid)", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resultsCount: 8 }),
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.resultsCount === 8, `Expected resultsCount=8, got ${data.resultsCount}`);

    // Verify GET reflects the change
    const getRes = await fetch(`${BASE_URL}/api/admin/config`);
    const getData = await getRes.json();
    assert(getData.resultsCount === 8, "GET did not reflect update");

    // Restore default
    await fetch(`${BASE_URL}/api/admin/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resultsCount: 6 }),
    });
  });

  // --- Test 9: PUT /api/admin/config (invalid) ---
  await test("PUT /api/admin/config (invalid)", async () => {
    const res1 = await fetch(`${BASE_URL}/api/admin/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resultsCount: 99 }),
    });
    assert(res1.status === 400, `resultsCount=99: expected 400, got ${res1.status}`);

    const res2 = await fetch(`${BASE_URL}/api/admin/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageAnalysisPrompt: "" }),
    });
    assert(res2.status === 400, `Empty prompt: expected 400, got ${res2.status}`);

    const res3 = await fetch(`${BASE_URL}/api/admin/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert(res3.status === 400, `Empty update: expected 400, got ${res3.status}`);
  });

  // --- Test 10: GET /api/admin/taxonomy ---
  await test("GET /api/admin/taxonomy", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/taxonomy`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data), "Expected array response");
    assert(data.length > 0, "Expected non-empty taxonomy");

    const first = data[0] as Record<string, unknown>;
    assert(typeof first.category === "string", "Expected category string");
    assert(Array.isArray(first.types), "Expected types array");

    const totalTypes = data.reduce(
      (sum: number, item: { types: string[] }) => sum + item.types.length,
      0,
    );
    console.log(`   → ${data.length} categories, ${totalTypes} types`);
  });

  // --- Test 11: POST /api/feedback (valid) ---
  await test("POST /api/feedback (valid)", async () => {
    const res = await fetch(`${BASE_URL}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "test-123", rating: "up" }),
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.success === true, "Expected success=true");
    assert(typeof data.counts?.up === "number", "Expected counts.up");
    assert(typeof data.counts?.down === "number", "Expected counts.down");
  });

  // --- Test 12: POST /api/feedback (invalid) ---
  await test("POST /api/feedback (invalid)", async () => {
    const res = await fetch(`${BASE_URL}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "test", rating: "maybe" }),
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  // Summary
  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
  console.log("\nAll tests passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
