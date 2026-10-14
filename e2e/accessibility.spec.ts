import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// WCAG 2.2 A/AA rules; serious and critical violations fail the test
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BLOCKING_IMPACTS = ['serious', 'critical'];

async function expectNoBlockingViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const blocking = results.violations.filter((v) => BLOCKING_IMPACTS.includes(v.impact ?? ''));

  // Readable summary in the failure message instead of the raw axe dump
  const summary = blocking.map((v) => [
    `${v.impact}: ${v.id} – ${v.help}\n  ${v.helpUrl}`,
    ...v.nodes.map((n) => `  • ${n.target.join(' ')}\n    ${(n.failureSummary ?? '').replace(/\n/g, '\n    ')}`),
  ].join('\n'));
  expect(summary, summary.join('\n')).toEqual([]);
}

test.describe('Accessibility', () => {
  test('upload tab has no serious WCAG violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('tab', { name: /Upload Images/i })).toHaveAttribute('aria-selected', 'true');
    await expectNoBlockingViolations(page);
  });

  test('webpage tab has no serious WCAG violations', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: /From Webpage/i }).click();
    await expect(page.getByLabel('Webpage URL')).toBeVisible();
    await expectNoBlockingViolations(page);
  });

  test('settings page has no serious WCAG violations', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await expectNoBlockingViolations(page);
  });

  test('dark mode has no serious WCAG violations', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expectNoBlockingViolations(page);
  });
});
