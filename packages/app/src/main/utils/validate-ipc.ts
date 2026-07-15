export function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid ${field}`)
  }
  return value
}

export function assertSessionId(value: unknown): string {
  return assertNonEmptyString(value, 'sessionId')
}

export function assertFilePath(value: unknown): string {
  return assertNonEmptyString(value, 'path')
}

export function assertTerminalId(value: unknown): string {
  return assertNonEmptyString(value, 'terminalId')
}
