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

test("adds a lead, edits it right on its page, logs a call, and finds it by typing", async () => {
  await page.goto("/leads/new");
  await page.locator("[name=firstName]").fill("Lee");
  await page.locator("[name=lastName]").fill("Prospect");
  await page.getByRole("button", { name: "Add lead" }).click();
  await expect(page).toHaveURL(/\/leads\/c[a-z0-9]+$/);
  const main = page.locator("main");
  await main.getByRole("button", { name: "Edit" }).click();
  await main.locator("[name=phone]").fill("555-0177");
  await main.getByRole("button", { name: "Save" }).click();
  await expect(main.getByRole("link", { name: /555-0177/ })).toBeVisible();
  await main.getByPlaceholder("What happened", { exact: true }).fill("Called about a garage");
  await main.getByRole("button", { name: "Add", exact: true }).click();
  await expect(main.getByText("Called about a garage")).toBeVisible();
  await page.goto("/leads?view=list");
  await page.getByPlaceholder(/Type a name/).fill("555-0177");
  await expect(page.locator("#lead-list tr[data-find]:visible")).toHaveCount(1);
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

test("edits the client right on their page, then starts a job from it", async () => {
  const main = page.locator("main");
  await main.getByRole("button", { name: "Edit" }).click();
  await main.locator("[name=phone]").fill("555-0142");
  await main.getByRole("button", { name: "Save" }).click();
  await expect(main.getByRole("link", { name: /555-0142/ })).toBeVisible();
  await expect(page).toHaveURL(/\/clients\/c[a-z0-9]+$/);
  await main.getByRole("link", { name: "+ Start a job for Casey" }).click();
  await expect(page).toHaveURL(/\/projects\/new\?client=/);
});

test("starts a job for that client", async () => {
  await page.getByRole("radio", { name: /^Custom home/ }).click();
  await page.locator("[name=name]").fill("Flowers Residence");
  await expect(page.locator("[name=clientId] option:checked")).toHaveText("Casey Flowers");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/c[a-z0-9]+$/);
  job = new URL(page.url()).pathname;
  await expect(page.getByRole("heading", { name: "Flowers Residence" })).toBeVisible();
});

test("edits the job's details right on its Overview", async () => {
  await page.goto(job);
  const main = page.locator("main");
  await main.getByRole("button", { name: "Edit" }).first().click();
  await main.locator("[name=description]").fill("Two-story with a walkout");
  await main.getByRole("button", { name: "Save" }).click();
  await expect(main.getByText("Two-story with a walkout")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${job}$`));
});

test("finds that job on the Projects list by typing the client's name", async () => {
  await page.goto("/projects");
  await page.getByPlaceholder(/Type a job/).fill("casey flowers");
  await expect(page.getByText("1 match")).toBeVisible();
  await expect(page.locator("#project-list tr[data-find]:visible").first()).toContainText("Flowers Residence");
});

test("uploads a plan, adds a takeoff from the new-takeoff panel, renames the plan from Edit and deletes it", async () => {
  await page.goto(`${job}/plans`);
  await expect(page.getByText("Drop plan files here, or click to choose")).toBeVisible();
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");
  await page.getByLabel("Choose plan files").setInputFiles({ name: "Flow plans.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(page.getByRole("link", { name: "Measure" })).toBeVisible();

  // The new-takeoff panel: type chips, short settings, Cancel and Add at the top, a one-line item add.
  await page.getByRole("link", { name: "Measure" }).click();
  await page.getByRole("button", { name: "New takeoff" }).click();
  await page.getByRole("menuitem", { name: "Walls" }).click();
  const panel = page.locator("form").filter({ has: page.getByText("New takeoff", { exact: true }) });
  await expect(panel.getByRole("link", { name: "Cancel" })).toBeVisible();
  await expect(panel.getByText("Plates", { exact: true })).toBeVisible();
  await panel.getByLabel("Type").selectOption("BEAM");
  await expect(panel.getByLabel("Plies")).toBeVisible();
  await panel.getByLabel("Type").selectOption("AREA");
  await panel.getByLabel("Name", { exact: true }).fill("Flow LVP");
  await panel.getByRole("button", { name: "Add", exact: true }).click();
  await panel.getByLabel("Item", { exact: true }).fill("Flow plank");
  await panel.getByRole("button", { name: "Add", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Flow plank", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Add takeoff" }).first().click();
  // It's on the list, and the find box narrows the list to it; its edit panel has Make a copy.
  await page.getByLabel("Find a takeoff").fill("flow l");
  await expect(page.getByText("Found", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Edit Flow LVP" }).click();
  const edit = page.locator("form").filter({ has: page.getByText("Edit Flow LVP", { exact: true }) });
  await expect(edit.getByRole("button", { name: "Make a copy" })).toBeVisible();
  await expect(page.getByText("Flow plank")).toBeVisible();
  await edit.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(page.getByText('Saved "Flow LVP"')).toBeVisible();

  await page.goto(`${job}/plans`);
  await page.getByRole("link", { name: /^Edit Flow plans/ }).click();
  await page.getByLabel("Plan name").fill("Flow permit set");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("link", { name: "Flow permit set", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Edit Flow permit set" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete plan…" }).click();
  await expect(page.getByRole("link", { name: "Flow permit set", exact: true })).toHaveCount(0);
});

test("opens Daily Logs: one card with New log and the Photos folder link", async () => {
  await page.goto(`${job}/daily-logs`);
  await expect(page.getByRole("link", { name: "New log" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Photos folder" })).toBeVisible();
});

test("writes a daily log, edits it and deletes it", async () => {
  await page.goto(`${job}/daily-logs/new`);
  await page.getByLabel("Work done").fill("Flow set the sill plates");
  await page.getByLabel("Weather", { exact: true }).selectOption({ index: 1 });
  await page.getByLabel("High °F").fill("60");
  await page.getByLabel("Low °F").fill("40");
  await page.getByRole("button", { name: "Save log" }).first().click();
  await expect(page.getByText("Flow set the sill plates")).toBeVisible();
  await page.getByRole("link", { name: /^Edit the log for/ }).first().click();
  await expect(page.getByRole("heading", { name: "Edit log" })).toBeVisible();
  await page.getByLabel("Issues / delays").fill("Flow waiting on anchor bolts");
  await page.getByRole("button", { name: "Save log" }).last().click();
  await expect(page.getByText("Flow waiting on anchor bolts")).toBeVisible();
  await page.getByRole("link", { name: /^Edit the log for/ }).first().click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete log…" }).click();
  await expect(page.getByText("Flow set the sill plates")).toHaveCount(0);
});

test("adds a to-do on the job, finds it, checks it off and deletes it", async () => {
  await page.goto(`${job}/todos`);
  await page.getByRole("link", { name: "Add to-do" }).click();
  await page.getByLabel("Title").fill("Flow call the framer");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Flow call the framer")).toBeVisible();
  await page.getByPlaceholder("Find a to-do…").fill("zzz");
  await expect(page.getByText("None match.")).toBeVisible();
  await page.getByPlaceholder("Find a to-do…").fill("framer");
  await page.getByRole("button", { name: "Mark done" }).first().click();
  await expect(page.getByText("Flow call the framer")).toHaveCount(0);
  await page.getByRole("link", { name: "Done", exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await page.locator("li", { hasText: "Flow call the framer" }).getByRole("button", { name: "Delete…" }).click();
  await expect(page.getByText("Flow call the framer")).toHaveCount(0);
});

test("drops a file on the Files tab, finds it, makes it internal and deletes it", async () => {
  await page.goto(`${job}/files`);
  await page.getByLabel("Folder").selectOption("Permits");
  // Dropped on the drop zone, the way someone drags it in from their computer: it uploads right away.
  const drop = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(["%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"], "Flow permit.pdf", { type: "application/pdf" }));
    return dt;
  });
  const zone = page.getByRole("button", { name: "Drop files here, or click to choose" });
  await zone.dispatchEvent("dragover", { dataTransfer: drop });
  await zone.dispatchEvent("drop", { dataTransfer: drop });
  const row = page.locator("li", { hasText: "Flow permit.pdf" });
  await expect(row).toBeVisible();
  await expect(row.getByText("Permits", { exact: true })).toBeVisible();
  await page.getByPlaceholder("Find a file…").fill("zzz");
  await expect(page.getByText("None match.")).toBeVisible();
  await page.getByPlaceholder("Find a file…").fill("flow permit");
  await row.getByRole("button", { name: "Client" }).click();
  await expect(row.getByRole("button", { name: "Internal" })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Delete…" }).click();
  await expect(page.getByText("Flow permit.pdf")).toHaveCount(0);
});

test("marks up a saved photo, sees the original, and undoes the markup", async () => {
  await page.goto(`${job}/files`);
  await page.getByLabel("Folder").selectOption("Photos");
  const drop = await page.evaluateHandle(async () => {
    const c = document.createElement("canvas");
    c.width = c.height = 60;
    const g = c.getContext("2d")!;
    g.fillStyle = "#c33";
    g.fillRect(0, 0, 60, 60);
    const blob = await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), "image/png"));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "Flow photo.png", { type: "image/png" }));
    return dt;
  });
  const zone = page.getByRole("button", { name: "Drop files here, or click to choose" });
  await zone.dispatchEvent("drop", { dataTransfer: drop });
  const row = page.locator("li", { hasText: "Flow photo" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Mark up" }).click();
  const editor = page.getByRole("dialog", { name: "Mark up photo" });
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toHaveCount(0);
  await expect(row.getByText("Marked up")).toBeVisible();
  await expect(row.getByRole("link", { name: "Original" })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Undo markup…" }).click();
  await expect(row.getByText("Marked up")).toHaveCount(0);
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Delete…" }).click();
  await expect(page.getByText("Flow photo")).toHaveCount(0);
});

test("starts an internal conversation, replies, finds it and deletes it", async () => {
  await page.goto(`${job}/messages`);
  await page.getByLabel("Subject").fill("Flow framing question");
  await page.getByLabel("Client sees it").uncheck();
  await page.getByLabel("First message").fill("Are the trusses ordered?");
  await page.getByRole("button", { name: "Start conversation" }).click();
  await expect(page.getByRole("heading", { name: "Flow framing question" })).toBeVisible();
  await page.getByLabel("Reply").fill("Yes, Thursday.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Yes, Thursday.").last()).toBeVisible();
  await page.getByPlaceholder("Find a conversation…").fill("zzz");
  await expect(page.getByText("None match.")).toBeVisible();
  await page.getByPlaceholder("Find a conversation…").fill("thursday");
  await expect(page.locator("#thread-list li", { hasText: "Flow framing question" })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete…" }).click();
  await expect(page.getByRole("heading", { name: "Flow framing question" })).toHaveCount(0);
});

test("opens the Bids tab with its sections in order", async () => {
  await page.goto(`${job}/bids`);
  for (const name of ["What to send, and who to", "Send to subs", "Sent", "Compare and take"])
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
});

test("opens the Material list and switches prices off and on", async () => {
  await page.goto(`${job}/materials`);
  await expect(page.getByRole("link", { name: "Send to vendors" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Print" })).toBeVisible();
  await page.getByRole("link", { name: "No prices" }).click();
  await expect(page).toHaveURL(/prices=0/);
  await page.getByRole("link", { name: "Prices", exact: true }).click();
  await expect(page).not.toHaveURL(/prices=0/);
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
  // Rename, right on its line at the top.
  await page.getByRole("link", { name: "Rename" }).click();
  await page.getByLabel("Estimate name").fill("Flow estimate");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Flow estimate" })).toBeVisible();
  await expect(page.getByText("Job prices follow the Item List")).toBeVisible();
});

test("opens Selections: its line at the top and Other selections", async () => {
  await page.goto(`${job}/selections`);
  await expect(page.getByText("still to choose")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Other selections" })).toBeVisible();
  await expect(page.getByRole("link", { name: "New selection" })).toBeVisible();
});

test("writes a change order", async () => {
  await page.goto(`${job}/change-orders/new`);
  await page.locator("[name=title]").fill("Upgrade the front door");
  await page.locator("textarea[name=description]").fill("Client asked for a fiberglass front door.");
  await page.getByRole("button", { name: "Create change order" }).click();
  await expect(page).toHaveURL(/\/change-orders\/c[a-z0-9]+/);
  await expect(page.getByText("Upgrade the front door").first()).toBeVisible();
  // Its page: the money big at the top, and the way back.
  await expect(page.getByText("New contract total", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send for approval" })).toBeVisible();
  await expect(page.getByRole("link", { name: "← Change orders" })).toBeVisible();
  // On the list: the money up top, and Find narrows it.
  await page.goto(`${job}/change-orders`);
  await expect(page.getByText("Pending approval", { exact: true })).toBeVisible();
  await page.getByPlaceholder("Find a change order…").fill("front door");
  await expect(page.getByRole("link", { name: "Upgrade the front door" })).toBeVisible();
  await page.getByPlaceholder("Find a change order…").fill("zzz");
  await expect(page.getByText("None match.")).toBeVisible();
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

  // Add a line and change it, right on the invoice.
  await page.getByRole("link", { name: "+ Add a line" }).click();
  await page.getByLabel("Description").fill("Extra trim");
  await page.getByLabel("Unit price").fill("200");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("cell", { name: "$5,200.00" })).toBeVisible();
  await page.getByRole("row", { name: /Extra trim/ }).getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Unit price").fill("300");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("cell", { name: "$5,300.00" })).toBeVisible();

  // Details edit in place.
  await page.getByRole("link", { name: "Edit" }).last().click();
  await expect(page.getByLabel("Title")).toHaveValue("Deposit");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Change the details")).toHaveCount(0);

  // It's on the Invoices list in the menu, and the find box narrows to it.
  await page.goto("/invoices");
  await page.getByLabel("Search").fill("deposit");
  await expect(page.getByRole("link", { name: "Deposit" }).first()).toBeVisible();
  await page.getByLabel("Search").fill("zz nothing like this");
  await expect(page.getByText("None match.")).toBeVisible();

  // Opening one from the list (even by its job) lands on the invoice, and its back link returns to the list.
  await page.goto("/invoices?status=DRAFT");
  await page.locator("tr", { hasText: "Deposit" }).getByRole("link").first().click();
  await expect(page).toHaveURL(/\/invoices\/c[a-z0-9]+$/);
  await expect(page.getByRole("link", { name: /invoices$/ }).filter({ hasText: "#" })).toBeVisible();
  await page.getByRole("link", { name: "← All invoices" }).click();
  await expect(page).toHaveURL(/\/invoices\?status=DRAFT$/);

  // A second draft, so Next has somewhere to go: the list's first invoice says "1 of 2", Next opens the second.
  await page.goto(`${job}/invoices/new`);
  await page.locator("[name=title]").fill("Second draw");
  await page.locator("[name=itemDescription]").first().fill("Framing");
  await page.locator("[name=itemQuantity]").first().fill("1");
  await page.locator("[name=itemUnitPrice]").first().fill("1000");
  await page.getByRole("button", { name: "Create invoice" }).click();
  await expect(page).toHaveURL(/\/invoices\/c[a-z0-9]+$/);
  await page.goto("/invoices?status=DRAFT");
  const rows = await page.locator("#invoice-list [data-href]").count();
  await page.locator("#invoice-list [data-href]").first().getByRole("link").last().click();
  await expect(page.getByText(`1 of ${rows}`)).toBeVisible();
  await page.getByRole("link", { name: "Next →" }).click();
  await expect(page.getByText(`2 of ${rows}`)).toBeVisible();
});

test("adds to inventory, counts it, and removes it", async () => {
  await page.goto("/inventory");
  await page.getByRole("link", { name: "+ Add to inventory" }).click();
  await page.getByLabel("Item").fill("Flow test studs");
  await page.getByLabel("How many").fill("10");
  await page.getByLabel("Unit").fill("ea");
  await page.getByLabel("Cost each").fill("5");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const row = page.locator("tbody", { hasText: "Flow test studs" });
  await expect(row).toContainText("$50.00");
  await row.getByRole("link", { name: "Count" }).click();
  await page.getByLabel("Count of Flow test studs").fill("8");
  await page.getByRole("button", { name: "Set count" }).click();
  await expect(page.locator("tbody", { hasText: "Flow test studs" })).toContainText("$40.00");
  await page.locator("tbody", { hasText: "Flow test studs" }).getByRole("link", { name: "Flow test studs" }).click();
  await expect(page.getByText("Counted −2")).toBeVisible();
  await page.locator("tbody", { hasText: "Flow test studs" }).getByRole("link", { name: "Count" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Remove from inventory…" }).click();
  await expect(page.getByText("Flow test studs")).toHaveCount(0);
});

test("enters a sub's bill, approves it, pays it, and deletes it", async () => {
  await page.goto(`${job}/purchasing/bills/new`);
  await page.locator("[name=vendor]").fill("Flow Framing");
  await page.getByLabel("For", { exact: true }).fill("Wall framing");
  await page.getByLabel("Amount").fill("1200");
  await page.getByRole("button", { name: "Save bill" }).click();
  await expect(page).toHaveURL(/\/bills\/c[a-z0-9]+$/);
  await expect(page.getByRole("heading", { name: /Bill from Flow Framing/ })).toBeVisible();
  // Edit opens the form in place; Cancel closes it.
  await page.getByRole("link", { name: "Edit" }).first().click();
  await expect(page.getByText("Change this bill")).toBeVisible();
  await page.getByRole("link", { name: "Cancel" }).click();
  await expect(page.getByText("Change this bill")).toHaveCount(0);
  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("link", { name: "Mark paid…" }).click();
  await page.getByLabel("Check # / reference").fill("5150");
  await page.getByRole("button", { name: "Mark paid", exact: true }).click();
  await expect(page.getByText("Check · 5150")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Un-approve…" }).click();
  await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete bill…" }).click();
  await expect(page).toHaveURL(/\/purchasing$/);
});

test("opens the Catalog and Settings homes, and a page in each", async () => {
  await page.goto("/catalog");
  await expect(page.getByRole("heading", { name: "Catalog", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Item List.*\d+ items?/ })).toBeVisible();
  await page.getByRole("link", { name: /Item List/ }).click();
  await expect(page.getByRole("heading", { name: "Item List", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "← Catalog" }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Lead sources/ }).click();
  await expect(page.getByRole("link", { name: "← Settings" })).toBeVisible();
});

test("makes an estimate template, sets its notes, duplicates it and deletes both", async () => {
  await page.goto("/catalog/estimate-templates");
  await page.getByRole("link", { name: "New template" }).click();
  await page.getByLabel("Template name").fill("Flow test estimate");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: "Flow test estimate" })).toBeVisible();
  await expect(page.getByRole("link", { name: "← Estimate templates" })).toBeVisible();
  await page.locator("section", { hasText: "Copied into each new estimate" }).getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Proposal notes").fill("Flow test note");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Flow test note")).toBeVisible();
  await page.getByRole("button", { name: "Duplicate" }).click();
  await expect(page.getByRole("heading", { name: "Flow test estimate (copy)" })).toBeVisible();
  for (const name of ["Flow test estimate (copy)", "Flow test estimate"]) {
    await page.goto("/catalog/estimate-templates");
    await page.getByRole("link", { name, exact: true }).click();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Delete template…" }).click();
    await expect(page).toHaveURL(/\/catalog\/estimate-templates$/);
  }
  await expect(page.getByText("Flow test estimate")).toHaveCount(0);
});

test("makes a schedule template with two tasks, renames it and deletes it", async () => {
  await page.goto("/catalog/schedule-templates");
  await page.getByRole("link", { name: "New template" }).click();
  await page.getByLabel("Template name").fill("Flow test schedule");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: "Flow test schedule" })).toBeVisible();
  await expect(page.getByRole("link", { name: "← Schedule templates" })).toBeVisible();
  await page.getByRole("button", { name: "Add a task" }).click();
  await page.getByLabel("Task name").last().fill("Flow permits");
  await page.getByRole("button", { name: "Add a task" }).click();
  await page.getByLabel("Task name").last().fill("Flow site prep");
  await expect(page.getByText("Not saved yet")).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Not saved yet")).toHaveCount(0);
  await expect(page.getByText("2 tasks")).toBeVisible();
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await page.getByLabel("Template name").fill("Flow test schedule 2");
  await page.locator("form", { has: page.getByLabel("Template name") }).getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Flow test schedule 2" })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete template…" }).click();
  await expect(page).toHaveURL(/\/catalog\/schedule-templates$/);
  await expect(page.getByText("Flow test schedule")).toHaveCount(0);
});

test("makes a takeoff template with a takeoff and an item, then deletes it", async () => {
  await page.goto("/catalog/takeoff-templates");
  await page.getByRole("link", { name: "New template" }).click();
  await page.getByLabel("Name").fill("Flow test template");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: "Flow test template" })).toBeVisible();
  await expect(page.getByRole("link", { name: "← Takeoff templates" })).toBeVisible();
  // Empty: the Add takeoff box is open to start.
  await expect(page.getByText("Add a takeoff")).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Flow slab");
  await page.getByRole("button", { name: "Add takeoff" }).first().click();
  await expect(page.getByText("Flow slab", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "+ Add an item" }).click();
  await expect(page.getByText("Add an item", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Cancel" }).click();
  await expect(page.getByText("Add an item", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await page.getByLabel("Description").fill("Made by the flow test");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Made by the flow test")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete template…" }).click();
  await expect(page).toHaveURL(/\/catalog\/takeoff-templates$/);
  await expect(page.getByText("Flow test template")).toHaveCount(0);
});

test("adds a span table, switches it to code spans, and deletes it", async () => {
  await page.goto("/catalog/span-tables");
  await page.getByRole("link", { name: "Add span table" }).click();
  await expect(page.getByText("Add a span table")).toBeVisible();
  await page.getByLabel("Name").fill("Flow test joists");
  await page.getByRole("button", { name: "Add table" }).click();
  await expect(page.getByText("Add a span table")).toHaveCount(0);
  await expect(page.getByRole("row", { name: /Flow test joists/ })).toContainText("2x8");
  await page.getByRole("link", { name: "Edit Flow test joists" }).click();
  await page.getByRole("button", { name: "Code spans" }).click();
  await expect(page.getByRole("columnheader", { name: "Longest span" })).toBeVisible();
  await page.getByRole("button", { name: "Save table" }).click();
  await expect(page.getByRole("row", { name: /Flow test joists/ })).toContainText("Code spans");
  await page.getByRole("link", { name: "Edit Flow test joists" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete table…" }).click();
  await expect(page.getByText("Flow test joists")).toHaveCount(0);
});

test("adds, finds, edits and deletes a member size", async () => {
  await page.goto("/catalog/member-sizes");
  await page.getByRole("link", { name: "Add size" }).click();
  await expect(page.getByText("Add a member size")).toBeVisible();
  await page.getByLabel("Name").fill("Flow test 2x14");
  await page.getByLabel("Kind").selectOption({ label: "Dimensional lumber" });
  await page.getByRole("button", { name: "Add size" }).click();
  await expect(page.getByText("Add a member size")).toHaveCount(0);
  const find = page.getByPlaceholder("Find a size…");
  await find.fill("flow test 2x14");
  await expect(page.getByText("1 match")).toBeVisible();
  await find.fill("nothing like this zzq");
  await expect(page.getByText("None match.")).toBeVisible();
  await find.fill("");
  await page.getByRole("link", { name: "Edit Flow test 2x14" }).click();
  await expect(page.getByRole("button", { name: "Save size" })).toBeVisible();
  await page.getByRole("link", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Save size" })).toHaveCount(0);
  await page.getByRole("link", { name: "Edit Flow test 2x14" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete size…" }).click();
  await expect(page.getByText("Flow test 2x14")).toHaveCount(0);
});

test("adds, finds, edits and removes an item on the Item List", async () => {
  await page.goto("/catalog/items");
  // Items the program adds: one line until Set up…
  await page.getByRole("link", { name: "Set up…" }).click();
  await expect(page.getByLabel("Category for Windows")).toBeVisible();
  await page.getByRole("link", { name: "Done" }).click();
  await expect(page.getByLabel("Category for Windows")).toHaveCount(0);

  await page.getByRole("link", { name: "Add item" }).click();
  await expect(page.getByText("Add an item")).toBeVisible();
  const box = page.locator("form", { hasText: "Add an item" });
  await box.getByLabel("Name").fill("Flow test board");
  await box.getByLabel("Category", { exact: true }).fill("Flow test stuff");
  await box.getByLabel("Unit cost").fill("12.5");
  await box.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByText("Add an item")).toHaveCount(0);

  const find = page.getByPlaceholder("Find an item, SKU or vendor…");
  await find.fill("flow test board");
  await expect(page.getByText("1 match")).toBeVisible();
  await find.fill("nothing like this zzq");
  await expect(page.getByText("None match.")).toBeVisible();
  await find.fill("");

  await page.getByRole("link", { name: "Edit Flow test board" }).click();
  await expect(page.getByRole("button", { name: "Save item" })).toBeVisible();
  await page.getByRole("link", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Save item" })).toHaveCount(0);

  await page.getByRole("link", { name: "Rename or merge…" }).last().click();
  await expect(page.getByLabel("Rename or merge into")).toBeVisible();
  await page.getByRole("link", { name: "Cancel" }).click();
  await expect(page.getByLabel("Rename or merge into")).toHaveCount(0);

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete Flow test board" }).click();
  await expect(page.getByText("Flow test board")).toHaveCount(0);
});

test("opens every report", async () => {
  for (const [path, tab] of [
    ["/reports", "Job profit"],
    ["/reports/wip", "WIP (over / under billing)"],
    ["/reports/cash-flow", "Cash flow"],
    ["/reports/aging", "What clients owe"],
    ["/reports/sales", "Sales and win rate"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
    await expect(page.getByRole("link", { name: tab })).toBeVisible();
    await expect(page.getByRole("button", { name: "Print / PDF" })).toBeVisible();
  }
  await page.goto("/reports");
  await page.getByLabel("Search").fill("zz nothing like this");
  await expect(page.getByText("None match.")).toBeVisible();
});

test("opens the Bills list", async () => {
  await page.goto("/bills");
  await expect(page.getByRole("heading", { name: "Bills" })).toBeVisible();
  await expect(page.getByRole("link", { name: /To pay/ })).toBeVisible();
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
  await page.getByRole("link", { name: "Add a request" }).click();
  await page.getByLabel("What needs fixing?").fill("Door sticks");
  await page.getByLabel("Where in the house?").fill("Back door");
  await page.getByRole("button", { name: "Add request" }).click();
  await expect(page).toHaveURL(/\/warranty\/c[a-z0-9]+$/);
  // Who's fixing it: Edit opens the rows as boxes, Save closes them again.
  await page.locator("section").filter({ hasText: "Who's fixing it" }).getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Someone on your team").selectOption({ label: "Flo Tester" });
  await page.getByLabel("Day", { exact: true }).fill("2026-11-02");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Scheduled", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Mon, Nov 2")).toBeVisible();
  await page.getByRole("link", { name: "Mark done…" }).click();
  await page.getByLabel("What was done").fill("Planed the door and adjusted the hinges.");
  await page.getByRole("button", { name: "Mark done", exact: true }).click();
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
  // A long list of choices shows its first few until "+N more".
  await expect(page.getByRole("button", { name: "Take Attic Access off Type" })).toHaveCount(0);
  await page.getByRole("button", { name: /^\+\d+ more$/ }).click();
  await expect(page.getByRole("button", { name: "Take Attic Access off Type" })).toBeVisible();
  await page.getByLabel("Ask for Core").uncheck();
  // A Material part: Wood as the usual, in the name only when it isn't.
  await page.getByRole("button", { name: "+ Add a part of your own…" }).click();
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

test("schedules a task, opens Delay this job and Templates from the toolbar, then deletes the schedule", async () => {
  await page.goto(`${job}/schedule`);
  // No schedule yet: starting from a template is right there.
  await expect(page.getByText("Start from a template", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Add task" }).click();
  await page.locator("[name=name]").fill("Flow pour footings");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.locator(":text(\"Flow pour footings\"):visible").first()).toBeVisible();
  await expect(page.getByText("Schedule ends", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Delay this job…" }).click();
  await expect(page.getByRole("button", { name: "Delay the job" })).toBeVisible();
  await page.getByRole("link", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Delay the job" })).toHaveCount(0);
  await page.locator("summary", { hasText: "Templates" }).click();
  await expect(page.getByRole("button", { name: "Save as template" })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete schedule…" }).click();
  await expect(page.getByText("No schedule yet.", { exact: false })).toBeVisible();
});

test("adds a sub from a schedule task without leaving, and drops their W-9 on their page", async () => {
  await page.goto(`${job}/schedule?add=1`);
  await page.locator("[name=name]").fill("Frame the house");
  await page.locator("select[name=vendorId]").selectOption("__new__");
  const dialog = page.getByRole("dialog", { name: "New sub or vendor" });
  await dialog.getByPlaceholder("Smith Framing").fill("Flow Framing");
  await dialog.getByRole("button", { name: "Save and pick" }).click();
  await expect(dialog).toBeHidden();
  // Picked, what was typed still there, and the paperwork they owe (your usual set) under it.
  await expect(page.locator("select[name=vendorId] option:checked")).toHaveText("Flow Framing");
  await expect(page.locator("[name=name]")).toHaveValue("Frame the house");
  await expect(page.getByText("W-9 missing · General liability missing · Workers' comp missing")).toBeVisible();
  // Their page: the W-9 goes on its line.
  await page.goto("/vendors");
  await page.getByRole("link", { name: "Flow Framing" }).first().click();
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");
  await page.getByLabel("Add a file to W-9").setInputFiles({ name: "w9.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(page.locator("li").filter({ hasText: /^W-9/ }).getByText("On file")).toBeVisible();
  // A policy typed in, on the same certificate: carrier, policy #, expiry.
  const gl = page.locator("li").filter({ hasText: /^General liability/ });
  await gl.getByRole("button", { name: "Add the policy" }).click();
  await gl.getByLabel("Carrier").fill("Texas Mutual");
  await gl.getByLabel("Policy number").fill("GL-1001");
  await gl.getByLabel("General liability expires").fill("2030-06-30");
  await gl.getByLabel("Or a file already on this vendor").selectOption({ label: "w9.pdf" });
  await gl.getByRole("button", { name: "Save" }).click();
  await expect(gl.getByText("Good till Jun 30, 2030")).toBeVisible();
  // A sub you don't need it from: one click.
  const wc = page.locator("li").filter({ hasText: /^Workers' comp/ });
  await wc.getByLabel("Need it").uncheck();
  await expect(wc.getByText("Not needed")).toBeVisible();
  // Their info, edited right here.
  await page.getByRole("button", { name: "Edit" }).click();
  await page.locator("input[name=address]").fill("12 Mill Road");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("12 Mill Road")).toBeVisible();
  await expect(page).toHaveURL(/\/vendors\/c[a-z0-9]+$/);
});

test("opens a teammate from Directory → Team and edits them right there", async () => {
  await page.goto("/directory");
  await page.getByRole("navigation", { name: "Directory" }).getByRole("link", { name: "Team" }).click();
  await page.locator("main").getByRole("link", { name: "Flo Tester" }).click();
  await expect(page).toHaveURL(/\/team\/c[a-z0-9]+$/);
  await page.getByRole("button", { name: "Edit" }).click();
  await page.locator("input[name=title]").fill("Owner");
  await page.locator("input[name=payRate]").fill("45");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("$45.00 / hr")).toBeVisible();
  await expect(page).toHaveURL(/\/team\/c[a-z0-9]+$/);
  await page.getByRole("link", { name: "← Team" }).click();
  await expect(page.getByText("Owner").first()).toBeVisible();
});

test("reports a problem", async () => {
  await page.getByRole("button", { name: /Report a problem/ }).click();
  await page.getByLabel("What happened").fill("Workflow test — please ignore.");
  await page.getByRole("dialog").getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Thanks — it's sent.")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).last().click();
});

test("starts a spec home and sets its listing right on the Spec sale tab", async () => {
  await page.goto("/projects/new?kind=spec");
  await page.locator("[name=name]").fill("Lot 7 Spec");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/c[a-z0-9]+/);
  const spec = new URL(page.url()).pathname.replace(/\/estimate$/, "");
  await page.goto(`${spec}/spec`);
  const listing = page.locator("#listing");
  await listing.getByRole("link", { name: "Edit" }).click();
  await listing.locator("[name=listPrice]").fill("389900");
  await listing.getByRole("button", { name: "Save" }).click();
  await expect(listing.getByText("$389,900")).toBeVisible();
  await expect(listing.locator("[name=listPrice]")).toHaveCount(0);
  await page.locator("#carrying").getByRole("link", { name: "+ Add a carrying cost" }).click();
  await page.locator("#new-carrying [name=name]").fill("Utilities");
  await page.locator("#new-carrying [name=amount]").fill("140");
  await page.locator("#new-carrying").getByRole("button", { name: "Add" }).click();
  await expect(page.locator("#carrying").getByText("Utilities", { exact: true })).toBeVisible();
});

test("removes the sample job", async () => {
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Explore the sample job" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Remove sample job" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("button", { name: "Add a sample job" })).toBeVisible();
});
