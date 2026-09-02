import { Shortcut } from '../types/shortcut'

/**
 * IPC Service - Handles all communication between Renderer and Main process
 */

export const ipcService = {
  openExternalUrl: async (url: string): Promise<void> => {
    await window.ipcRenderer.invoke('open-external-url', url)
  },

  getAppIcons: async (processNames: string[]): Promise<Record<string, string>> => {
    try {
      return await window.ipcRenderer.invoke('get-app-icons', processNames)
    } catch (error) {
      console.error('Error loading application icons:', error)
      return {}
    }
  },

  /**
   * Request the main process to start the keyboard hook
   */
  startKeyboardHook: async (shortcuts: Shortcut[]): Promise<{ success: boolean; message: string }> => {
    try {
      const result = await window.ipcRenderer.invoke('start-keyboard-hook', shortcuts)
      return result
    } catch (error) {
      console.error('Error starting keyboard hook:', error)
      return { success: false, message: 'Failed to start keyboard hook' }
    }
  },

  /**
   * Request the main process to stop the keyboard hook
   */
  stopKeyboardHook: async (): Promise<{ success: boolean; message: string }> => {
    try {
      const result = await window.ipcRenderer.invoke('stop-keyboard-hook')
      return result
    } catch (error) {
      console.error('Error stopping keyboard hook:', error)
      return { success: false, message: 'Failed to stop keyboard hook' }
    }
  },

  /**
   * Update shortcuts in the keyboard hook
   */
  updateShortcuts: async (shortcuts: Shortcut[]): Promise<{ success: boolean; message: string }> => {
    try {
      const result = await window.ipcRenderer.invoke('update-shortcuts', shortcuts)
      return result
    } catch (error) {
      console.error('Error updating shortcuts:', error)
      return { success: false, message: 'Failed to update shortcuts' }
    }
  },

  /**
   * Toggle paste functionality
   */
  togglePaste: async (enabled: boolean): Promise<{ success: boolean; message: string }> => {
    try {
      const result = await window.ipcRenderer.invoke('toggle-paste', enabled)
      return result
    } catch (error) {
      console.error('Error toggling paste:', error)
      return { success: false, message: 'Failed to toggle paste' }
    }
  },

  setAppControls: async (controls: Record<string, boolean>): Promise<{ success: boolean; message: string }> => {
    try {
      return await window.ipcRenderer.invoke('set-app-controls', controls)
    } catch (error) {
      console.error('Error updating application controls:', error)
      return { success: false, message: 'Failed to update application controls' }
    }
  },

  /**
   * Listen for keyboard hook ready event
   */
  onKeyboardHookReady: (callback: (isReady: boolean) => void) => {
    window.ipcRenderer.on('keyboard-hook-ready', (_event, isReady: boolean) => {
      callback(isReady)
    })
  },

  /**
   * Listen for shortcut triggered event
   */
  onShortcutTriggered: (callback: (shortcutName: string, content: string) => void) => {
    window.ipcRenderer.on('shortcut-triggered', (_event, shortcutName: string, content: string) => {
      callback(shortcutName, content)
    })
  },

  /**
   * Send notification to main process (for status updates, etc.)
   */
  sendNotification: (message: string) => {
    window.ipcRenderer.send('notification', message)
  },

  copyRichText: async (content: string): Promise<void> => {
    await window.ipcRenderer.invoke('copy-rich-text', content)
  },

  setShortcutTestFocused: (focused: boolean) => {
    window.ipcRenderer.send('shortcut-test-focus', focused)
  },
}
