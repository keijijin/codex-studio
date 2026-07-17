export type PermissionAction = 'allow' | 'ask' | 'deny'

/** Coarse tool categories for permission policy. */
export type ToolPermissionCategory = 'read' | 'edit' | 'shell' | 'network'

export interface AgentPermissions {
  read: PermissionAction
  edit: PermissionAction
  shell: PermissionAction
  /** WebSearch and other outbound network tools */
  network: PermissionAction
}

export const DEFAULT_AGENT_PERMISSIONS: AgentPermissions = {
  read: 'allow',
  edit: 'ask',
  shell: 'ask',
  network: 'allow',
}

export const TOOL_PERMISSION_CATEGORY: Record<string, ToolPermissionCategory> = {
  Read: 'read',
  Grep: 'read',
  Glob: 'read',
  Write: 'edit',
  StrReplace: 'edit',
  Delete: 'edit',
  Shell: 'shell',
  WebSearch: 'network',
  Task: 'read',
  Team: 'read',
  MemoryAppend: 'edit',
}

export function permissionForTool(
  toolName: string,
  permissions: AgentPermissions,
): PermissionAction {
  const category = TOOL_PERMISSION_CATEGORY[toolName] ?? 'edit'
  return permissions[category] ?? 'ask'
}
