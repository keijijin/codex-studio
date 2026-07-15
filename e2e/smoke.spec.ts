import { _electron as electron } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { join } from 'path'
import { writeFile, rm } from 'fs/promises'

const baseEnv = {
  ...process.env,
  ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
}

test('welcome screen is shown on launch', async () => {
  const app = await electron.launch({
    args: ['.'],
    env: baseEnv,
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
      ...baseEnv,
      CODEX_E2E_WORKSPACE: fixturePath,
    },
  })

  const page = await app.firstWindow()
  await expect(page.getByRole('contentinfo').getByText('sample-workspace')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('AI Chat')).toBeVisible()
  await app.close()
})

test('sends chat message with E2E mock provider', async () => {
  const fixturePath = join(process.cwd(), 'e2e/fixtures/sample-workspace')

  const app = await electron.launch({
    args: ['.'],
    env: {
      ...baseEnv,
      CODEX_E2E_WORKSPACE: fixturePath,
      CODEX_E2E_MOCK_CHAT: '1',
    },
  })

  const page = await app.firstWindow()
  await expect(page.getByText('AI Chat')).toBeVisible({ timeout: 15_000 })

  const textarea = page.getByPlaceholder('メッセージを入力... (@file で添付、Enter で送信)')
  await textarea.fill('hello from e2e')
  await page.getByRole('button', { name: '送信' }).click()

  await expect(page.getByText('E2E mock response').first()).toBeVisible({ timeout: 10_000 })
  await app.close()
})

test('toggles terminal panel', async () => {
  const fixturePath = join(process.cwd(), 'e2e/fixtures/sample-workspace')

  const app = await electron.launch({
    args: ['.'],
    env: {
      ...baseEnv,
      CODEX_E2E_WORKSPACE: fixturePath,
    },
  })

  const page = await app.firstWindow()
  await expect(page.getByText('AI Chat')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Terminal' }).click()
  await expect(page.getByText('Terminal', { exact: true })).toBeVisible()
  await app.close()
})

test('reflects external file changes via watcher', async () => {
  const fixturePath = join(process.cwd(), 'e2e/fixtures/sample-workspace')
  const watchedFile = join(fixturePath, 'watcher-e2e.txt')

  await writeFile(watchedFile, 'initial', 'utf-8')

  const app = await electron.launch({
    args: ['.'],
    env: {
      ...baseEnv,
      CODEX_E2E_WORKSPACE: fixturePath,
    },
  })

  try {
    const page = await app.firstWindow()
    await expect(page.getByText('AI Chat')).toBeVisible({ timeout: 15_000 })

    await writeFile(watchedFile, 'updated by watcher', 'utf-8')
    await expect(page.getByText('watcher-e2e.txt')).toBeVisible({ timeout: 10_000 })
  } finally {
    await app.close()
    await rm(watchedFile, { force: true })
  }
})
