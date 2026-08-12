import { test, expect } from '@playwright/test'

const MARKETING_BASE_URL = 'http://localhost:3101'

test('marketing navbar, CTA, and footer links are interactive', async ({ page }) => {
  await page.goto(MARKETING_BASE_URL)

  await page.getByRole('navigation').getByRole('link', { name: 'About Us' }).click()
  await expect(page).toHaveURL(/\/about$/)

  await page.goto(MARKETING_BASE_URL)
  await page.getByRole('link', { name: /Check the classes we offer/i }).click()
  await expect(page).toHaveURL(/\/classes$/)

  await page.goto(MARKETING_BASE_URL)
  await page
    .getByRole('link', { name: /Book a Demo Session/i })
    .first()
    .click()
  await expect(page).toHaveURL(/\/contact$/)

  await page.goto(MARKETING_BASE_URL)
  await page.getByRole('link', { name: /Blogs/i }).first().click()
  await expect(page).toHaveURL(/\/blogs$/)

  await expect(page.locator('a[href="/blogs/cbse-board-exam-preparation-tips"]').first()).toHaveAttribute(
    'href',
    '/blogs/cbse-board-exam-preparation-tips',
  )
  await page.goto(`${MARKETING_BASE_URL}/blogs/cbse-board-exam-preparation-tips`)
  await expect(page).toHaveURL(/\/blogs\/cbse-board-exam-preparation-tips$/)

  await page.goto(MARKETING_BASE_URL)
  await page
    .getByRole('contentinfo')
    .getByRole('link', { name: /Classes/i })
    .click()
  await expect(page).toHaveURL(/\/classes$/)
})

test('marketing mobile navigation links are interactive', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(MARKETING_BASE_URL)

  await page.getByRole('button', { name: /Open navigation menu/i }).click()
  await page.locator('#marketing-mobile-menu').getByRole('link', { name: 'Contact Us' }).click()
  await expect(page).toHaveURL(/\/contact$/)
})
