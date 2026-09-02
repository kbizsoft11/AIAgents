import { Shortcut, ShortcutFolder, ShortcutInput } from '../types/shortcut'

const STORAGE_KEY = 'colix_shortcuts'
const FOLDERS_KEY = 'colix_folders'

const createId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

export const storageManager = {
  /**
   * Get all shortcuts from localStorage
   */
  getAllShortcuts: (): Shortcut[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      return data ? JSON.parse(data) : []
    } catch (error) {
      console.error('Error reading shortcuts from storage:', error)
      return []
    }
  },

  /**
   * Get a single shortcut by id
   */
  getShortcutById: (id: string): Shortcut | null => {
    const shortcuts = storageManager.getAllShortcuts()
    return shortcuts.find(s => s.id === id) || null
  },

  /**
   * Get a shortcut by trigger name
   */
  getShortcutByName: (name: string): Shortcut | null => {
    const shortcuts = storageManager.getAllShortcuts()
    return shortcuts.find(s => s.name === name) || null
  },

  /**
   * Add a new shortcut
   */
  addShortcut: (input: ShortcutInput, folderId?: string): Shortcut => {
    const shortcuts = storageManager.getAllShortcuts()
    const newShortcut: Shortcut = {
      id: createId(),
      name: input.name,
      label: input.label,
      content: input.content,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      folderId,
    }
    shortcuts.push(newShortcut)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts))
    return newShortcut
  },

  /**
   * Update an existing shortcut
   */
  updateShortcut: (id: string, input: ShortcutInput): Shortcut | null => {
    const shortcuts = storageManager.getAllShortcuts()
    const index = shortcuts.findIndex(s => s.id === id)
    
    if (index === -1) return null

    shortcuts[index] = {
      ...shortcuts[index],
      name: input.name,
      label: input.label,
      content: input.content,
      updatedAt: Date.now(),
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts))
    return shortcuts[index]
  },

  /**
   * Delete a shortcut
   */
  deleteShortcut: (id: string): boolean => {
    const shortcuts = storageManager.getAllShortcuts()
    const filtered = shortcuts.filter(s => s.id !== id)
    
    if (filtered.length === shortcuts.length) return false
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
    return true
  },

  /**
   * Clear all shortcuts
   */
  clearAllShortcuts: (): void => {
    localStorage.removeItem(STORAGE_KEY)
  },

  getAllFolders: (): ShortcutFolder[] => {
    try {
      const data = localStorage.getItem(FOLDERS_KEY)
      if (data) return JSON.parse(data)
    } catch (error) {
      console.error('Error reading folders from storage:', error)
    }

    const defaultFolder: ShortcutFolder = {
      id: 'default-folder',
      name: 'My Shortcuts',
      createdAt: Date.now(),
    }
    localStorage.setItem(FOLDERS_KEY, JSON.stringify([defaultFolder]))
    return [defaultFolder]
  },

  addFolder: (name: string): ShortcutFolder => {
    const folders = storageManager.getAllFolders()
    const folder: ShortcutFolder = { id: createId(), name, createdAt: Date.now() }
    localStorage.setItem(FOLDERS_KEY, JSON.stringify([...folders, folder]))
    return folder
  },

  renameFolder: (id: string, name: string): boolean => {
    const folders = storageManager.getAllFolders()
    const folder = folders.find(item => item.id === id)
    if (!folder) return false
    folder.name = name
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders))
    return true
  },

  deleteFolder: (id: string): boolean => {
    const folders = storageManager.getAllFolders()
    if (folders.length <= 1 || !folders.some(folder => folder.id === id)) return false
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders.filter(folder => folder.id !== id)))
    return true
  },

  moveShortcutToFolder: (shortcutId: string, folderId: string): boolean => {
    const shortcuts = storageManager.getAllShortcuts()
    const shortcut = shortcuts.find(item => item.id === shortcutId)
    if (!shortcut) return false
    shortcut.folderId = folderId
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts))
    return true
  },
}
