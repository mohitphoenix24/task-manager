import { test, expect } from "@playwright/test";

async function registerAndSetUp(page: import("@playwright/test").Page) {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
  await page.goto("/register");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', "password123");
  await page.click('button[type="submit"]');
  await page.waitForSelector("text=My Projects");

  await page.fill('input[placeholder="New project name"]', "E2E Project");
  await page.click('button:has-text("Add Project")');
  await page.waitForSelector("text=E2E Project");

  for (const title of ["Design homepage", "Set up CI", "Write copy"]) {
    await page.fill('input[placeholder="New task title"]', title);
    await page.click('.kanban-column:has-text("To do") button:has-text("Add")');
    await page.waitForSelector(`text=${title}`);
  }
}

test("dragging a task from To do into In progress persists after reload", async ({ page }) => {
  await registerAndSetUp(page);

  const source = page.locator(".task-card", { hasText: "Set up CI" });
  const target = page.locator(".kanban-column", { hasText: "In progress" }).locator(".kanban-cards");
  await source.dragTo(target);

  const inProgress = page.locator(".kanban-column", { hasText: "In progress" });
  await expect(inProgress).toContainText("Set up CI");
  await expect(page.locator(".kanban-column", { hasText: "To do" })).not.toContainText("Set up CI");

  // Reload to prove the move was persisted server-side, not just optimistic client state.
  await page.reload();
  await page.waitForSelector("text=E2E Project");
  await expect(page.locator(".kanban-column", { hasText: "In progress" })).toContainText("Set up CI");
});

test("reordering within a column persists after reload", async ({ page }) => {
  await registerAndSetUp(page);

  const todoColumn = page.locator(".kanban-column", { hasText: "To do" });
  const writeCopy = todoColumn.locator(".task-card", { hasText: "Write copy" });
  const designHomepage = todoColumn.locator(".task-card", { hasText: "Design homepage" });
  await writeCopy.dragTo(designHomepage, { targetPosition: { x: 10, y: 2 } });

  // The reorder round-trips through the API before the UI re-renders, so
  // poll instead of reading innerText once.
  await expect
    .poll(async () => {
      const text = await todoColumn.innerText();
      return text.indexOf("Write copy") < text.indexOf("Design homepage");
    })
    .toBe(true);

  await page.reload();
  await page.waitForSelector("text=E2E Project");
  await expect
    .poll(async () => {
      const text = await todoColumn.innerText();
      return text.indexOf("Write copy") < text.indexOf("Design homepage");
    })
    .toBe(true);
});

test("task details (priority, due date, description) and comments persist after reload", async ({ page }) => {
  await registerAndSetUp(page);

  await page.click("text=Design homepage");
  await page.waitForSelector("text=Task details");
  await page.selectOption(".task-detail-form select", "HIGH");
  await page.fill(".task-detail-form textarea", "Needs a hero section.");
  await page.fill('.task-detail-row input[type="date"]', "2020-01-01");
  await page.click('button:has-text("Save changes")');
  await page.waitForSelector("text=Task details", { state: "detached" });

  const card = page.locator(".task-card", { hasText: "Design homepage" });
  await expect(card.locator(".priority-badge")).toHaveText("High");
  await expect(card.locator(".due-badge")).toHaveClass(/due-overdue/);

  await card.click();
  await page.waitForSelector("text=Task details");
  await page.fill('input[placeholder="Add a comment…"]', "Kicked off in Figma.");
  await page.click('.new-comment-form button:has-text("Add")');
  await expect(page.locator(".comment-list")).toContainText("Kicked off in Figma.");
  await page.click('button:has-text("Close")');

  await page.reload();
  await page.waitForSelector("text=E2E Project");
  await page.click("text=Design homepage");
  await page.waitForSelector("text=Task details");
  await expect(page.locator(".task-detail-form textarea")).toHaveValue("Needs a hero section.");
  await expect(page.locator(".comment-list")).toContainText("Kicked off in Figma.");
});
