import { SupabaseClient } from '@supabase/supabase-js'
import { Shortcut, ShortcutInput } from '../types/shortcut'

type ShortcutRow = {
  id: string
  user_id: string | null
  trigger: string
  expansion: string
  label: string | null
  usage_count: number | null
  created_at: string | null
  updated_at: string | null
  deleted_at: string | null
  email: string | null
  folder_id: string | null
  workspace_id: string | null
}

const toShortcut = (row: ShortcutRow): Shortcut => ({
  id: row.id,
  name: row.trigger,
  label: row.label || row.trigger,
  content: row.expansion,
  createdAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
  updatedAt: row.updated_at ? Date.parse(row.updated_at) : Date.now(),
  folderId: row.folder_id || undefined,
})

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`

export const shortcutService = {
  async getProfileUserId(client: SupabaseClient, email: string | undefined): Promise<string> {
    if (!email) throw new Error('The signed-in user has no email address')
    const { data, error } = await client
      .from('users')
      .select('id')
      .ilike('email', email)
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(`User profile lookup failed: ${error.message} [${error.code}]`)
    if (!data) throw new Error(`No public.users row found for ${email}`)
    return String((data as { id: string }).id)
  },

  async getAll(client: SupabaseClient, userId: string): Promise<Shortcut[]> {
    const { data, error } = await client
      .from('shortcuts')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
    if (error) throw error
    return (data as ShortcutRow[]).map(toShortcut)
  },

  async create(client: SupabaseClient, userId: string, email: string | undefined, input: ShortcutInput, folderId?: string): Promise<Shortcut> {
    const { data, error } = await client
      .from('shortcuts')
      .insert({
        id: newId(),
        user_id: userId,
        email,
        trigger: input.name,
        expansion: input.content,
        label: input.label,
        folder_id: folderId || null,
        usage_count: 0,
      })
      .select()
      .single()
    if (error) throw error
    return toShortcut(data as ShortcutRow)
  },

  async update(client: SupabaseClient, userId: string, id: string, input: ShortcutInput): Promise<Shortcut> {
    const { data, error } = await client
      .from('shortcuts')
      .update({ trigger: input.name, expansion: input.content, label: input.label, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .select()
      .single()
    if (error) throw error
    return toShortcut(data as ShortcutRow)
  },

  async remove(client: SupabaseClient, userId: string, id: string): Promise<void> {
    const { error } = await client
      .from('shortcuts')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
    if (error) throw error
  },

  async move(client: SupabaseClient, userId: string, id: string, folderId: string): Promise<void> {
    const { error } = await client
      .from('shortcuts')
      .update({ folder_id: folderId, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .is('deleted_at', null)
    if (error) throw error
  },
}
