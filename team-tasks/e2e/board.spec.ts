import { expect, test, type Browser, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

const local = existsSync('.secrets-local.json') ? JSON.parse(readFileSync('.secrets-local.json', 'utf8')) : {};
const ELIJAH = process.env.E2E_ELIJAH || local.Elijah;
const NEVAN = process.env.E2E_NEVAN || local.Nevan;
const SYNC = 8000; // "within about 5 seconds", with a little slack for the network

async function join(browser: Browser, link: string, opts: Parameters<Browser['newContext']>[0]): Promise<Page> {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto(link);
  // First visit: three welcome steps, each skippable.
  await expect(page.getByRole('heading', { name: 'Add to Home Screen' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByRole('heading', { name: 'Turn on Notifications' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByRole('heading', { name: 'Connect your Claude' })).toBeVisible();
  await page.getByRole('button', { name: /Skip/ }).click();
  await expect(page.getByRole('heading', { name: 'Team Tasks' })).toBeVisible();
  return page;
}
const row = (page: Page, title: string) => page.locator('.task', { hasText: title });

test('join by link, add for a teammate, change status, undo, check in, and sync to a second session', async ({ browser }, info) => {
  const opts = info.project.use;
  const title = `E2E lock the budget ${info.project.name} ${Date.now()}`;
  const elijah = await join(browser, ELIJAH, opts);
  const nevan = await join(browser, NEVAN, opts);

  // The link is not left in the address bar, and the signed-in person's card comes first.
  expect(new URL(elijah.url()).pathname).toBe('/');
  await expect(elijah.locator('.person-name').first()).toHaveText('Elijah');
  await expect(nevan.locator('.person-name').first()).toHaveText('Nevan');

  // The board opens as three names. Tap a name to drop its tasks down.
  await expect(elijah.locator('.person-toggle')).toHaveCount(3);
  await expect(elijah.locator('.person-toggle').first()).toHaveAttribute('aria-expanded', 'false');
  await expect(elijah.locator('.task')).toHaveCount(0);
  await nevan.getByRole('button', { name: /^Nevan/ }).click();
  await expect(nevan.getByRole('button', { name: /^Nevan/ })).toHaveAttribute('aria-expanded', 'true');

  // Add a task for another person.
  await elijah.getByRole('button', { name: 'Add a task', exact: true }).click();
  await expect(elijah.getByRole('heading', { name: 'What needs doing?' })).toBeVisible();
  await elijah.locator('#add-title').fill(title);
  await elijah.getByRole('group', { name: 'Who is it for' }).getByRole('button', { name: 'Nevan' }).click();
  await elijah.getByRole('group', { name: 'Due date' }).getByRole('button', { name: 'Tomorrow' }).click();
  await elijah.getByRole('button', { name: 'Add task', exact: true }).click();
  const nevanCard = (p: Page) => p.locator('.person', { has: p.getByRole('heading', { name: 'Nevan' }) });
  await expect(nevanCard(elijah).locator('.task', { hasText: title })).toContainText('Not started');
  await expect(row(elijah, title)).toContainText('Due tomorrow');

  // It appears in the second signed-in session.
  await expect(row(nevan, title)).toBeVisible({ timeout: SYNC });
  await expect(row(nevan, title)).toContainText('Not started');

  // Change a status with one tap on the tile. The other session sees it.
  const notStarted = Number(await elijah.locator('[data-count="not_started"] .num').textContent());
  await row(elijah, title).locator('button.tile').click();
  await expect(row(elijah, title)).toContainText('In progress');
  await expect(elijah.locator('[data-count="not_started"] .num')).toHaveText(String(notStarted - 1));
  await expect(row(nevan, title)).toContainText('In progress', { timeout: SYNC });

  // Undo.
  await elijah.getByRole('button', { name: 'Undo' }).click();
  await expect(row(elijah, title)).toContainText('Not started');
  await expect(row(nevan, title)).toContainText('Not started', { timeout: SYNC });

  // Check in. Nevan gets the question and answers in one tap. Elijah sees the board change.
  await row(elijah, title).getByRole('button', { name: /Check in/ }).click();
  await expect(row(elijah, title).getByRole('button', { name: /Checked in/ })).toBeDisabled();
  const ask = nevan.locator('.ask', { hasText: title });
  await expect(ask).toContainText('Elijah is checking in on', { timeout: SYNC });
  await ask.getByRole('button', { name: 'Working on it' }).click();
  await expect(ask).toHaveCount(0);
  await expect(row(elijah, title)).toContainText('In progress', { timeout: SYNC });

  // The sheet has all three statuses. Finish the task from the other session.
  await row(nevan, title).locator('.task-open').click();
  await expect(nevan.getByRole('group', { name: 'Status' }).getByRole('button')).toHaveCount(3);
  await nevan.getByRole('group', { name: 'Status' }).getByRole('button', { name: 'Done' }).click();
  await expect(row(elijah, title)).toContainText('Done', { timeout: SYNC });

  // The activity log knows who did what.
  await elijah.getByRole('button', { name: 'Activity' }).click();
  await expect(elijah.locator('.feed li', { hasText: title }).first()).toContainText('Nevan finished');
  await elijah.getByRole('button', { name: 'Board' }).click();

  // Remove with undo, then remove for good (keeps the board clean after the test).
  await row(elijah, title).locator('.task-open').click();
  await elijah.getByRole('button', { name: 'Remove task' }).click();
  await expect(row(elijah, title)).toHaveCount(0);
  await elijah.getByRole('button', { name: 'Undo' }).click();
  await expect(row(elijah, title)).toBeVisible();
  await expect(row(nevan, title)).toBeVisible({ timeout: SYNC });
  await row(elijah, title).locator('.task-open').click();
  await elijah.getByRole('button', { name: 'Remove task' }).click();
  await expect(row(nevan, title)).toHaveCount(0, { timeout: SYNC });

  // The wall display shows the board with no controls.
  await nevan.goto('/tv');
  await expect(nevan.getByRole('heading', { name: 'Team Tasks' })).toBeVisible();
  await expect(nevan.locator('.counts')).toBeVisible();
  await expect(nevan.getByRole('button')).toHaveCount(0);

  await elijah.context().close();
  await nevan.context().close();
});

test('a visitor without a link is asked for one', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Open your invite link to come in.')).toBeVisible();
  await page.goto('/join/not-a-real-link');
  await expect(page.getByText('That invite link is no longer valid.')).toBeVisible();
});
