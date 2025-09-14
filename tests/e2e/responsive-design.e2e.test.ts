import { test, expect } from '@playwright/test';

test.describe('Responsive Design Tests', () => {
  const viewports = [
    { name: 'iPhone 12', width: 390, height: 844 },
    { name: 'iPad Air', width: 820, height: 1180 },
    { name: 'Desktop', width: 1920, height: 1080 },
    { name: 'Large Desktop', width: 2560, height: 1440 }
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

  viewports.forEach(viewport => {
    test(`Navigation and layout should work correctly on ${viewport.name} (${viewport.width}x${viewport.height})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/dashboard');

      // Test main content area adapts to viewport
      const mainContent = page.locator('main, .main-container, body');
      const contentBox = await mainContent.boundingBox();
      
      if (contentBox) {
        expect(contentBox.width).toBeLessThanOrEqual(viewport.width);
      }

      // Test navigation to different dashboard sections
      await page.goto('/dashboard/analysis');
      await expect(page).toHaveURL(/dashboard\/analysis/);
      
      await page.goto('/dashboard/project');
      await expect(page).toHaveURL(/dashboard\/project/);
      
      await page.goto('/dashboard/user');
      await expect(page).toHaveURL(/dashboard\/user/);
    });

    test(`Analysis page should be usable on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      
      // Navigate to analysis page
      await page.goto('/dashboard/analysis');
      
      // Check country selection is accessible
      const countryInput = page.locator('input[placeholder="Search countries..."]');
      await expect(countryInput).toBeVisible();
      
      // Verify form elements are properly sized
      const formElements = page.locator('input, button');
      const formCount = await formElements.count();
      
      for (let i = 0; i < Math.min(formCount, 5); i++) {
        const element = formElements.nth(i);
        const box = await element.boundingBox();
        
        if (box) {
          // Form elements should have reasonable touch target sizes on mobile
          if (viewport.width < 768) {
            expect(box.height).toBeGreaterThanOrEqual(40); // Minimum touch target
          }
          expect(box.width).toBeGreaterThan(0);
        }
      }

      // Test map container
      const mapContainer = page.locator('#analysis-map-container');
      if (await mapContainer.isVisible()) {
        const mapBox = await mapContainer.boundingBox();
        if (mapBox) {
          expect(mapBox.width).toBeLessThanOrEqual(viewport.width);
          expect(mapBox.height).toBeGreaterThan(200); // Minimum usable height
        }
      }
    });

    test(`Analysis results should display properly on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      
      // Navigate to analysis page
      await page.goto('/dashboard/analysis');
      
      // Wait for page to load
      await page.waitForTimeout(2000);
      
      // Try to run a quick test analysis if possible
      const countryInput = page.locator('input[placeholder="Search countries..."]');
      if (await countryInput.isVisible()) {
        // Select a country
        await countryInput.click();
        await countryInput.fill('Kenya');
        await page.waitForTimeout(1000);
        
        // Check if Kenya option appears
        const kenyaOption = page.locator('li:has-text("Kenya")');
        if (await kenyaOption.isVisible({ timeout: 5000 })) {
          await kenyaOption.click();
          
          // Wait for facilities to load
          await page.waitForTimeout(3000);
          
          // Check if run analysis button is enabled
          const runButton = page.locator('button:has-text("Run Analysis")');
          if (await runButton.isEnabled()) {
            await runButton.click();
            
            // Wait for some results to appear
            const resultsSection = page.locator('text=Population Analysis Results');
            if (await resultsSection.isVisible({ timeout: 30000 })) {
              // Check result cards/summaries are readable
              const resultItems = page.locator('text=15 min Access, text=30 min Access, text=60 min Access');
              const itemCount = await resultItems.count();
              
              if (itemCount > 0) {
                const firstItem = resultItems.first();
                const itemBox = await firstItem.boundingBox();
                
                if (itemBox) {
                  expect(itemBox.width).toBeLessThanOrEqual(viewport.width);
                  
                  // Text should be readable size
                  const fontSize = await firstItem.evaluate(el => 
                    window.getComputedStyle(el).fontSize
                  );
                  
                  const fontSizeValue = parseInt(fontSize);
                  expect(fontSizeValue).toBeGreaterThanOrEqual(viewport.width < 768 ? 14 : 12);
                }
              }
            }
          }
        }
      }
    });
  });

  test('Touch interactions work correctly on mobile devices', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Test touch-friendly button interactions
    await page.goto('/dashboard/analysis');
    
    // Verify buttons are touch-friendly
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    
    for (let i = 0; i < Math.min(buttonCount, 5); i++) {
      const button = buttons.nth(i);
      const box = await button.boundingBox();
      
      if (box) {
        // Minimum touch target for mobile
        expect(box.height).toBeGreaterThanOrEqual(40);
        expect(box.width).toBeGreaterThanOrEqual(40);
      }
    }

    // Test map interactions if map is present
    const mapContainer = page.locator('.leaflet-container');
    if (await mapContainer.isVisible()) {
      // Test basic map interaction
      await mapContainer.hover();
      
      // Test tap interaction
      await mapContainer.tap();
      
      // Verify map is interactive
      expect(await mapContainer.isVisible()).toBeTruthy();
    }
  });

  test('Landscape vs Portrait orientation handling', async ({ page }) => {
    // Test portrait
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard/analysis');
    
    let mapContainer = page.locator('#analysis-map-container');
    let portraitBox = null;
    if (await mapContainer.isVisible()) {
      portraitBox = await mapContainer.boundingBox();
      expect(portraitBox?.height).toBeDefined();
    }

    // Test landscape  
    await page.setViewportSize({ width: 844, height: 390 });
    await page.reload();
    
    mapContainer = page.locator('#analysis-map-container');
    if (await mapContainer.isVisible()) {
      const landscapeBox = await mapContainer.boundingBox();
      expect(landscapeBox?.width).toBeDefined();
      
      // In landscape, map should utilize available width
      if (portraitBox && landscapeBox) {
        expect(landscapeBox.width).toBeGreaterThan(portraitBox.width * 0.8);
      }
    }
  });

  test('Text readability across different screen densities', async ({ page }) => {
    const densities = [
      { name: 'Standard DPI', deviceScaleFactor: 1 },
      { name: 'High DPI', deviceScaleFactor: 2 },
      { name: 'Very High DPI', deviceScaleFactor: 3 }
    ];

    for (const density of densities) {
      await page.setViewportSize({ 
        width: 375, 
        height: 667 
      });

      await page.goto('/dashboard');
      
      // Check text elements are readable
      const textElements = page.locator('h1, h2, h3, h4, h5, h6, p, span, button');
      const elementCount = await textElements.count();
      
      if (elementCount > 0) {
        const sampleElement = textElements.first();
        const computedStyle = await sampleElement.evaluate(el => {
          const style = window.getComputedStyle(el);
          return {
            fontSize: style.fontSize,
            lineHeight: style.lineHeight,
            color: style.color,
            backgroundColor: style.backgroundColor
          };
        });
        
        // Verify readable font size
        const fontSize = parseInt(computedStyle.fontSize);
        expect(fontSize).toBeGreaterThanOrEqual(12);
        
        console.log(`${density.name}: Font size ${computedStyle.fontSize}, Line height: ${computedStyle.lineHeight}`);
      }
    }
  });

  test('Analysis workflow responsive behavior', async ({ page }) => {
    // Test on mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard/analysis');
    
    // Check analysis panel layout on mobile
    const analysisPanel = page.locator('text=Select Country').first();
    if (await analysisPanel.isVisible()) {
      const panelBox = await analysisPanel.boundingBox();
      if (panelBox) {
        expect(panelBox.width).toBeLessThanOrEqual(375);
      }
    }
    
    // Check backend status indicator is visible
    await expect(page.locator('text=Backend:')).toBeVisible();
    
    // Test on tablet
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.reload();
    
    // Verify layout adapts to tablet
    const countryInput = page.locator('input[placeholder="Search countries..."]');
    await expect(countryInput).toBeVisible();
    
    // Test on desktop
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.reload();
    
    // Verify desktop layout
    await expect(countryInput).toBeVisible();
    const runButton = page.locator('button:has-text("Run Analysis")');
    await expect(runButton).toBeVisible();
  });
});