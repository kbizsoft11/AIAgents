export interface Shortcut {
  id: string
  name: string
  label: string
  content: string
  createdAt: number
  updatedAt: number
  folderId?: string
}

export interface ShortcutFolder {
  id: string
  name: string
  createdAt: number
}

export interface ShortcutInput {
  name: string
  label: string
  content: string
}

export type ShortcutFormState = {
  isLoading: boolean
  error: string | null
  success: string | null
}
