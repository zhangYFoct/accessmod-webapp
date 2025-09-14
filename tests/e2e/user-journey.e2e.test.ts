import { test, expect } from '@playwright/test';

test.describe('AccessMod User Journey', () => {
  const testUser = {
    email: `e2e-test-${Date.now()}@example.com`,
    password: 'TestPassword123',
    firstName: 'E2E',
    lastName: 'Tester'
  };

  test('Complete user journey: Register → Login → Analysis → Results', async ({ page }) => {
    // Step 1: Navigate to the application
    await page.goto('/');
    
    // Wait for the page to load
    await expect(page).toHaveTitle(/AccessMod/i);

    // Step 2: User Registration
    await test.step('User Registration', async () => {
      // Navigate to sign up page
      await page.goto('/auth/jwt/sign-up');
      
      // Verify we're on the sign up page
      await expect(page.locator('text=Get started absolutely free')).toBeVisible();
      
      // Fill registration form
      await page.fill('input[name="firstName"]', testUser.firstName);
      await page.fill('input[name="lastName"]', testUser.lastName);
      await page.fill('input[name="email"]', testUser.email);
      await page.fill('input[name="password"]', testUser.password);
      
      // Submit registration
      await page.click('button[type="submit"]:has-text("Create account")');
      
      // Verify successful registration (redirect to dashboard)
      await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
      
      // Check for dashboard navigation
      await expect(page.locator('nav')).toBeVisible();
    });

    // Step 3: Navigate to Analysis Page
    await test.step('Navigate to Analysis', async () => {
      // Navigate to analysis page
      await page.goto('/dashboard/analysis');
      
      // Wait for analysis page to load
      await expect(page).toHaveURL(/dashboard\/analysis/);
      
      // Verify analysis page elements are visible
      await expect(page.locator('input[placeholder="Search countries..."]')).toBeVisible({ timeout: 10000 });
      
      // Check for backend status indicator
      await expect(page.locator('text=Backend:')).toBeVisible();
    });

    // Step 4: Select Country and Start Analysis
    await test.step('Perform Analysis', async () => {
      // Wait for countries to load
      await page.waitForTimeout(2000);
      
      // Select a country using the Autocomplete component
      await page.click('input[placeholder="Search countries..."]');
      await page.fill('input[placeholder="Search countries..."]', 'Kenya');
      
      // Wait for dropdown options to appear and select Kenya
      await page.waitForSelector('text=Kenya', { timeout: 10000 });
      await page.click('li:has-text("Kenya")');
      
      // Wait for facilities to load
      await page.waitForTimeout(3000);
      
      // Start analysis - button should now be enabled
      await expect(page.locator('button:has-text("Run Analysis")')).toBeEnabled();
      await page.click('button:has-text("Run Analysis")');
      
      // Wait for analysis to complete (this might take a while)
      await expect(page.locator('text=Population Analysis Results')).toBeVisible({ 
        timeout: 120000 // 2 minutes for analysis
      });
    });

    // Step 5: Verify Analysis Results
    await test.step('Verify Analysis Results', async () => {
      // Check for key result elements
      await expect(page.locator('text=15 min Access')).toBeVisible();
      await expect(page.locator('text=30 min Access')).toBeVisible();
      await expect(page.locator('text=60 min Access')).toBeVisible();
      
      // Verify percentage results are displayed
      await expect(page.locator('text=%')).toBeVisible();
      
      // Check for map visualization
      const mapElement = page.locator('.leaflet-container');
      await expect(mapElement).toBeVisible();
      
      // Check for population analysis results section
      await expect(page.locator('text=Total Population')).toBeVisible();
      
      // Check for export button
      await expect(page.locator('button:has-text("Export")')).toBeVisible();
    });

    // Step 6: Access Project History
    await test.step('Check Project Navigation', async () => {
      // Navigate to projects page
      await page.goto('/dashboard/project');
      
      // Verify projects page loads
      await expect(page).toHaveURL(/dashboard\/project/);
      
      // Note: ProjectsView component would need to be implemented
      // This is testing the navigation works correctly
    });

    // Step 7: User Profile Management
    await test.step('User Profile Navigation', async () => {
      // Navigate to user page
      await page.goto('/dashboard/user');
      
      // Verify user page loads
      await expect(page).toHaveURL(/dashboard\/user/);
      
      // Note: User profile functionality would need to be implemented
      // This is testing the navigation works correctly
    });

    // Step 8: Logout Test
    await test.step('User Logout Flow', async () => {
      // For now, manually navigate to sign in to test the flow
      // In a real implementation, logout would be handled by dashboard layout
      await page.goto('/auth/jwt/sign-in');
      
      // Verify we're on the sign in page
      await expect(page).toHaveURL(/auth\/jwt\/sign-in/);
      
      // Verify login form is visible
      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('text=Sign in to your account')).toBeVisible();
    });
  });

  test('User login with existing credentials', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to login
    await page.goto('/auth/jwt/sign-in');
    
    // Verify sign in page elements
    await expect(page.locator('text=Sign in to your account')).toBeVisible();
    
    // Fill login form
    await page.fill('input[name="email"]', testUser.email);
    await page.fill('input[name="password"]', testUser.password);
    
    // Submit login
    await page.click('button[type="submit"]:has-text("Sign in")');
    
    // Verify successful login (redirect to dashboard)
    await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });
  });

  test('Error handling: Analysis without country selection', async ({ page }) => {
    // Login first
    await page.goto('/auth/jwt/sign-in');
    await page.fill('input[name="email"]', testUser.email);
    await page.fill('input[name="password"]', testUser.password);
    await page.click('button[type="submit"]');
    
    // Wait for dashboard redirect
    await expect(page).toHaveURL(/dashboard/);
    
    // Navigate to analysis
    await page.goto('/dashboard/analysis');
    
    // Verify analysis button is disabled when no country is selected
    await expect(page.locator('button:has-text("Run Analysis")')).toBeDisabled();
    
    // Verify the backend status is displayed
    await expect(page.locator('text=Backend:')).toBeVisible();
  });

  test('Mobile responsive: Key functionality works on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await page.goto('/');
    
    // Test mobile login
    await page.goto('/auth/jwt/sign-in');
    await page.fill('input[name="email"]', testUser.email);
    await page.fill('input[name="password"]', testUser.password);
    await page.click('button[type="submit"]');
    
    // Verify mobile dashboard
    await expect(page).toHaveURL(/dashboard/);
    
    // Test mobile analysis page
    await page.goto('/dashboard/analysis');
    
    // Verify analysis components work on mobile
    await expect(page.locator('input[placeholder="Search countries..."]')).toBeVisible();
    
    // Verify map container is responsive
    const mapContainer = page.locator('#analysis-map-container');
    await expect(mapContainer).toBeVisible();
    
    // Check that the map container fits mobile viewport
    const mapBox = await mapContainer.boundingBox();
    if (mapBox) {
      expect(mapBox.width).toBeLessThanOrEqual(375);
    }
  });
});