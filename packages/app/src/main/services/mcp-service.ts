import { mcpManager } from '@codex/mcp-client'
import { defaultToolRegistry } from '@codex/tools'
import type { McpServerConfig } from '@codex/shared'
import { settingsService } from './settings'
import { workspaceService } from './workspace'

export class McpService {
  private lastError: string | null = null

  getLastError(): string | null {
    return this.lastError
  }

  getStatus() {
    return {
      servers: mcpManager.getStatus(),
      lastError: this.lastError,
    }
  }

  async syncFromSettings(configs?: McpServerConfig[]): Promise<{
    connected: string[]
    errors: Array<{ id: string; message: string }>
  }> {
    const list = configs ?? settingsService.get().mcpServers ?? []
    const root = workspaceService.getRoot()
    defaultToolRegistry.unregisterByPrefix('mcp__')
    const result = await mcpManager.sync(list, { workspaceRoot: root })
    for (const tool of mcpManager.listTools()) {
      defaultToolRegistry.register(tool, { dynamic: true })
    }
    this.lastError =
      result.errors.length > 0
        ? result.errors.map((e) => `${e.id}: ${e.message}`).join('; ')
        : null
    return result
  }
}

export const mcpService = new McpService()
