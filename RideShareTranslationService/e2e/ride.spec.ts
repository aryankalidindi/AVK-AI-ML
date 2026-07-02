import { test, expect } from '@playwright/test'

test('full ride: driver online, rider books, accept, lifecycle, receipt', async ({ browser }) => {
  const driver = await browser.newPage()
  const rider = await browser.newPage()

  // Driver goes online.
  await driver.goto('/')
  await driver.getByRole('button', { name: "I'm a Driver" }).click()
  await expect(driver.getByText("You're online")).toBeVisible()

  // Rider books a ride.
  await rider.goto('/')
  await rider.getByRole('button', { name: "I'm a Rider" }).click()
  await rider.getByRole('button', { name: /Request/ }).click()

  // Driver receives the offer and accepts.
  await expect(driver.getByText('New request')).toBeVisible()
  await driver.getByRole('button', { name: 'Accept' }).click()

  // Both are on the ride; rider sees "on the way".
  await expect(rider.getByText('Your driver is on the way')).toBeVisible()
  await expect(driver.getByRole('button', { name: "I've arrived" })).toBeVisible()

  // Driver drives the lifecycle.
  await driver.getByRole('button', { name: "I've arrived" }).click()
  await driver.getByRole('button', { name: 'Start trip' }).click()

  // Rider can chat mid-trip; driver receives it.
  await rider.getByLabel('Message').fill('almost there?')
  await rider.getByRole('button', { name: 'Send' }).click()
  await expect(driver.locator('.bubble--theirs')).toContainText('almost there?')

  // Driver completes → rider sees the receipt.
  await driver.getByRole('button', { name: 'Complete trip' }).click()
  await expect(rider.getByRole('heading', { name: 'You have arrived' })).toBeVisible()
  await expect(rider.getByText(/Rp/)).toBeVisible()
})
