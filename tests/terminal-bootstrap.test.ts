import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  defaultShell,
  profileBootstrapCommand,
  quietBootstrapCommand,
  shellArgs,
} from '../packages/app/src/main/services/terminal-service'

describe('terminal shell bootstrap', () => {
  it('uses login shell args on unix shells', () => {
    expect(shellArgs('/bin/bash', 'darwin')).toEqual(['-l'])
    expect(shellArgs('/bin/zsh', 'darwin')).toEqual(['-l'])
    expect(shellArgs('/usr/local/bin/fish', 'darwin')).toEqual([])
    expect(shellArgs('powershell.exe', 'win32')).toEqual(['-NoLogo'])
    expect(shellArgs('cmd.exe', 'win32')).toEqual([])
  })

  it('prefers PowerShell as the default Windows shell', () => {
    expect(defaultShell('win32')).toMatch(/powershell/i)
  })

  it('builds a bash_profile source command on macOS/Linux', () => {
    const cmd = profileBootstrapCommand('/bin/bash', {
      platform: 'darwin',
      home: '/Users/demo',
      exists: (p) => p === '/Users/demo/.bash_profile',
    })
    expect(cmd).toBe('source "/Users/demo/.bash_profile"')
  })

  it('sources zsh and bash_profile on macOS zsh', () => {
    const cmd = profileBootstrapCommand('/bin/zsh', {
      platform: 'darwin',
      home: '/Users/demo',
      exists: (p) =>
        p === '/Users/demo/.zprofile' || p === '/Users/demo/.bash_profile',
    })
    expect(cmd).toContain('source "/Users/demo/.zprofile"')
    expect(cmd).toContain('source "/Users/demo/.bash_profile"')
  })

  it('dot-sources PowerShell profile on Windows', () => {
    const home = join('C:', 'Users', 'demo')
    const profile = join(
      home,
      'Documents',
      'WindowsPowerShell',
      'Microsoft.PowerShell_profile.ps1',
    )
    const cmd = profileBootstrapCommand('powershell.exe', {
      platform: 'win32',
      home,
      exists: (p) => p === profile,
    })
    expect(cmd).toBe(`. "${profile}"`)
  })

  it('falls back to $PROFILE when no PowerShell profile file is found', () => {
    const cmd = profileBootstrapCommand('pwsh.exe', {
      platform: 'win32',
      home: join('C:', 'Users', 'demo'),
      exists: () => false,
    })
    expect(cmd).toBe('if (Test-Path $PROFILE) { . $PROFILE }')
  })

  it('calls profile.cmd for cmd.exe when present', () => {
    const home = join('C:', 'Users', 'demo')
    const profileCmd = join(home, 'profile.cmd')
    const cmd = profileBootstrapCommand('cmd.exe', {
      platform: 'win32',
      home,
      exists: (p) => p === profileCmd,
    })
    expect(cmd).toBe(`call "${profileCmd}"`)
  })

  it('formats quiet bootstrap per shell', () => {
    expect(quietBootstrapCommand('/bin/bash', 'source ~/.bash_profile')).toContain(
      '>/dev/null',
    )
    expect(quietBootstrapCommand('powershell.exe', '. $PROFILE')).toContain('Out-Null')
    expect(quietBootstrapCommand('cmd.exe', 'call profile.cmd')).toContain('>nul')
  })
})
