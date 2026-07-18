/**
 * Ensure Electron (Node 22) trusts the OS certificate store.
 * Must be set before the Electron process starts.
 */
import { spawn } from 'node:child_process'

const flag = '--use-system-ca'
const existing = process.env.NODE_OPTIONS ?? ''
if (!existing.split(/\s+/).includes(flag)) {
  process.env.NODE_OPTIONS = existing ? `${existing} ${flag}` : flag
}

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
