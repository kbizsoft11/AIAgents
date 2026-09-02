import { app, BrowserWindow, clipboard, ipcMain, screen, shell } from 'electron'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { createKeyboardHook } from './keyboardHook'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let fieldWindow: BrowserWindow | null = null
let keyboardHook: ReturnType<typeof createKeyboardHook> | null = null
type HookShortcuts = Parameters<ReturnType<typeof createKeyboardHook>['start']>[0]
type DynamicField = { label: string; defaultValue: string }
const pendingFieldRequests = new Map<string, { resolve: (values: Record<string, string> | null) => void; targetWindow: string }>()

function findApplicationExecutable(processName: string): string | null {
  if (process.platform !== 'win32') return null
  const cleanName = processName.toLowerCase().replace(/\.exe$/, '')
  const localAppData = process.env.LOCALAPPDATA || ''
  const programFiles = process.env.ProgramFiles || ''
  const programFilesX86 = process.env['ProgramFiles(x86)'] || ''
  const candidates: Record<string, string[]> = {
    chrome: [`${localAppData}\\Google\\Chrome\\Application\\chrome.exe`, `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`],
    msedge: [`${programFilesX86}\\Microsoft\\Edge\\Application\\msedge.exe`, `${localAppData}\\Microsoft\\Edge\\Application\\msedge.exe`],
    firefox: [`${programFiles}\\Mozilla Firefox\\firefox.exe`, `${programFilesX86}\\Mozilla Firefox\\firefox.exe`],
    brave: [`${localAppData}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`, `${programFiles}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`],
    opera: [`${localAppData}\\Programs\\Opera\\opera.exe`, `${programFiles}\\Opera\\launcher.exe`],
    notepad: [`${process.env.WINDIR || 'C:\\Windows'}\\System32\\notepad.exe`],
    'notepad++': [`${programFiles}\\Notepad++\\notepad++.exe`, `${programFilesX86}\\Notepad++\\notepad++.exe`],
    outlook: [`${programFiles}\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE`, `${programFilesX86}\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE`],
    winword: [`${programFiles}\\Microsoft Office\\root\\Office16\\WINWORD.EXE`, `${programFilesX86}\\Microsoft Office\\root\\Office16\\WINWORD.EXE`],
    excel: [`${programFiles}\\Microsoft Office\\root\\Office16\\EXCEL.EXE`, `${programFilesX86}\\Microsoft Office\\root\\Office16\\EXCEL.EXE`],
    powerpnt: [`${programFiles}\\Microsoft Office\\root\\Office16\\POWERPNT.EXE`, `${programFilesX86}\\Microsoft Office\\root\\Office16\\POWERPNT.EXE`],
    'ms-teams': [`${localAppData}\\Microsoft\\Teams\\current\\Teams.exe`, `${localAppData}\\Microsoft\\Teams\\current\\ms-teams.exe`],
  }
  const candidate = candidates[cleanName]?.find(executable => existsSync(executable))
  if (candidate) return candidate
  const result = spawnSync('where.exe', [`${cleanName}.exe`], { encoding: 'utf8', windowsHide: true })
  return result.status === 0 ? result.stdout.split(/\r?\n/).map(line => line.trim()).find(Boolean) || null : null
}

function getForegroundWindow(): string {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Add-Type \'using System; using System.Runtime.InteropServices; public static class Win32 { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); }\'; [Console]::Write([Win32]::GetForegroundWindow())'], { encoding: 'utf8', windowsHide: true })
  return result.status === 0 ? result.stdout.trim() : ''
}

