"""Global keyboard listener for ColixAI shortcuts."""

import json
import sys
import time
from threading import Thread

from pynput import keyboard

RESET = "\033[0m"
CYAN = "\033[36m"
GREEN = "\033[32m"

class ShortcutListener:
    def __init__(self):
        self.typed_buffer = ""
        self.shortcuts = {}
        self.buffer_clear_time = 1.0
        self.last_keystroke_time = time.time()
        self.listener = None
        self.controller = keyboard.Controller()

    def load_shortcuts(self, shortcuts_dict):
        """Load the current shortcut definitions."""
        self.shortcuts = {s['name']: s for s in shortcuts_dict}
        print(f"[LISTENER] Loaded {len(self.shortcuts)} shortcuts", flush=True)
        for name in self.shortcuts:
            print(f"  - '{name}'", flush=True)

    def on_press(self, key):
        try:
            if hasattr(key, 'char') and key.char is not None:
                self.on_key_typed(key.char)
            else:
                self.clear_buffer_if_timeout()
        except Exception as error:
            print(f"[ERROR] {error}", flush=True)

    def on_key_typed(self, char):
        current_time = time.time()
        if current_time - self.last_keystroke_time > self.buffer_clear_time:
            self.typed_buffer = ""

        self.last_keystroke_time = current_time
        self.typed_buffer += char

        for shortcut_name, shortcut_data in self.shortcuts.items():
            if self.typed_buffer == shortcut_name:
                print(f"{GREEN}[MATCH]{RESET} '{shortcut_name}' at {time.perf_counter():.6f}", flush=True)
                print(json.dumps({
                    "type": "shortcut_detected",
                    "trigger": shortcut_name,
                    "content": shortcut_data['content'],
                }), flush=True)
                self.typed_buffer = ""
                return

    def clear_buffer_if_timeout(self):
        if time.time() - self.last_keystroke_time > self.buffer_clear_time:
            self.typed_buffer = ""

    def start(self):
        print("[LISTENER] Starting global keyboard listener...", flush=True)
        self.listener = keyboard.Listener(on_press=self.on_press)
        self.listener.start()
        print("[LISTENER] Keyboard listener active", flush=True)
        try:
            self.listener.join()
        except KeyboardInterrupt:
            self.stop()

    def stop(self):
        if self.listener:
            self.listener.stop()

    def replace_text(self, character_count):
        """Remove the typed trigger and paste the clipboard into the target app."""
        import platform
        started_at = time.perf_counter()
        print(f"{CYAN}[REPLACE]{RESET} started; deleting {character_count} characters", flush=True)
        for _ in range(max(0, character_count)):
            self.controller.press(keyboard.Key.backspace)
            self.controller.release(keyboard.Key.backspace)

        # Mac uses Cmd+V, Windows/Linux uses Ctrl+V
        if platform.system() == 'Darwin':
            self.controller.press(keyboard.Key.cmd)
            self.controller.press('v')
            self.controller.release('v')
            self.controller.release(keyboard.Key.cmd)
        else:
            self.controller.press(keyboard.Key.ctrl)
            self.controller.press('v')
            self.controller.release('v')
            self.controller.release(keyboard.Key.ctrl)

        self.typed_buffer = ""
        print(f"{GREEN}[REPLACE]{RESET} finished in {(time.perf_counter() - started_at) * 1000:.1f}ms", flush=True)


def main():
    listener = ShortcutListener()
    print("[STARTUP] ColixAI Keyboard Listener Starting", flush=True)

    listener_thread = Thread(target=listener.start, daemon=True)
    listener_thread.start()

    try:
        while True:
            try:
                line = input()
                if not line.strip():
                    continue
                data = json.loads(line)
                if data.get("type") == "update_shortcuts":
                    listener.load_shortcuts(data.get("shortcuts", []))
                elif data.get("type") == "stop":
                    listener.stop()
                    break
                elif data.get("type") == "replace_text":
                    listener.replace_text(int(data.get("character_count", 0)))
            except json.JSONDecodeError:
                print("[ERROR] Invalid JSON received", flush=True)
            except EOFError:
                listener.stop()
                break
    except KeyboardInterrupt:
        listener.stop()
    finally:
        print("[SHUTDOWN] Keyboard listener shutting down", flush=True)


if __name__ == "__main__":
    main()
