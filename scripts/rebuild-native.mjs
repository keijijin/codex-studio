/**
 * Rebuild node-pty for Electron when a compiler toolchain is available.
 * Otherwise keep node-pty's shipped N-API prebuilds (win32/darwin/linux).
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const prebuild = join(
  root,
  'node_modules',
  'node-pty',
  'prebuilds',
  `${process.platform}-${process.arch}`,
  'pty.node',
)

const result = spawnSync(
  'pnpm',
  ['exec', 'electron-rebuild', '-w', 'node-pty'],
  { stdio: 'inherit', shell: true, cwd: root },
)

if (result.status === 0) {
  process.exit(0)
}

if (existsSync(prebuild)) {
  console.warn(
    `[rebuild-native] electron-rebuild failed (often missing Visual Studio on Windows).`,
  )
  console.warn(`[rebuild-native] Using node-pty prebuild: ${prebuild}`)
  process.exit(0)
}

console.error(
  '[rebuild-native] electron-rebuild failed and no node-pty prebuild was found.',
)
process.exit(result.status ?? 1)
