const WORKSPACE_API = 'https://extensions.kbizsoft.com/magicaa-extension/workspace-name.php'
const WORKSPACE_ID = '2e31eab2-4c50-482d-a9db-46cec0cfa0fe'
const USER_EMAIL = 'abhishekkumarphp.kbizsoft@gmail.com'

export interface WorkspaceMember {
  id?: string
  user_id?: string
  email?: string
  name?: string
  role?: string
  status?: string
  joined_at?: string
  joined?: string
  created_at?: string
  user?: { id?: string; email?: string; first_name?: string | null; last_name?: string | null }
}

export interface WorkspaceInvitation {
  id?: string
  email: string
  role?: string
  status?: string
  created_at?: string
  sent_at?: string
}

type WorkspaceListResponse<T> = { success?: boolean; items?: T[]; members?: T[]; invitations?: T[]; data?: T[]; total?: number; pagination?: { total?: number }; message?: string }

async function getWorkspaceList<T>(tab: 'members' | 'invitations'): Promise<{ items: T[]; total: number }> {
  const url = new URL('https://extensions.kbizsoft.com/magicaa-extension/workspace.php')
  url.searchParams.set('tab', tab)
  url.searchParams.set('search', '')
  url.searchParams.set('role', '')
  url.searchParams.set('status', '')
  url.searchParams.set('resource_type', '')
  url.searchParams.set('page', '1')
  url.searchParams.set('per_page', '10')
  const response = await fetch(url.toString(), { headers: { 'X-User-Email': USER_EMAIL } })
  if (!response.ok) throw new Error(`Unable to load ${tab} (${response.status})`)
  const result = await response.json() as WorkspaceListResponse<T>
  const items = result.items || result[tab] || result.data || []
  return { items, total: result.pagination?.total ?? result.total ?? items.length }
}

export const workspaceService = {
  async updateName(name: string): Promise<string> {
    const response = await fetch(WORKSPACE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Email': USER_EMAIL },
      body: JSON.stringify({ workspace_id: WORKSPACE_ID, name }),
    })
    if (!response.ok) throw new Error(`Unable to update workspace name (${response.status})`)
    const result = await response.json() as { success?: boolean; workspace?: { name?: string }; message?: string }
    if (!result.success || !result.workspace?.name) throw new Error(result.message || 'Invalid workspace response')
    return result.workspace.name
  },

  async getMembers() { return getWorkspaceList<WorkspaceMember>('members') },

  async getInvitations() { return getWorkspaceList<WorkspaceInvitation>('invitations') },

  async sendInvitation(email: string, role: 'viewer' | 'editor' | 'admin'): Promise<void> {
    const response = await fetch('https://extensions.kbizsoft.com/magicaa-extension/send-invitation.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Email': USER_EMAIL },
      body: JSON.stringify({ email, role }),
    })
    if (!response.ok) throw new Error(`Unable to send invitation (${response.status})`)
    const result = await response.json() as { success?: boolean; message?: string }
    if (!result.success) throw new Error(result.message || 'Unable to send invitation')
  },
}
