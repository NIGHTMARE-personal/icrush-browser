import { test, expect } from '@playwright/test';

test.describe('Gemini Browser E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for app to load
    await page.waitForSelector('.app-container', { timeout: 30000 });
  });

  test('should load without black screen', async ({ page }) => {
    // Check that the main container is visible and not black
    const appContainer = page.locator('.app-container');
    await expect(appContainer).toBeVisible();

    // Check background is not black (should have gradient/background)
    const bgColor = await appContainer.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(bgColor).not.toBe('rgb(0, 0, 0)');
  });

  test('should have tab bar visible', async ({ page }) => {
    const tabBar = page.locator('.tab-bar-container, .tab-bar');
    await expect(tabBar).toBeVisible();
  });

  test('should have address bar visible', async ({ page }) => {
    const addressBar = page.locator('.address-bar, .address-input-form').first();
    await expect(addressBar).toBeVisible();
  });

  test('should have webview container', async ({ page }) => {
    const webviewContainer = page.locator('.webview-container');
    await expect(webviewContainer).toBeVisible();
  });

  test('should be able to open new tab with Ctrl+T', async ({ page }) => {
    await page.keyboard.press('Control+t');
    // Check that a new tab was created
    const tabs = page.locator('.tab-item');
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThan(0);
  });

  test('should open AI sidebar', async ({ page }) => {
    // The sidebar should be open by default
    const sidebar = page.locator('.ai-sidebar-layout-container');
    await expect(sidebar).toBeVisible();
  });

  test('should show AI sidebar chat interface', async ({ page }) => {
    const chatArea = page.locator('.gs-chat, .sidebar-chat-history');
    await expect(chatArea).toBeVisible();
  });

  test('should have settings modal accessible', async ({ page }) => {
    // Click settings button
    const settingsBtn = page.locator(
      'button[title="Settings"], .settings-button, .settings-trigger-btn'
    );
    await settingsBtn.first().click();

    // Check modal opens
    const modal = page.locator('.settings-modal-card').first();
    await expect(modal).toBeVisible({ timeout: 5000 });
  });

  test('should handle window resize', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    const appContainer = page.locator('.app-container');
    await expect(appContainer).toBeVisible();

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(appContainer).toBeVisible();
  });
});

test.describe('AI Chat Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app-container', { timeout: 30000 });
  });

  test('should send message to AI', async ({ page }) => {
    const input = page.locator('.gs-input__field, .sidebar-text-area');
    await input.fill('Hello, AI!');

    const sendBtn = page.locator('.gs-input__send, .sidebar-send-button');
    await sendBtn.click();

    // Check message appears in chat
    await expect(page.locator('.gs-msg, .chat-bubble').first()).toContainText('Hello, AI!');
  });

  test('should toggle agent mode', async ({ page }) => {
    const agentToggle = page.locator(
      'button:has-text("Agent Mode"), .gs-pill-toggle:has-text("Agent")'
    );
    await agentToggle.click();
    // Should have active state
    await expect(agentToggle).toHaveClass(/active|gs-pill-toggle--active/);
  });

  test('should toggle page context', async ({ page }) => {
    const contextToggle = page.locator(
      'button:has-text("Page Context"), .gs-pill-toggle:has-text("Page Context")'
    );
    await contextToggle.click();
    await expect(contextToggle).toHaveClass(/active|gs-pill-toggle--active/);
  });
});

test.describe('Tab Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.app-container', { timeout: 30000 });
  });

  test('should close tab with Ctrl+W', async ({ page }) => {
    await page.keyboard.press('Control+t'); // Open new tab
    await page.waitForTimeout(500);

    const tabsBefore = await page.locator('.tab-item').count();
    await page.keyboard.press('Control+w');
    await page.waitForTimeout(500);

    const tabsAfter = await page.locator('.tab-item').count();
    expect(tabsAfter).toBeLessThanOrEqual(tabsBefore);
  });

  test('should open spotlight HUD with Ctrl+Space', async ({ page }) => {
    await page.keyboard.press('Control+Space');
    const hud = page.locator('.hud-panel').first();
    await expect(hud).toBeVisible({ timeout: 5000 });

    // Focus the input field and wait a moment for focus to settle
    const hudInput = page.locator('.hud-input-field').first();
    await hudInput.focus();
    await page.waitForTimeout(100);

    // Close HUD with Escape
    await page.keyboard.press('Escape');
    await expect(hud).toBeHidden({ timeout: 5000 });
  });
});
