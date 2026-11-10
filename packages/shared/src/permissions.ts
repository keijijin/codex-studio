export type PermissionAction = 'allow' | 'ask' | 'deny'

/** Coarse tool categories for permission policy. */
export type ToolPermissionCategory = 'read' | 'edit' | 'shell' | 'network' | 'media' | 'mcp'

export interface AgentPermissions {
  read: PermissionAction
  edit: PermissionAction
  shell: PermissionAction
  /** WebSearch and other outbound network tools */
  network: PermissionAction
  /** GenerateVideo / GeneratePresentation and other media synthesis tools */
  media: PermissionAction
  /** External MCP tools */
  mcp: PermissionAction
}

export const DEFAULT_AGENT_PERMISSIONS: AgentPermissions = {
  read: 'allow',
  edit: 'ask',
  shell: 'ask',
  network: 'allow',
  media: 'ask',
  mcp: 'ask',
}

export const TOOL_PERMISSION_CATEGORY: Record<string, ToolPermissionCategory> = {
  Read: 'read',
  Grep: 'read',
  Glob: 'read',
  GitStatus: 'read',
  Write: 'edit',
  StrReplace: 'edit',
  Delete: 'edit',
  Shell: 'shell',
  WebSearch: 'network',
  Task: 'read',
  /** Team writes BOARD.md and runs multi-agent work — not read-only. */
  Team: 'edit',
  MemoryAppend: 'edit',
  GenerateVideo: 'media',
  GeneratePresentation: 'media',
}

/** MCP tools are registered as `mcp__<serverId>__<toolName>`. */
export function isMcpToolName(toolName: string): boolean {
  return toolName.toLowerCase().startsWith('mcp__')
}

function categoryForToolName(toolName: string): ToolPermissionCategory {
  if (isMcpToolName(toolName)) return 'mcp'
  const direct = TOOL_PERMISSION_CATEGORY[toolName]
  if (direct) return direct
  const lower = toolName.toLowerCase()
  for (const [name, category] of Object.entries(TOOL_PERMISSION_CATEGORY)) {
    if (name.toLowerCase() === lower) return category
  }
  return 'edit'
}

export function permissionForTool(
  toolName: string,
  permissions: AgentPermissions,
): PermissionAction {
  const category = categoryForToolName(toolName)
  return permissions[category] ?? 'ask'
}

/** Case-insensitive allow-list check (supports `*mcp*` for MCP tools). */
export function isToolEnabled(toolName: string, enabledTools: string[] | undefined): boolean {
  if (!enabledTools || enabledTools.length === 0) return true
  if (enabledTools.includes(toolName)) return true
  const lower = toolName.toLowerCase()
  if (enabledTools.some((name) => name.toLowerCase() === lower)) return true
  if (isMcpToolName(toolName) && enabledTools.includes('*mcp*')) return true
  return false
}
