#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const entry = join(__dirname, '../src/cli.ts')
const require = createRequire(import.meta.url)

let tsxCli
try {
  tsxCli = require.resolve('tsx/cli')
} catch {
  tsxCli = createRequire(join(__dirname, '../../../package.json')).resolve('tsx/cli')
}

const child = spawn(process.execPath, [tsxCli, entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})
