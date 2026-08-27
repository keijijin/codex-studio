import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { McpServerConfig } from '@codex/shared'
import type { Tool, ToolResult } from '@codex/tools'

export interface McpServerRuntime {
  config: McpServerConfig
  client: Client
  transport: StdioClientTransport
  tools: Tool[]
}

function mcpToolName(serverId: string, toolName: string): string {
  const safeServer = serverId.replace(/[^a-zA-Z0-9_-]/g, '_')
  const safeTool = toolName.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `mcp__${safeServer}__${safeTool}`
}

function jsonSchemaToToolParams(inputSchema: unknown): Tool['parameters'] {
  const schema = (inputSchema ?? { type: 'object', properties: {} }) as {
    type?: string
    properties?: Record<string, { type?: string; description?: string }>
    required?: string[]
  }
  const properties: Record<string, { type: string; description?: string }> = {}
  for (const [key, val] of Object.entries(schema.properties ?? {})) {
    properties[key] = {
      type: typeof val?.type === 'string' ? val.type : 'string',
      description: val?.description,
    }
  }
  return {
    type: 'object',
    properties,
    required: schema.required,
  }
}

export class McpManager {
  private servers = new Map<string, McpServerRuntime>()

  listTools(): Tool[] {
    return [...this.servers.values()].flatMap((s) => s.tools)
  }

  listServerIds(): string[] {
    return [...this.servers.keys()]
  }

  getStatus(): Array<{ id: string; name: string; enabled: boolean; toolCount: number; error?: string }> {
    return [...this.servers.values()].map((s) => ({
      id: s.config.id,
      name: s.config.name,
      enabled: s.config.enabled,
      toolCount: s.tools.length,
    }))
  }

  async sync(
    configs: McpServerConfig[],
    opts?: { workspaceRoot?: string | null },
  ): Promise<{ connected: string[]; errors: Array<{ id: string; message: string }> }> {
    const enabled = configs.filter((c) => c.enabled && c.command.trim())
    const wanted = new Set(enabled.map((c) => c.id))
    const errors: Array<{ id: string; message: string }> = []

    for (const id of [...this.servers.keys()]) {
      if (!wanted.has(id)) {
        await this.disconnect(id)
      }
    }

    const connected: string[] = []
    for (const config of enabled) {
      const existing = this.servers.get(config.id)
      if (
        existing &&
        existing.config.command === config.command &&
        JSON.stringify(existing.config.args ?? []) === JSON.stringify(config.args ?? [])
      ) {
        connected.push(config.id)
        continue
      }
      if (existing) await this.disconnect(config.id)
      try {
        await this.connect(config, opts?.workspaceRoot ?? undefined)
        connected.push(config.id)
      } catch (err) {
        errors.push({
          id: config.id,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return { connected, errors }
  }

  async connect(config: McpServerConfig, workspaceRoot?: string): Promise<void> {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: { ...process.env, ...config.env } as Record<string, string>,
      cwd: config.cwd || workspaceRoot || process.cwd(),
    })
    const client = new Client({ name: 'codex-studio', version: '0.1.0' }, { capabilities: {} })
    await client.connect(transport)

    const listed = await client.listTools()
    const tools: Tool[] = (listed.tools ?? []).map((t) => {
      const name = mcpToolName(config.id, t.name)
      return {
        name,
        description: `[MCP:${config.name}] ${t.description ?? t.name}`,
        requiresApproval: true,
        parameters: jsonSchemaToToolParams(t.inputSchema),
        async execute(_ctx, args): Promise<ToolResult> {
          try {
            const result = await client.callTool({
              name: t.name,
              arguments: args,
            })
            const text = extractToolText(result)
            const isError = Boolean((result as { isError?: boolean }).isError)
            return {
              success: !isError,
              output: text || (isError ? 'MCP tool failed' : 'OK'),
              metadata: { mcpServerId: config.id, mcpTool: t.name },
            }
          } catch (err) {
            return {
              success: false,
              output: `MCP error: ${err instanceof Error ? err.message : String(err)}`,
            }
          }
        },
      }
    })

    this.servers.set(config.id, { config, client, transport, tools })
  }

  async disconnect(serverId: string): Promise<void> {
    const runtime = this.servers.get(serverId)
    if (!runtime) return
    this.servers.delete(serverId)
    try {
      await runtime.client.close()
    } catch {
      // ignore
    }
  }

  async disconnectAll(): Promise<void> {
    await Promise.all([...this.servers.keys()].map((id) => this.disconnect(id)))
  }
}

function extractToolText(result: unknown): string {
  const content = (result as { content?: Array<{ type?: string; text?: string }> })?.content
  if (!Array.isArray(content)) return JSON.stringify(result)
  return content
    .map((c) => (c.type === 'text' ? c.text ?? '' : JSON.stringify(c)))
    .filter(Boolean)
    .join('\n')
}

export const mcpManager = new McpManager()
