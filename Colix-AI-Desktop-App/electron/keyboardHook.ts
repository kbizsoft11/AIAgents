import { spawn, spawnSync, ChildProcess } from 'node:child_process'
import { BrowserWindow, clipboard } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const terminal = { reset: '\x1b[0m', cyan: '\x1b[36m', yellow: '\x1b[33m', green: '\x1b[32m', magenta: '\x1b[35m' }

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface Shortcut {
  id: string
  name: string
  label: string
  content: string
  createdAt: number
  updatedAt: number
}

interface DynamicField {
  label: string
  defaultValue: string
}

function htmlToPlainText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|h[1-6]|li|ol|ul)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

function clipboardText(value: string): string {
  return /<\/?[a-z][\s\S]*>/i.test(value) ? htmlToPlainText(value) : value.replace(/\n\s*\n+/g, '\n')
}

function clipboardHtml(value: string): string {
  return `<style>p,div,h1,h2,h3,h4,h5,h6{margin:0;padding:0}ul,ol{margin-top:0;margin-bottom:0}</style>${value}`
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function decodeHtml(value: string): string {
  return value.replace(/&quot;/gi, '"').replace(/&gt;/gi, '>').replace(/&lt;/gi, '<').replace(/&amp;/gi, '&')
}

function formatDateTime(format: string): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const hour12 = now.getHours() % 12 || 12
  const replacements: Record<string, string> = {
    YYYY: String(now.getFullYear()),
    MMMM: months[now.getMonth()],
    MMM: months[now.getMonth()].slice(0, 3),
    MM: pad(now.getMonth() + 1),
    DD: pad(now.getDate()),
    D: String(now.getDate()),
    dddd: weekdays[now.getDay()],
    ddd: weekdays[now.getDay()].slice(0, 3),
    HH: pad(now.getHours()),
    hh: pad(hour12),
    mm: pad(now.getMinutes()),
    ss: pad(now.getSeconds()),
    A: now.getHours() >= 12 ? 'PM' : 'AM',
    a: now.getHours() >= 12 ? 'pm' : 'am',
  }
  return format.replace(/YYYY|MMMM|MMM|MM|DD|dddd|ddd|D|HH|hh|mm|ss|A|a/g, token => replacements[token])
}

function resolveDynamicContent(content: string, latestClipboard: string, shortcuts: Shortcut[], fieldValues: Record<string, string>, visited = new Set<string>()): string {
  const isHtml = /<\/?[a-z][\s\S]*>/i.test(content)
  const clipboardValue = isHtml ? escapeHtml(latestClipboard) : latestClipboard
  let resolved = content.replace(/<span[^>]*data-snippet-trigger="([\-@][^"<>]+)"[^>]*>.*?<\/span>\s*(?:&nbsp;)?/gis, (_match, trigger: string) => {
    if (visited.has(trigger)) return ''
    const source = shortcuts.find(shortcut => shortcut.name === trigger)
    if (!source) return ''
    const nextVisited = new Set(visited).add(trigger)
    const sourceContent = resolveDynamicContent(source.content, latestClipboard, shortcuts, fieldValues, nextVisited)
    const sourceIsRich = /<\/?[a-z][\s\S]*>/i.test(source.content)
    return isHtml ? sourceIsRich ? sourceContent : escapeHtml(sourceContent) : clipboardText(sourceContent)
  })
  resolved = resolved.replace(/<span[^>]*data-field-label="([^"]+)"[^>]*>.*?<\/span>\s*(?:&nbsp;)?/gis, (_match, label: string) => {
    const value = fieldValues[decodeHtml(label)] ?? ''
    return isHtml ? escapeHtml(value) : value
  })
  return resolved
    .replace(/\{\{clipboard\}\}/gi, clipboardValue)
    .replace(/\{\{datetime:([^}]+)\}\}/gi, (_match, format: string) => {
      const value = formatDateTime(format)
      return isHtml ? escapeHtml(value) : value
    })
    .replace(/\{\{formula:([^}]+)\}\}/gi, (_match, expression: string) => {
      if (!/^[0-9+*/().\s-]+$/.test(expression.trim())) return ''
      try {
        const value = Function(`"use strict"; return (${expression})`)()
        return typeof value === 'number' && Number.isFinite(value) ? isHtml ? escapeHtml(String(value)) : String(value) : ''
      } catch {
        return ''
      }
    })
    .replace(/\{\{ifelse:([^}]+)\}\}/gi, (_match, payload: string) => {
      const parts = payload.split('|')
      if (parts.length !== 3) return ''
      try {
        const [condition, yesText, noText] = parts.map(part => decodeURIComponent(part))
        if (!/^[0-9+*/().\s<>=!-]+$/.test(condition.trim()) || !/(<=|>=|==|!=|<|>)/.test(condition) || /(^|[^=!<>])=([^=]|$)/.test(condition)) return ''
        const matches = Function(`"use strict"; return (${condition})`)()
        if (typeof matches !== 'boolean') return ''
        const result = matches ? yesText : noText
        return isHtml ? escapeHtml(result) : result
      } catch {
        return ''
      }
    })
}

