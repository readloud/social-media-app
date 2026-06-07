import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('user can register new account', async ({ page }) => {
    await page.click('text=Sign Up');
    
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="username"]', 'testuser');
    await page.fill('input[name="fullName"]', 'Test User');
    await page.fill('input[name="password"]', 'Password123!');
    await page.fill('input[name="confirmPassword"]', 'Password123!');
    
    await page.click('button[type="submit"]');
    
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('text=Welcome, Test User')).toBeVisible();
  });

  test('user can login with valid credentials', async ({ page }) => {
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    
    await expect(page).toHaveURL('/dashboard');
  });

  test('show error for invalid credentials', async ({ page }) => {
    await page.fill('input[name="email"]', 'wrong@example.com');
    await page.fill('input[name="password"]', 'wrong');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('.toast-error')).toBeVisible();
    await expect(page).toHaveURL('/login');
  });
});

test.describe('Schedule Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'Password123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('user can create scheduled post', async ({ page }) => {
    await page.click('text=New Post');
    
    await page.fill('.ql-editor', 'This is a scheduled test post');
    await page.click('text=Schedule for later');
    
    await page.fill('input[placeholder="Select date and time"]', '2025-01-01 10:00');
    await page.click('button:has-text("Schedule Post")');
    
    await expect(page.locator('.toast-success')).toBeVisible();
    await expect(page.locator('text=Post scheduled successfully')).toBeVisible();
  });

  test('user can view scheduled posts in calendar', async ({ page }) => {
    await page.click('text=Scheduler');
    
    await expect(page.locator('.fc-day-grid')).toBeVisible();
    await expect(page.locator('.fc-event')).toBeVisible();
  });

  test('user can cancel scheduled post', async ({ page }) => {
    await page.click('text=Scheduler');
    
    await page.click('.fc-event:first-child');
    await page.click('button:has-text("Cancel Schedule")');
    await page.click('button:has-text("Confirm")');
    
    await expect(page.locator('.toast-success')).toBeVisible();
  });
});