import { defineConfig } from "@playwright/test";

// The database and keys the program uses on this PC (the tests make an invitation and clean up with them).
try {
  process.loadEnvFile(".env");
} catch {
  /* no .env: the environment has it */
}

/**
 * The workflow tests (`npm run test:flows`): a robot clicks through the program the way a builder does —
 * signs up, adds a client and a job, builds an estimate, a change order, an invoice and a bill — against
 * the program running on this PC (npm run dev). It works in a throwaway company of its own, made by
 * signing up and removed at the end (tests/flows/cleanup.ts): no real company is touched.
 *
 * Uses the Chrome already on this PC (no browser to download). See tests/flows/README.md.
 */
export default defineConfig({
  testDir: "tests/flows",
  // One builder's day, in order: one at a time.
  workers: 1,
  fullyParallel: false,
  // (Generous: the first visit to a page on this PC builds it first.)
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  globalSetup: "./tests/flows/global-setup.ts",
  globalTeardown: "./tests/flows/global-teardown.ts",
  use: {
    baseURL: process.env.FLOWS_URL || "http://localhost:3000",
    channel: "chrome",
    headless: true,
    viewport: { width: 1400, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
