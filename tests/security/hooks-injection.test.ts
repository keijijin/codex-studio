import { describe, expect, it } from 'vitest'
import { expandHookCommand } from '@codex/agent-core'

describe('S-HOOK injection resistance', () => {
  it('S-HOOK-01 never embeds raw values; uses env refs', () => {
    expect(expandHookCommand('echo ${file}')).toBe('echo "$CODEX_FILE"')
    expect(expandHookCommand('echo "${file}"')).toBe('echo "$CODEX_FILE"')
    expect(expandHookCommand("echo '${file}'")).toBe('echo "$CODEX_FILE"')
    expect(expandHookCommand('printf "%s" "src/${relativePath}"')).toBe(
      'printf "%s" "src/$CODEX_RELATIVE_PATH"',
    )
    expect(expandHookCommand("echo 'src/${relativePath}'")).toBe(
      'echo "src/$CODEX_RELATIVE_PATH"',
    )
    expect(expandHookCommand('echo ${file}')).not.toContain('$(')
  })

  it('S-HOOK-02 uses PowerShell env syntax', () => {
    expect(expandHookCommand('echo ${file}', true)).toBe('echo $env:CODEX_FILE')
    expect(expandHookCommand('echo "${relativePath}"', true)).toBe(
      'echo "$env:CODEX_RELATIVE_PATH"',
    )
  })
})