function previewDynamicContent(content: string, shortcuts: Shortcut[], visited = new Set<string>()): string {
  return content
    .replace(/<span[^>]*data-snippet-trigger="([\-@][^"<>]+)"[^>]*>.*?<\/span>\s*(?:&nbsp;)?/gis, (_match, trigger: string) => {
      if (visited.has(trigger)) return ''
      const source = shortcuts.find(shortcut => shortcut.name === trigger)
      return source ? previewDynamicContent(source.content, shortcuts, new Set(visited).add(trigger)) : ''
    })
    .replace(/\{\{datetime:([^}]+)\}\}/gi, (_match, format: string) => formatDateTime(format))
    .replace(/\{\{formula:([^}]+)\}\}/gi, (_match, expression: string) => {
      if (!/^[0-9+*/().\s-]+$/.test(expression.trim())) return ''
      try {
        const value = Function(`"use strict"; return (${expression})`)()
        return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
      } catch {
        return ''
      }
    })
}

/**
 * Keyboard Hook using Python + pynput
 * Spawns a Python process that listens to all keystrokes globally
 */
export class KeyboardHook {
  private isActive: boolean = false
  private shortcuts: Shortcut[] = []
  private mainWindow: BrowserWindow | null = null
  private pythonProcess: ChildProcess | null = null
  private stdoutBuffer = ''
  private replacementInProgress = false
  private testingInputFocused = false
  private requestFieldValues: ((fields: DynamicField[], content: string) => Promise<Record<string, string> | null>) | null
  private isPasteEnabled: boolean = true
  private appControls: Record<string, boolean> = {}
  private foregroundProcessName = ''
  private lastLoggedForegroundProcess = ''
  private foregroundProcessTimer: NodeJS.Timeout | null = null

  constructor(mainWindow: BrowserWindow | null, requestFieldValues: ((fields: DynamicField[], content: string) => Promise<Record<string, string> | null>) | null = null) {
    this.mainWindow = mainWindow
    this.requestFieldValues = requestFieldValues
  }

  setTestingInputFocused(focused: boolean): void {
    this.testingInputFocused = focused
  }

  setPasteEnabled(enabled: boolean): void {
    this.isPasteEnabled = enabled
    console.log(`🔀 Paste functionality ${enabled ? 'ENABLED' : 'DISABLED'}`)
  }

  setAppControls(controls: Record<string, boolean>): void {
    this.appControls = Object.fromEntries(Object.entries(controls).map(([name, enabled]) => [name.toLowerCase().endsWith('.exe') ? name.toLowerCase() : `${name.toLowerCase()}.exe`, enabled]))
    console.log(`${terminal.cyan}[APP-CONTROLS]${terminal.reset} 🧩 Updated (${Object.keys(this.appControls).length} apps)`)
    console.log(`${terminal.cyan}[APP-CONTROLS]${terminal.reset} Map:`, this.appControls)
  }

