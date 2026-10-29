# Workflow tests

A robot clicks through the program the way a builder does, to catch a change that breaks something
somewhere else before it's pushed.

**Run them** (with the program running on this PC — `npm run dev`):

```
npm run test:flows
```

About 15 seconds. Each step prints a ✓, or ✘ with what it was waiting for and a screenshot in
`test-results/`.

**What it does** (`builder-day.spec.ts`, in order): signs up a new company from an invitation and
confirms the email (from the test inbox), looks at the sample job, adds a client, starts a job, builds an
estimate line and saves it, writes a change order, invoices the client, enters a bill, reports a problem,
and removes the sample job.

**Its own company:** "Flow Test Builders" (flows@example.test), made by signing up and removed at the
end with everything in it (`cleanup.ts`) — before the run too, if a stopped run left one. No other
company is touched.

**When a step fails after a change to a screen** (a button renamed, say), the test needs the new
wording — the ✘ line says which step and what it was looking for.
