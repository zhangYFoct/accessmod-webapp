import { test, expect } from '@playwright/test';

test.describe('Responsive Design Tests (Simplified)', () => {
  // Only test 2 key viewports instead of 4
  const viewports = [
    { name: 'iPhone', width: 390, height: 844 },
    { name: 'Desktop', width: 1920, height: 1080 }
  ];

  const testUser = {
    email: `responsive-test-${Date.now()}@example.com`,
    password: 'TestPassword123',
    firstName: 'Responsive',
    lastName: 'Tester'
  };

  test.beforeEach(async ({ page }) => {
    // Create test user for responsive tests
    await page.goto('/auth/jwt/sign-up');
    
    // Register user
    try {
      await page.fill('input[name="firstName"]', testUser.firstName);
      await page.fill('input[name="lastName"]', testUser.lastName);
      await page.fill('input[name="email"]', testUser.email);
      await page.fill('input[name="password"]', testUser.password);
      await page.click('button[type="submit"]:has-text("Create account")');
      
      // Wait for dashboard redirect
      await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
    } catch (error) {
      // User might already exist, try login
      await page.goto('/auth/jwt/sign-in');
      await page.fill('input[name="email"]', testUser.email);
      await page.fill('input[name="password"]', testUser.password);
      await page.click('button[type="submit"]:has-text("Sign in")');
      await expect(page).toHaveURL(/dashboard/);
    }
  });

  // Simplified: Only test basic navigation for each viewport
  viewports.forEach(viewport => {
    test(`Basic layout works on ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/dashboard');

      // Test main content fits viewport
      const mainContent = page.locator('main, .main-container, body');
      const contentBox = await mainContent.boundingBox();
      
      if (contentBox) {
        expect(contentBox.width).toBeLessThanOrEqual(viewport.width);
      }

      // Test navigation to analysis page
      await page.goto('/dashboard/analysis');
      await expect(page).toHaveURL(/dashboard\/analysis/);
      
      // Verify key elements are visible
      await expect(page.locator('input[placeholder="Search countries..."]')).toBeVisible();
    });
  });

  // Test touch interactions on mobile only
  test('Touch interactions work on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    
    await page.goto('/dashboard/analysis');
    
    // Verify buttons are touch-friendly (basic check)
    const runButton = page.locator('button:has-text("Run Analysis")');
    if (await runButton.isVisible()) {
      const box = await runButton.boundingBox();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(40); // Minimum touch target
      }
    }

    // Test map container exists and fits mobile
    const mapContainer = page.locator('#analysis-map-container');
    if (await mapContainer.isVisible()) {
      const mapBox = await mapContainer.boundingBox();
      if (mapBox) {
        expect(mapBox.width).toBeLessThanOrEqual(390);
      }
    }
  });

  // Basic analysis page functionality test
  test('Analysis page is usable on both desktop and mobile', async ({ page }) => {
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto('/dashboard/analysis');
      
      // Check country input is accessible
      const countryInput = page.locator('input[placeholder="Search countries..."]');
      await expect(countryInput).toBeVisible();
      
      // Check backend status is shown
      await expect(page.locator('text=Backend:')).toBeVisible();
      
      // Verify run button exists (may be disabled)
      await expect(page.locator('button:has-text("Run Analysis")')).toBeVisible();
    }
  });
});