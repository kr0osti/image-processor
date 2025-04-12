import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('should load the homepage', async ({ page }) => {
    // Navigate to the homepage
    await page.goto('/');
    
    // Verify that the page title is correct
    await expect(page).toHaveTitle(/Image Processor/);
    
    // Verify that the main heading is present
    const heading = page.getByRole('heading', { name: /Image Processor/i });
    await expect(heading).toBeVisible();
    
    // Verify that the tabs are present
    const webpageTab = page.getByRole('tab', { name: /From Webpage/i });
    const uploadTab = page.getByRole('tab', { name: /Upload Images/i });
    
    await expect(webpageTab).toBeVisible();
    await expect(uploadTab).toBeVisible();
  });
  
  test('should switch between tabs', async ({ page }) => {
    // Navigate to the homepage
    await page.goto('/');
    
    // Verify that the webpage tab is active by default
    const webpageTab = page.getByRole('tab', { name: /From Webpage/i });
    const uploadTab = page.getByRole('tab', { name: /Upload Images/i });
    
    await expect(webpageTab).toHaveAttribute('data-state', 'active');
    await expect(uploadTab).toHaveAttribute('data-state', 'inactive');
    
    // Click on the upload tab
    await uploadTab.click();
    
    // Verify that the upload tab is now active
    await expect(webpageTab).toHaveAttribute('data-state', 'inactive');
    await expect(uploadTab).toHaveAttribute('data-state', 'active');
    
    // Verify that the upload form is visible
    const uploadButton = page.getByRole('button', { name: /Upload Images/i });
    await expect(uploadButton).toBeVisible();
  });
  
  test('should show error when submitting empty URL', async ({ page }) => {
    // Navigate to the homepage
    await page.goto('/');
    
    // Try to submit the form without entering a URL
    const fetchButton = page.getByRole('button', { name: /Fetch Images/i });
    await fetchButton.click();
    
    // Verify that the form validation prevents submission
    // This is a client-side validation, so we just check that we're still on the same page
    await expect(page.getByRole('heading', { name: /Image Processor/i })).toBeVisible();
    
    // Verify that the URL input has the required attribute
    const urlInput = page.getByLabel('Webpage URL');
    await expect(urlInput).toHaveAttribute('required', '');
  });
});

test.describe('Image Processing', () => {
  // This test would require mocking the API responses
  // In a real implementation, you would use a test server or mock the fetch calls
  test.skip('should fetch and process images from a URL', async ({ page }) => {
    // Navigate to the homepage
    await page.goto('/');
    
    // Enter a URL
    const urlInput = page.getByLabel('Webpage URL');
    await urlInput.fill('https://example.com');
    
    // Click the fetch button
    const fetchButton = page.getByRole('button', { name: /Fetch Images/i });
    await fetchButton.click();
    
    // Wait for the images to load
    await page.waitForSelector('img[alt="Image 1"]');
    
    // Verify that the images are displayed
    const images = await page.$$('img');
    expect(images.length).toBeGreaterThan(0);
  });
});
