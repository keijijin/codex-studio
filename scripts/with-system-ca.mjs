/**
 * Electron 向けに `--use-system-ca` を NODE_OPTIONS へ入れると、
 * 統合ターミナル経由のホスト Node / tsx が起動時に失敗する
 * (`--use-system-ca is not allowed in NODE_OPTIONS`)。
 * TLS は packages/llm-adapters の system-ca-fetch で賄う。
 */
import { spawn } from 'node:child_process'

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage: node scripts/with-system-ca.mjs <command> [args...]')
  process.exit(1)
}

const [command, ...commandArgs] = args
const child = spawn(command, commandArgs, {
  stdio: 'inherit',
  shell: true,
  env: process.env,
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
