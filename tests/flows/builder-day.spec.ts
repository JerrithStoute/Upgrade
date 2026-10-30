import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { makeBuilderInvite } from "../../src/lib/builder-invites";
import { FLOW_COMPANY, FLOW_EMAIL } from "./cleanup";

/**
 * One builder's first day, the way they'd click it: sign up from an invitation, look at the sample job,
 * add a client and a job, build an estimate, write a change order, invoice the client, enter a bill,
 * report a problem, and remove the sample job. Each step builds on the one before (one page, in order),
 * so a step that breaks stops the run there — and says which.
 */

test.describe.configure({ mode: "serial" });

let page: Page;
let job = ""; // the job's address, once made

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});
test.afterAll(async () => {
  await page.close();
});

/** The newest email to `to` in the test inbox (.outbox — this PC saves emails instead of sending them). */
function lastEmailTo(to: string) {
  const dir = path.join(process.cwd(), ".outbox");
  const mails = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as { to: string; at: string; subject: string; text: string })
    .filter((m) => m.to === to)
    .sort((a, b) => b.at.localeCompare(a.at));
  return mails[0];
}

/** Types into a box that saves when you leave it (the estimate's cells). */
async function typeIn(box: ReturnType<Page["locator"]>, value: string) {
  await box.click();
  await box.fill(value);
  await box.press("Tab");
}

test("a new builder signs up from an invitation and confirms their email", async () => {
  const invite = await makeBuilderInvite({ email: FLOW_EMAIL, name: "Flo Tester", companyName: FLOW_COMPANY });
  await page.goto(`/signup?invite=${encodeURIComponent(invite)}`);
  await expect(page.getByRole("heading", { name: "Start your company" })).toBeVisible();
  await page.locator("[name=companyName]").fill(FLOW_COMPANY);
  await page.locator("[name=name]").fill("Flo Tester");
  await page.locator("[name=password]").fill("flow-test-password-2026");
  await expect(page.locator("[name=sampleJob]")).toBeChecked();
  await page.locator("form button[type=submit]").click();
  await expect(page.getByText(FLOW_EMAIL).first()).toBeVisible();

  // The confirmation email, from the test inbox.
  await expect.poll(() => lastEmailTo(FLOW_EMAIL)?.text ?? "").toContain("/verify?token=");
  const link = /https?:\/\/[^\s]+\/verify\?token=[^\s]+/.exec(lastEmailTo(FLOW_EMAIL).text)![0];
  await page.goto(new URL(link).pathname + new URL(link).search);
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test("the sample job is there to explore", async () => {
  await page.getByRole("link", { name: "Explore the sample job" }).click();
  await expect(page.getByText("This is a sample job")).toBeVisible();
  await page.getByRole("link", { name: "Estimate", exact: true }).click();
  await expect(page.getByText("$331,036.13").first()).toBeVisible();
});

test("adds a client", async () => {
  await page.goto("/clients/new");
  await page.locator("[name=firstName]").fill("Casey");
  await page.locator("[name=lastName]").fill("Flowers");
  await page.locator("[name=address]").fill("42 Test Road");
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page).toHaveURL(/\/clients\/c[a-z0-9]+$/);
  await expect(page.getByText("Casey Flowers").first()).toBeVisible();
});

test("starts a job for that client", async () => {
  await page.goto("/projects/new");
  await page.getByRole("radio", { name: /^Custom home/ }).click();
  await page.locator("[name=name]").fill("Flowers Residence");
  await page.locator("[name=clientId]").selectOption({ label: "Casey Flowers" });
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/c[a-z0-9]+$/);
  job = new URL(page.url()).pathname;
  await expect(page.getByRole("heading", { name: "Flowers Residence" })).toBeVisible();
});

test("builds an estimate: a line, saved, adds up", async () => {
  await page.goto(`${job}/estimate`);
  await page.getByRole("button", { name: "Create estimate" }).click();
  await page.getByRole("button", { name: "Blank division" }).click();
  // A new division opens its first item's details, as it would for anyone — closed, to work in the sheet.
  await expect(page.getByRole("dialog", { name: "New item details" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "New item details" })).toBeHidden();
  const expand = page.getByRole("button", { name: "Expand", exact: true }).first();
  if (await expand.isVisible()) await expand.click();
  await page.getByRole("button", { name: "+ Add item" }).first().click();
  await typeIn(page.getByLabel("Quantity").first(), "10");
  await typeIn(page.getByLabel("Unit cost").first(), "100");
  await typeIn(page.getByLabel("Markup %").first(), "20");
  // 10 × $100, plus 20%.
  await expect(page.getByText("$1,200.00").first()).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
  // It asks: over this version, or as a new one.
  await page.getByRole("button", { name: /^Save over v1/ }).click();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
  // Still there after a fresh load — it saved.
  await page.reload();
  await expect(page.getByText("$1,200.00").first()).toBeVisible();
  await expect(page.locator("tfoot").getByText("TOTALS", { exact: false })).toBeVisible();
});

