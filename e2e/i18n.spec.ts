import { test, expect } from '@playwright/test';

test.describe('Languages', () => {
  test('uses the browser language on a first visit', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'de-DE' });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(page.getByRole('tab', { name: 'Bilder hochladen' })).toBeVisible();
    await context.close();
  });

  test('opening the language menu does not lock scrolling or shift the page', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 500 });
    await page.goto('/');
    const width = () => page.evaluate(() => document.documentElement.clientWidth);
    const before = await width();

    await page.getByRole('button', { name: /Language/ }).click();
    await expect(page.getByRole('menuitem', { name: 'Français' })).toBeVisible();
    // Radix marks the body when it locks scrolling (and hides the scrollbar)
    await expect(page.locator('body')).not.toHaveAttribute('data-scroll-locked', /.*/);
    expect(await width()).toBe(before);
  });

  test('switching language persists in a cookie', async ({ page, context }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Language/ }).click();
    await page.getByRole('menuitem', { name: 'Français' }).click();

    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('tab', { name: 'Importer des images' })).toBeVisible();
    expect((await context.cookies()).find((c) => c.name === 'NEXT_LOCALE')?.value).toBe('fr');

    await page.goto('/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Paramètres' })).toBeVisible();
  });
});
