import { describe, expect, it } from 'vitest'
import {
  assertFilePath,
  assertNonEmptyString,
  assertSessionId,
  assertTerminalId,
} from '../packages/app/src/main/utils/validate-ipc'

describe('validate-ipc', () => {
  it('assertNonEmptyString accepts valid strings', () => {
    expect(assertNonEmptyString('hello', 'field')).toBe('hello')
  })

  it('assertNonEmptyString rejects empty and non-string values', () => {
    expect(() => assertNonEmptyString('', 'field')).toThrow('Invalid field')
    expect(() => assertNonEmptyString('   ', 'field')).toThrow('Invalid field')
    expect(() => assertNonEmptyString(null, 'field')).toThrow('Invalid field')
  })

  it('assertSessionId validates session id', () => {
    expect(assertSessionId('abc-123')).toBe('abc-123')
    expect(() => assertSessionId(undefined)).toThrow('Invalid sessionId')
  })

  it('assertFilePath validates path', () => {
    expect(assertFilePath('README.md')).toBe('README.md')
    expect(() => assertFilePath('')).toThrow('Invalid path')
  })

  it('assertTerminalId validates terminal id', () => {
    expect(assertTerminalId('term-1')).toBe('term-1')
    expect(() => assertTerminalId(42)).toThrow('Invalid terminalId')
  })
})