test("writes a change order", async () => {
  await page.goto(`${job}/change-orders/new`);
  await page.locator("[name=title]").fill("Upgrade the front door");
  await page.locator("textarea[name=description]").fill("Client asked for a fiberglass front door.");
  await page.getByRole("button", { name: "Create change order" }).click();
  await expect(page).toHaveURL(/\/change-orders\/c[a-z0-9]+/);
  await expect(page.getByText("Upgrade the front door").first()).toBeVisible();
});

test("invoices the client", async () => {
  await page.goto(`${job}/invoices/new`);
  await page.locator("[name=title]").fill("Deposit");
  await page.locator("[name=itemDescription]").first().fill("Contract deposit");
  await page.locator("[name=itemQuantity]").first().fill("1");
  await page.locator("[name=itemUnitPrice]").first().fill("5000");
  await page.getByRole("button", { name: "Create invoice" }).click();
  await expect(page).toHaveURL(/\/invoices\/c[a-z0-9]+/);
  await expect(page.getByText("$5,000.00").first()).toBeVisible();
});

test("enters a bill against the job", async () => {
  await page.goto(`${job}/budget`);
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Add expense" }) });
  await form.locator("[name=vendor]").fill("Flow Lumber Co");
  await form.locator("[name=amount]").fill("750");
  await form.locator("[name=description]").fill("Framing nails");
  await form.getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByText("Flow Lumber Co").first()).toBeVisible();
  await expect(page.getByText("$750.00").first()).toBeVisible();
});

test("logs a warranty request, sends someone, and closes it", async () => {
  await page.goto(`${job}/warranty`);
  await page.getByLabel("What needs fixing?").fill("Door sticks");
  await page.getByLabel("Where in the house?").fill("Back door");
  await page.getByRole("button", { name: "Add request" }).click();
  await expect(page).toHaveURL(/\/warranty\/c[a-z0-9]+$/);
  await page.getByLabel("Someone on your team").selectOption({ label: "Flo Tester" });
  await page.getByLabel("Day", { exact: true }).fill("2026-11-02");
  await page.getByRole("button", { name: "Save", exact: true }).last().click();
  await expect(page.getByText("Scheduled", { exact: true }).first()).toBeVisible();
  await page.getByLabel("What was done (or why it isn't covered)").fill("Planed the door and adjusted the hinges.");
  await page.getByRole("button", { name: "Close request" }).click();
  await expect(page.getByText("Planed the door and adjusted the hinges.")).toBeVisible();
  await page.goto("/warranty?show=done");
  await expect(page.getByRole("link", { name: "Door sticks" })).toBeVisible();
});

test("sets up doors in the Catalog: less detail, and a part for the odd door", async () => {
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Catalog", exact: true }).first().click();
  await expect(page).toHaveURL(/\/catalog$/);
  await page.getByRole("link", { name: /^Doors/ }).click();
  await expect(page.getByText("A usual door is named 2868 Int Prehung Hollow 2x4 Jamb")).toBeVisible();
  // Don't track the core.
  await page.locator("li").filter({ hasText: /^Core/ }).getByLabel("Ask for it").uncheck();
  // A Material part: Wood as the usual, in the name only when it isn't.
  await page.getByPlaceholder("Material").fill("Material");
  await page.getByRole("button", { name: "Add part" }).click();
  await page.getByLabel("Add a material choice").fill("Wood");
  await page.getByLabel("Add a material choice").press("Enter");
  await page.getByLabel("Add a material choice").fill("Metal");
  await page.getByLabel("Add a material choice").press("Enter");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("A usual door is named 2868 Int Prehung 2x4 Jamb")).toBeVisible();
  await expect(page.getByRole("button", { name: "Take Metal off Material" })).toBeVisible();
});

test("reports a problem", async () => {
  await page.getByRole("button", { name: /Report a problem/ }).click();
  await page.getByLabel("What happened").fill("Workflow test — please ignore.");
  await page.getByRole("dialog").getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Thanks — it's sent.")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).last().click();
});

test("removes the sample job", async () => {
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Explore the sample job" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Remove sample job" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("button", { name: "Add a sample job" })).toBeVisible();
});
