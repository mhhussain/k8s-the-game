import { test, expect, type Page } from '@playwright/test';

/* Full first-ticket playthrough against the production build:
   intro → run clock → first ticket beat → build image → deploy → resolve → save/load. */

async function startFresh(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

test('first ticket playthrough, save and reload', async ({ page }) => {
  await startFresh(page);

  // intro
  await expect(page.getByText('Welcome, Architect.')).toBeVisible();
  await page.getByRole('button', { name: /Start the shift/ }).click();
  await expect(page.getByText('Welcome, Architect.')).toBeHidden();

  // run the clock: first ticket lands at tick 3
  await page.keyboard.press('Space');
  await expect(page.getByText('Your first ticket just landed')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /Open the ticket/ }).click();
  await expect(page.getByText('Get web-storefront live')).toBeVisible();

  // build the image from the Repos/Registry pipeline (use the non-drag fallback button)
  await page.getByRole('button', { name: 'Cluster' }).click();
  await page.locator('.tab', { hasText: 'Repos' }).click();
  const repoCard = page.locator('.repo', { hasText: 'web-storefront' });
  await expect(repoCard).toBeVisible();
  await repoCard.getByRole('button', { name: /Build/ }).click();
  await page.keyboard.press('Space'); // resume so the build progresses
  await expect(page.locator('.image-card', { hasText: 'web-storefront:1.0.0' }).getByRole('button', { name: /Deploy/ })).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Space'); // pause again

  // deploy
  await page.locator('.image-card', { hasText: 'web-storefront:1.0.0' }).getByRole('button', { name: /Deploy/ }).click();
  await expect(page.locator('.slideover')).toBeVisible();
  await page.getByRole('button', { name: /Deploy service/ }).click();
  await expect(page.locator('.slideover')).toBeHidden();
  await expect(page.locator('.svccard', { hasText: 'web-storefront' })).toBeVisible();

  // let it settle, then resolve the ticket
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Tickets' }).click();
  const ticket = page.locator('.ticket', { hasText: 'TCK-101' });
  await expect(ticket.getByText('ready')).toBeVisible({ timeout: 30_000 });
  await ticket.click();
  await page.getByRole('button', { name: /Mark done/ }).click();
  await expect(page.locator('.kcol', { hasText: 'Resolved' }).locator('.ticket', { hasText: 'TCK-101' })).toBeVisible();

  // save to slot 1, reload, load it back
  await page.keyboard.press('Space'); // pause
  await page.locator('.icon-btn[title*="Save"], .icon-btn[aria-label*="Save"]').first().click();
  await expect(page.locator('.modal')).toBeVisible();
  const slot1 = page.locator('.save-slot').first();
  await slot1.getByRole('button', { name: /^Save/ }).click();
  await expect(slot1).not.toHaveClass(/empty/);
  await page.keyboard.press('Escape');

  await page.reload();
  // autosave resumed the game: the resolved ticket is still there
  await page.getByRole('button', { name: 'Tickets' }).click();
  await expect(page.locator('.kcol', { hasText: 'Resolved' }).locator('.ticket', { hasText: 'TCK-101' })).toBeVisible();
});

test('themes switch and the page has no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await startFresh(page);
  await page.getByRole('button', { name: /Start the shift/ }).click();
  await page.locator('.icon-btn[title*="Settings"], .icon-btn[aria-label*="Settings"]').first().click();
  await page.getByText('Bubblegum', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'bubblegum');
  await page.getByText('Voltage', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'voltage');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Upgrades' }).click();
  await expect(page.locator('.u-name', { hasText: 'Continuous Integration' })).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});