  private getForegroundProcessName(): string {
    if (process.platform !== 'win32') return ''
    const command = `Add-Type 'using System; using System.Runtime.InteropServices; public static class ForegroundWindow { [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId); [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); }'; $id=0; $null = [ForegroundWindow]::GetWindowThreadProcessId([ForegroundWindow]::GetForegroundWindow(), [ref]$id); if ($id) { (Get-Process -Id $id -ErrorAction SilentlyContinue).ProcessName }`
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true })
    if (result.status !== 0) return ''
    const outputLines = result.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    return outputLines[outputLines.length - 1]?.toLowerCase() || ''
  }

  private isCurrentApplicationEnabled(): boolean {
    const processName = this.foregroundProcessName
    if (!processName) return true
    const processKey = processName.endsWith('.exe') ? processName : `${processName}.exe`
    const setting = this.appControls[processKey]
    console.log(`${terminal.magenta}[DECISION]${terminal.reset} 🔎 ${processKey} → ${setting === false ? 'OFF' : 'ON'}`)
    return setting !== false
  }

  private startForegroundProcessPolling(): void {
    if (process.platform !== 'win32' || this.foregroundProcessTimer) return
    const refresh = () => {
      this.foregroundProcessName = this.getForegroundProcessName()
      if (this.foregroundProcessName !== this.lastLoggedForegroundProcess) {
        this.lastLoggedForegroundProcess = this.foregroundProcessName
        console.log(`${terminal.yellow}[FOREGROUND]${terminal.reset} 🪟 ${this.foregroundProcessName || '(unknown)'}`)
      }
    }
    refresh()
    this.foregroundProcessTimer = setInterval(refresh, 500)
  }

  private stopForegroundProcessPolling(): void {
    if (!this.foregroundProcessTimer) return
    clearInterval(this.foregroundProcessTimer)
    this.foregroundProcessTimer = null
    this.foregroundProcessName = ''
  }

  /**
   * Start the keyboard hook
   */
  start(shortcuts: Shortcut[]): boolean {
    if (this.isActive) {
      console.log('🎹 Keyboard hook already active')
      return true
    }

    this.shortcuts = shortcuts
    this.isActive = true
    this.startForegroundProcessPolling()

    console.log('🎹 Keyboard hook STARTING...')
    console.log('📝 Registered shortcuts:')
    shortcuts.forEach(s => {
      console.log(`   "${s.name}" → "${s.content}"`)
    })

    // Spawn Python listener process
    this.spawnPythonListener()
    return true
  }

  /**
   * Stop the keyboard hook
   */
  stop(): boolean {
    if (!this.isActive) {
      console.log('🎹 Keyboard hook not active')
      return false
    }

    this.isActive = false
    this.stopForegroundProcessPolling()

    const pythonProcess = this.pythonProcess
    if (pythonProcess) {
      try {
        pythonProcess.stdin?.write(JSON.stringify({ type: 'stop' }) + '\n')
        setTimeout(() => {
          if (!pythonProcess.killed) {
            pythonProcess.kill()
          }
        }, 1000)
      } catch (error) {
        console.error('Error stopping Python process:', error)
      }
      this.pythonProcess = null
    }

    console.log('🎹 Keyboard hook STOPPED')
    return true
  }

  /**
   * Update shortcuts
   */
  updateShortcuts(shortcuts: Shortcut[]): void {
    this.shortcuts = shortcuts
    console.log('✏️ Shortcuts updated:', shortcuts.length)

    // Send updated shortcuts to Python process
    if (this.pythonProcess && this.pythonProcess.stdin) {
      try {
        const message = {
          type: 'update_shortcuts',
          shortcuts: shortcuts.map(s => ({
            name: s.name,
            label: s.label,
            content: s.content
          })),
        }
        this.pythonProcess.stdin.write(JSON.stringify(message) + '\n')
      } catch (error) {
        console.error('Error updating shortcuts in Python:', error)
      }
    }
  }

  /**
   * Spawn Python listener process
   */
  private spawnPythonListener(): void {
    try {
      const isPackaged = !process.env.VITE_DEV_SERVER_URL
      const exeName = process.platform === 'win32' ? 'listener.exe' : 'listener'

      const cmd = isPackaged
        ? path.join(process.resourcesPath, exeName)
        : process.platform === 'win32' ? 'python.exe' : 'python3'

      const args = isPackaged
        ? []
        : ['-u', path.join(__dirname, '..', 'listener.py')]

      console.log(`⚙️ Listener: ${cmd}`)

      // In development, Python may be installed on PATH rather than in the
      // project directory. The packaged listener must still exist explicitly.
      if (isPackaged && !existsSync(cmd)) {
        console.error(`❌ Listener not found: ${cmd}`)
        this.isActive = false
        this.mainWindow?.webContents.send('keyboard-hook-ready', false)
        return
      }

      this.pythonProcess = spawn(cmd, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false
      })

      if (!this.pythonProcess) {
        console.error('❌ Failed to spawn Python process')
        this.isActive = false
        if (this.mainWindow) {
          this.mainWindow.webContents.send('keyboard-hook-ready', false)
        }
        return
      }

      console.log(`✅ Python process spawned (PID: ${this.pythonProcess.pid})`)

      // Handle stdout (messages from Python)
      this.pythonProcess.stdout?.on('data', (data: Buffer) => {
        this.stdoutBuffer += data.toString('utf-8')
        const lines = this.stdoutBuffer.split(/\r?\n/)
        this.stdoutBuffer = lines.pop() ?? ''
        for (const line of lines) {
          const message = line.trim()
          if (message) {
            console.log(`[PYTHON-OUT] ${message}`)
            this.handlePythonMessage(message)
          }
        }
      })

      // Handle stderr (debug from Python)
      this.pythonProcess.stderr?.on('data', (data: Buffer) => {
        const message = data.toString('utf-8').trim()
        if (message) {
          console.error(`[PYTHON-ERR] ${message}`)
        }
      })

      // Handle process error
      this.pythonProcess.on('error', (err: Error) => {
        console.error(`❌ Python process error: ${err}`)
        this.isActive = false
        this.pythonProcess = null
        this.stdoutBuffer = ''
        if (this.mainWindow) {
          this.mainWindow.webContents.send('keyboard-hook-ready', false)
        }
      })

      // Handle process exit
      this.pythonProcess.on('exit', (code: number) => {
        console.log(`⚠️ Python listener exited with code ${code}`)
        this.isActive = false
        this.pythonProcess = null

        if (this.mainWindow) {
          this.mainWindow.webContents.send('keyboard-hook-ready', false)
        }
      })

      // Send initial shortcuts
      this.updateShortcuts(this.shortcuts)

      // Notify UI that hook is ready after a delay
      if (this.mainWindow) {
        setTimeout(() => {
          console.log(`📢 Notifying UI: Hook is ${this.isActive ? 'ACTIVE' : 'INACTIVE'}`)
          this.mainWindow?.webContents.send('keyboard-hook-ready', this.isActive)
        }, 1000)
      }

      console.log('✅ Python listener setup complete')
    } catch (error) {
      console.error('❌ Fatal error spawning Python process:', error)
      this.isActive = false

      if (this.mainWindow) {
        this.mainWindow.webContents.send('keyboard-hook-ready', false)
      }
    }
  }

  /**
   * Handle messages from Python process
   */
  private handlePythonMessage(message: string): void {
    try {
      // Parse JSON messages from Python
      const data = JSON.parse(message) as {
        type?: string
        trigger?: string
        content?: string
      }

      if (data.type === 'shortcut_detected' && typeof data.trigger === 'string' && typeof data.content === 'string') {
        const detectedAt = Date.now()
        console.log(`${terminal.green}[DETECTED]${terminal.reset} ✨ "${data.trigger}" at ${new Date(detectedAt).toISOString()}`)

        // The global listener also sees keystrokes inside ColixAI. Ignore the
        // event here instead of asking Python to inspect Windows processes.
        if (this.mainWindow?.isFocused() && !this.testingInputFocused) {
          console.log('⏭️ Ignoring shortcut while ColixAI is focused')
          return
        }

        // Check if paste is enabled
        if (!this.isPasteEnabled) {
          console.log('🔒 Paste functionality is disabled; ignoring shortcut')
          return
        }

        if (!this.isCurrentApplicationEnabled()) {
          console.log('🔒 Shortcut disabled for the current application')
          return
        }

        console.log(`${terminal.green}[REPLACE]${terminal.reset} 🔄 ${data.content.length} chars; checks ${Date.now() - detectedAt}ms`)

        // Request replacement through the Python keyboard listener.
        void this.requestReplacement(data.trigger, data.content)

        // Notify UI
        if (this.mainWindow) {
          this.mainWindow.webContents.send('shortcut-triggered', data.trigger, data.content)
        }
      }
    } catch (error) {
      // Not JSON, just debug output from Python
      if (message.length > 0) {
        console.log(`[PYTHON] ${message}`)
      }
    }
  }

  /**
   * Request replacement through the Python keyboard listener
   */
  private async requestReplacement(trigger: string, content: string): Promise<void> {
    if (this.replacementInProgress) {
      console.log('⏭️ Replacement already in progress; ignoring overlapping trigger')
      return
    }

    this.replacementInProgress = true
    const replacementStartedAt = Date.now()
    try {
      console.log(`📋 Preparing instant replacement (${content.length} characters)`)
      const previousClipboardText = clipboard.readText()
      const fieldMatches = [...content.matchAll(/<span[^>]*data-field-label="([^"]+)"[^>]*>/gi)]
      let fieldValues: Record<string, string> = {}
      if (fieldMatches.length) {
        const fields: DynamicField[] = fieldMatches.map(match => ({
          label: decodeHtml(match[1]),
          defaultValue: decodeHtml(match[0].match(/data-field-default="([^"]*)"/i)?.[1] || ''),
        }))
        const values = this.requestFieldValues ? await this.requestFieldValues(fields, previewDynamicContent(content, this.shortcuts)) : null
        if (!values) return
        fieldValues = values
        // Allow Windows to restore focus to the application where the trigger was typed.
        await new Promise(resolve => setTimeout(resolve, 180))
      }
      const resolvedContent = resolveDynamicContent(content, previousClipboardText, this.shortcuts, fieldValues)
      const isHtml = /<\/?[a-z][\s\S]*>/i.test(resolvedContent)
      if (isHtml) {
        clipboard.write({ text: clipboardText(resolvedContent), html: clipboardHtml(resolvedContent) })
      } else {
        clipboard.writeText(resolvedContent)
      }
      this.pythonProcess?.stdin?.write(JSON.stringify({
        type: 'replace_text',
        character_count: trigger.length,
      }) + '\n')
      // Give the target application time to consume Ctrl+V before restoring
      // the user's previous text clipboard contents.
      setTimeout(() => clipboard.writeText(previousClipboardText), 300)
      console.log(`${terminal.green}[TIMING]${terminal.reset} ✅ Requested after ${Date.now() - replacementStartedAt}ms`)
    } catch (error) {
      console.error('❌ Error performing replacement:', error)
    } finally {
      this.replacementInProgress = false
      console.log(`${terminal.green}[TIMING]${terminal.reset} ⏱️ Flow finished in ${Date.now() - replacementStartedAt}ms`)
    }
  }

  /**
   * Check if hook is active
   */
  isRunning(): boolean {
    return this.isActive
  }

  /**
   * Get all shortcuts
   */
  getShortcuts(): Shortcut[] {
    return this.shortcuts
  }
}

/**
 * Factory function to create keyboard hook
 */
export function createKeyboardHook(
  mainWindow: BrowserWindow | null,
  requestFieldValues: ((fields: DynamicField[], content: string) => Promise<Record<string, string> | null>) | null = null,
): KeyboardHook {
  return new KeyboardHook(mainWindow, requestFieldValues)
}
