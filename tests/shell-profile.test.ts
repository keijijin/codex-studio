import { describe, expect, it } from 'vitest'
import {
  profileBootstrapCommand,
  wrapShellCommand,
} from '../packages/tools/src/utils/shell-profile'

describe('wrapShellCommand', () => {
  it('prepends bash_profile for bash on macOS', () => {
    const wrapped = wrapShellCommand('node -v', {
      platform: 'darwin',
      shell: '/bin/bash',
      home: '/Users/demo',
      exists: (p) => p === '/Users/demo/.bash_profile',
    })
    expect(wrapped.file).toBe('/bin/bash')
    expect(wrapped.args[0]).toBe('-c')
    expect(wrapped.args[1]).toContain('source "/Users/demo/.bash_profile"')
    expect(wrapped.args[1]).toContain('node -v')
    expect(wrapped.displayCommand).toBe('node -v')
  })

  it('sources zprofile and bash_profile for zsh', () => {
    const wrapped = wrapShellCommand('pnpm -v', {
      platform: 'darwin',
      shell: '/bin/zsh',
      home: '/Users/demo',
      exists: (p) =>
        p === '/Users/demo/.zprofile' || p === '/Users/demo/.bash_profile',
    })
    expect(wrapped.args[1]).toContain('source "/Users/demo/.zprofile"')
    expect(wrapped.args[1]).toContain('source "/Users/demo/.bash_profile"')
    expect(wrapped.args[1]).toContain('{ ')
    expect(wrapped.args[1]).toContain('} >/dev/null 2>&1; pnpm -v')
  })

  it('silences all profile sources with a brace group (not only the last)', () => {
    const wrapped = wrapShellCommand('printf ok', {
      platform: 'darwin',
      shell: '/bin/bash',
      home: '/Users/demo',
      exists: (p) =>
        p === '/Users/demo/.bash_profile' || p === '/Users/demo/.bashrc',
    })
    const body = String(wrapped.args[1])
    expect(body.startsWith('{ ')).toBe(true)
    expect(body).toContain('} >/dev/null 2>&1; printf ok')
    // Must not leave an ungrouped first source that can leak stdout (e.g. conda)
    expect(body.startsWith('source ')).toBe(false)
  })

  it('uses PowerShell -Command with profile on Windows', () => {
    const wrapped = wrapShellCommand('Get-Location', {
      platform: 'win32',
      shell: 'powershell.exe',
      home: 'C:\\Users\\demo',
      exists: () => false,
    })
    expect(wrapped.file).toBe('powershell.exe')
    expect(wrapped.args).toEqual([
      '-NoLogo',
      '-Command',
      expect.stringContaining('Get-Location'),
    ])
    expect(wrapped.args[2]).toContain('$PROFILE')
  })

  it('runs without bootstrap when no profile files exist (unix)', () => {
    const wrapped = wrapShellCommand('echo hi', {
      platform: 'linux',
      shell: '/bin/bash',
      home: '/home/demo',
      exists: () => false,
    })
    expect(wrapped.bootstrap).toBeNull()
    expect(wrapped.args).toEqual(['-c', 'echo hi'])
  })
})

describe('profileBootstrapCommand bash', () => {
  it('sources bash_profile and bashrc when both exist', () => {
    const cmd = profileBootstrapCommand('/bin/bash', {
      platform: 'darwin',
      home: '/Users/demo',
      exists: (p) =>
        p === '/Users/demo/.bash_profile' || p === '/Users/demo/.bashrc',
    })
    expect(cmd).toContain('source "/Users/demo/.bash_profile"')
    expect(cmd).toContain('source "/Users/demo/.bashrc"')
  })
})
