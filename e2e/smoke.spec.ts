import { _electron as electron } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { join } from 'path'
import { mkdtemp, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'

const baseEnv = {
  ...process.env,
  ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
}

async function launchApp(extraEnv: Record<string, string> = {}) {
  const userDataDir = await mkdtemp(join(tmpdir(), 'codex-e2e-user-'))
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...baseEnv,
      ELECTRON_USER_DATA: userDataDir,
      ...extraEnv,
    },
  })
  return { app, userDataDir }
}

async function closeApp(
  app: Awaited<ReturnType<typeof electron.launch>>,
  userDataDir?: string,
): Promise<void> {
  await app.close()
  if (userDataDir) {
    await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

test('welcome screen is shown on launch', async () => {
  const { app, userDataDir } = await launchApp()

  const page = await app.firstWindow()
  await expect(page.getByText('Codex Studio')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open Folder' })).toBeVisible()
  await closeApp(app, userDataDir)
})

test('opens fixture workspace and shows layout', async () => {
  const fixturePath = join(process.cwd(), 'e2e/fixtures/sample-workspace')
  const { app, userDataDir } = await launchApp({
    CODEX_E2E_WORKSPACE: fixturePath,
  })

  const page = await app.firstWindow()
  await expect(page.getByRole('contentinfo').getByText('sample-workspace')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('AI Chat')).toBeVisible()
  await closeApp(app, userDataDir)
})

test('sends chat message with E2E mock provider', async () => {
  const fixturePath = join(process.cwd(), 'e2e/fixtures/sample-workspace')
  const { app, userDataDir } = await launchApp({
    CODEX_E2E_WORKSPACE: fixturePath,
    CODEX_E2E_MOCK_CHAT: '1',
  })

  try {
    const page = await app.firstWindow()
    await expect(page.getByText('AI Chat')).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: 'Ask', exact: true }).click()
    await expect(page.getByText(/^Ask · /)).toBeVisible()

    const textarea = page.getByPlaceholder(/メッセージを入力/)
    await textarea.fill('hello from e2e')
    await page.getByRole('button', { name: '送信' }).click()

    await expect(page.getByText('E2E mock response').first()).toBeVisible({ timeout: 10_000 })
  } finally {
    await closeApp(app, userDataDir)
  }
})

test('toggles terminal panel', async () => {
  const fixturePath = join(process.cwd(), 'e2e/fixtures/sample-workspace')
  const { app, userDataDir } = await launchApp({
    CODEX_E2E_WORKSPACE: fixturePath,
  })

  try {
    const page = await app.firstWindow()
    await expect(page.getByText('AI Chat')).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: 'Terminal' }).click()
    await expect(page.getByText('Terminal', { exact: true })).toBeVisible()
  } finally {
    await closeApp(app, userDataDir)
  }
})

test('completes agent write task with approval', async () => {
  const fixturePath = join(process.cwd(), 'e2e/fixtures/sample-workspace')
  const outputFile = join(fixturePath, 'e2e-agent-output.txt')

  await rm(outputFile, { force: true })

  const { app, userDataDir } = await launchApp({
    CODEX_E2E_WORKSPACE: fixturePath,
    CODEX_E2E_MOCK_AGENT: '1',
  })

  try {
    const page = await app.firstWindow()
    await expect(page.getByText('AI Chat')).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: 'Agent', exact: true }).click()
    await expect(page.getByText(/^Agent · /)).toBeVisible()

    const textarea = page.getByPlaceholder(/メッセージを入力/)
    await textarea.fill('write e2e test file')
    await page.getByRole('button', { name: '送信' }).click()

    await expect(page.getByRole('heading', { name: '変更の承認' })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: '適用' }).click()

    await expect(page.getByText('E2E agent task complete.').last()).toBeVisible({ timeout: 15_000 })

    const { readFile } = await import('fs/promises')
    expect(await readFile(outputFile, 'utf-8')).toBe('hello from agent e2e')
  } finally {
    await closeApp(app, userDataDir)
    await rm(outputFile, { force: true })
  }
})

test('reflects external file changes via watcher', async () => {
  const fixturePath = join(process.cwd(), 'e2e/fixtures/sample-workspace')
  const watchedFile = join(fixturePath, 'watcher-e2e.txt')

  await writeFile(watchedFile, 'initial', 'utf-8')

  const { app, userDataDir } = await launchApp({
    CODEX_E2E_WORKSPACE: fixturePath,
  })

  try {
    const page = await app.firstWindow()
    await expect(page.getByText('AI Chat')).toBeVisible({ timeout: 15_000 })

    await writeFile(watchedFile, 'updated by watcher', 'utf-8')
    await expect(page.getByText('watcher-e2e.txt')).toBeVisible({ timeout: 10_000 })
  } finally {
    await closeApp(app, userDataDir)
    await rm(watchedFile, { force: true })
  }
})