function restoreForegroundWindow(handle: string): void {
  if (!handle) return
  spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Add-Type 'using System; using System.Runtime.InteropServices; public static class Win32 { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd); }'; [Win32]::SetForegroundWindow([IntPtr]${handle})`], { windowsHide: true })
}

function escapeOverlayHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function renderFieldPreview(content: string): string {
  const fieldValues: Array<{ label: string; defaultValue: string; multiline: boolean; radio: boolean; options: string[] }> = []
  const markerPattern = /<span[^>]*data-field-label="([^"]+)"[^>]*?(?:data-field-default="([^"]*)")?[^>]*>.*?<\/span>\s*(?:&nbsp;)?/gis
  const marked = content.replace(markerPattern, (_match, label: string, defaultValue = '') => {
    const multiline = /data-field-type="paragraph"/i.test(_match)
    const radio = /data-field-type="radio"/i.test(_match)
    let options: string[] = []
    const optionsMatch = _match.match(/data-field-options="([^"]+)"/i)
    if (optionsMatch) {
      try { options = JSON.parse(decodeURIComponent(optionsMatch[1])) as string[] } catch { options = [] }
    }
    const index = fieldValues.push({ label, defaultValue, multiline, radio, options }) - 1
    return `FIELD_TOKEN_${index}_END`
  })
  const text = marked.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h[1-6]|li|ol|ul)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\n\s*\n+/g, '\n').trim()
  return escapeOverlayHtml(text).replace(/FIELD_TOKEN_(\d+)_END/g, (_match, indexText: string) => {
    const field = fieldValues[Number(indexText)]
    if (!field) return ''
    const { label, defaultValue, multiline, radio, options } = field
    if (radio) return `<span class="radio-field" data-field-label="${escapeOverlayHtml(label)}">${options.map((option, optionIndex) => `<label><input type="radio" name="field-${Number(indexText)}" value="${escapeOverlayHtml(option)}"${optionIndex === 0 ? ' checked' : ''}>${escapeOverlayHtml(option)}</label>`).join('')}</span>`
    if (options.length) return `<select class="inline-field inline-dropdown-field" data-field-label="${escapeOverlayHtml(label)}">${options.map(option => `<option value="${escapeOverlayHtml(option)}">${escapeOverlayHtml(option)}</option>`).join('')}</select>`
    return multiline
      ? `<textarea class="inline-field inline-paragraph-field" data-field-label="${escapeOverlayHtml(label)}" placeholder="${escapeOverlayHtml(label)}" autocomplete="off">${escapeOverlayHtml(defaultValue)}</textarea>`
      : `<input class="inline-field" data-field-label="${escapeOverlayHtml(label)}" value="${escapeOverlayHtml(defaultValue)}" placeholder="${escapeOverlayHtml(label)}" autocomplete="off">`
  }).replace(/\n/g, '<br>')
}

function showFieldWindow(fields: DynamicField[], content: string): Promise<Record<string, string> | null> {
  if (fieldWindow && !fieldWindow.isDestroyed()) fieldWindow.close()
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const targetWindow = getForegroundWindow()
  const previewHtml = renderFieldPreview(content)
    const html = `<!doctype html><html><head><meta charset="UTF-8"><style>
    *{box-sizing:border-box}body{margin:0;color:#172033;background:#fff;font-family:"Segoe UI",Tahoma,sans-serif}header{height:52px;padding:0 20px;display:flex;align-items:center;gap:9px;color:#fff;background:#125548;font-size:13px;font-weight:700}header span{width:28px;height:28px;display:grid;place-items:center;border-radius:50%;background:#1dac4b;font-size:15px}main{height:calc(100vh - 52px);padding:28px 32px 24px;display:flex;flex-direction:column}h1{margin:0 0 7px;color:#172033;font-size:22px}p{margin:0 0 22px;color:#6c7788;font-size:13px;line-height:1.45}.preview{flex:1;min-height:210px;max-height:none;margin:0 0 22px;padding:18px;overflow:auto;border:1px solid #cfe2d4;border-radius:10px;color:#536174;background:#f0faf2;font-size:15px;line-height:1.45;box-shadow:inset 0 1px 2px #17203308}.inline-field{width:170px;height:38px;display:block;margin:3px 0;padding:0 10px;vertical-align:middle;border:1px solid #9dceb0;border-radius:7px;outline:0;color:#172033;background:#fff;font:14px "Segoe UI",Tahoma,sans-serif}.inline-paragraph-field{width:100%;height:92px;display:block;margin:5px 0;padding:10px;resize:vertical;line-height:1.45}.inline-dropdown-field{padding:0 9px;background:#fff;cursor:pointer}.radio-field{display:flex;align-items:center;gap:12px;width:fit-content;margin:3px 0;padding:7px 10px;border:1px solid #cfe2d4;border-radius:7px;background:#fff}.radio-field label{display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:400;color:#536174}.radio-field input{accent-color:#1dac4b}.inline-field:focus{border-color:#1dac4b;box-shadow:0 0 0 3px #eaf8ee}.actions{display:flex;justify-content:flex-end;gap:10px;margin-top:auto;padding-top:4px}.actions button{height:41px;padding:0 19px;border:1px solid #b9d8c1;border-radius:8px;background:#f7fcf8;color:#16883b;font:700 13px "Segoe UI",Tahoma,sans-serif;cursor:pointer}.actions button:hover{background:#eaf8ee}.actions .submit{border-color:#1dac4b;background:#1dac4b;color:#fff;box-shadow:0 4px 10px #1dac4b30}.actions .submit:hover{background:#16883b}
  </style></head><body><header><span>✦</span>Fill shortcut fields</header><main><h1>Fill shortcut fields</h1><p>Enter values for this shortcut, then insert the completed content.</p><div class="preview">${previewHtml}</div><div class="actions"><button type="button" id="cancel">Cancel</button><button type="button" class="submit" id="insert">Insert</button></div></main><script>const finish=values=>window.ipcRenderer.send('field-values-submitted','${requestId}',values);document.getElementById('cancel').onclick=()=>finish(null);document.getElementById('insert').onclick=()=>{const values={};document.querySelectorAll('[data-field-label]').forEach(field=>{if(field.classList.contains('radio-field')){const selected=field.querySelector('input:checked');values[field.dataset.fieldLabel]=selected?.value||''}else{values[field.dataset.fieldLabel]=field.value}});finish(values)};document.querySelector('[data-field-label]')?.focus();</script></body></html>`
  fieldWindow = new BrowserWindow({ width: 560, height: Math.min(920, Math.max(680, 360 + fields.length * 84)), resizable: false, minimizable: false, maximizable: false, alwaysOnTop: true, autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.mjs') } })
  fieldWindow.on('closed', () => { fieldWindow = null; const pending = pendingFieldRequests.get(requestId); if (pending) { pendingFieldRequests.delete(requestId); restoreForegroundWindow(pending.targetWindow); pending.resolve(null) } })
  fieldWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  fieldWindow.center()
  return new Promise(resolve => { pendingFieldRequests.set(requestId, { resolve, targetWindow }) })
}

function createWindow() {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize
  const isPackaged = !process.env.VITE_DEV_SERVER_URL
  
  win = new BrowserWindow({
    width: Math.round(screenWidth * 0.85),
    height: Math.round(screenHeight * 0.85),
    minWidth: 760,
    minHeight: 560,
    center: true,
    autoHideMenuBar: isPackaged,
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  win.on('close', () => console.log('🪟 Main window close requested'))
  win.on('closed', () => console.log('🪟 Main window closed'))
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('💥 Renderer process gone:', details)
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  console.log('🛑 All windows closed')
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  createWindow()
})

process.on('uncaughtException', error => {
  console.error('💥 Main process uncaught exception:', error)
})
process.on('unhandledRejection', reason => {
  console.error('💥 Main process unhandled rejection:', reason)
})
app.on('will-quit', () => console.log('🛑 Electron will quit'))
process.on('exit', code => console.log(`🛑 Node process exit: ${code}`))

// Ensure the global listener is not left behind when the app is closed or
// replaced during an uninstall/reinstall.
app.on('before-quit', () => {
  fieldWindow?.close()
  keyboardHook?.stop()
})

// ========== IPC Handlers ==========

ipcMain.handle('open-external-url', async (_event, url: string) => {
  if (!url.startsWith('https://')) throw new Error('Only HTTPS URLs can be opened externally')
  await shell.openExternal(url)
  return { success: true }
})

ipcMain.handle('get-app-icons', async (_event, processNames: string[]) => {
  const icons: Record<string, string> = {}
  for (const processName of processNames) {
    const executable = findApplicationExecutable(processName)
    if (!executable) continue
    try {
      const image = await app.getFileIcon(executable, { size: 'small' })
      icons[processName] = image.toDataURL()
    } catch (error) {
      console.warn(`Unable to read icon for ${processName}:`, error)
    }
  }
  return icons
})

/**
 * Start keyboard hook
 */
ipcMain.handle('start-keyboard-hook', async (_event, shortcuts: HookShortcuts) => {
  try {
    if (!keyboardHook) {
      keyboardHook = createKeyboardHook(win, showFieldWindow)
    }
    
    const started = keyboardHook.start(shortcuts)
    
    if (win) {
      win.webContents.send('keyboard-hook-ready', started)
    }
    
    return { 
      success: started, 
      message: started ? 'Keyboard hook started' : 'Keyboard hook already running'
    }
  } catch (error) {
    console.error('Error starting keyboard hook:', error)
    return { success: false, message: 'Failed to start keyboard hook' }
  }
})

/**
 * Stop keyboard hook
 */
ipcMain.handle('stop-keyboard-hook', async () => {
  try {
    if (keyboardHook) {
      const stopped = keyboardHook.stop()
      
      if (win) {
        win.webContents.send('keyboard-hook-ready', false)
      }
      
      return { 
        success: stopped, 
        message: stopped ? 'Keyboard hook stopped' : 'Keyboard hook not running'
      }
    }
    
    return { success: true, message: 'Keyboard hook stopped' }
  } catch (error) {
    console.error('Error stopping keyboard hook:', error)
    return { success: false, message: 'Failed to stop keyboard hook' }
  }
})

/**
 * Update shortcuts in keyboard hook
 */
ipcMain.handle('update-shortcuts', async (_event, shortcuts: HookShortcuts) => {
  try {
    if (!keyboardHook) {
      keyboardHook = createKeyboardHook(win, showFieldWindow)
    }
    
    keyboardHook.updateShortcuts(shortcuts)
    return { success: true, message: 'Shortcuts updated' }
  } catch (error) {
    console.error('Error updating shortcuts:', error)
    return { success: false, message: 'Failed to update shortcuts' }
  }
})

/**
 * Toggle paste functionality
 */
ipcMain.handle('toggle-paste', async (_event, enabled: boolean) => {
  try {
    if (!keyboardHook) {
      keyboardHook = createKeyboardHook(win, showFieldWindow)
    }
    
    keyboardHook.setPasteEnabled(enabled)
    return { success: true, message: enabled ? 'Paste enabled' : 'Paste disabled' }
  } catch (error) {
    console.error('Error toggling paste:', error)
    return { success: false, message: 'Failed to toggle paste' }
  }
})

ipcMain.handle('set-app-controls', async (_event, controls: Record<string, boolean>) => {
  try {
    if (!keyboardHook) keyboardHook = createKeyboardHook(win, showFieldWindow)
    keyboardHook.setAppControls(controls)
    return { success: true, message: 'Application controls updated' }
  } catch (error) {
    console.error('Error updating application controls:', error)
    return { success: false, message: 'Failed to update application controls' }
  }
})

/**
 * Listen for notifications from renderer
 */
ipcMain.on('notification', (_event, message: string) => {
  console.log('Notification from renderer:', message)
})

ipcMain.on('field-values-submitted', (_event, requestId: string, values: Record<string, string> | null) => {
  const pending = pendingFieldRequests.get(requestId)
  if (!pending) return
  pendingFieldRequests.delete(requestId)
  if (fieldWindow && !fieldWindow.isDestroyed()) fieldWindow.close()
  restoreForegroundWindow(pending.targetWindow)
  pending.resolve(values)
})

ipcMain.handle('copy-rich-text', async (_event, content: string) => {
  const isHtml = /<\/?[a-z][\s\S]*>/i.test(content)
  if (isHtml) {
    const text = content
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<\/(p|div|h[1-6]|li|ol|ul)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    clipboard.write({ text, html: `<style>p,div,h1,h2,h3,h4,h5,h6{margin:0;padding:0}ul,ol{margin-top:0;margin-bottom:0}</style>${content}` })
  } else {
    clipboard.writeText(content)
  }
  return { success: true }
})

ipcMain.on('shortcut-test-focus', (_event, focused: boolean) => {
  keyboardHook?.setTestingInputFocused(focused)
})
