import { _electron as electron } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { join } from 'path'

test('welcome screen is shown on launch', async () => {
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
  })

  const page = await app.firstWindow()
  await expect(page.getByText('Codex Studio')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open Folder' })).toBeVisible()
  await app.close()
})

test('opens fixture workspace and shows layout', async () => {
  const fixturePath = join(process.cwd(), 'e2e/fixtures/sample-workspace')

  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      CODEX_E2E_WORKSPACE: fixturePath,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
  })

  const page = await app.firstWindow()
  await expect(page.getByRole('contentinfo').getByText('sample-workspace')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('AI Chat')).toBeVisible()
  await app.close()
})
