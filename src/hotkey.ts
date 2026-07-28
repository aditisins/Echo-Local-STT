import { UiohookKey, uIOhook, type UiohookKeyboardEvent } from "uiohook-napi";
import type { ShortcutMode } from "./types";

interface ParsedHotkey {
  keycode: number;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

const keyAliases: Record<string, string> = {
  SPACE: "Space",
  ENTER: "Enter",
  TAB: "Tab",
  ESCAPE: "Escape",
  BACKSPACE: "Backspace",
  DELETE: "Delete",
  ARROWUP: "ArrowUp",
  ARROWDOWN: "ArrowDown",
  ARROWLEFT: "ArrowLeft",
  ARROWRIGHT: "ArrowRight"
};

function resolveKey(name: string): number | undefined {
  const normalized = name.toUpperCase();
  const enumName = keyAliases[normalized] ?? (/^[A-Z]$/.test(normalized) ? normalized : normalized.replace(/^DIGIT/, ""));
  return (UiohookKey as unknown as Record<string, number>)[enumName];
}

function parseAccelerator(value: string): ParsedHotkey {
  const parts = value.split("+").map(part => part.trim()).filter(Boolean);
  const keyName = parts.find(part => !/^(ctrl|control|shift|alt|option|meta|command|cmd)$/i.test(part));
  const keycode = keyName ? resolveKey(keyName) : undefined;
  if (keycode === undefined) throw new Error(`Unsupported shortcut key: ${keyName ?? value}`);
  return {
    keycode,
    ctrl: parts.some(part => /^(ctrl|control)$/i.test(part)),
    shift: parts.some(part => /^shift$/i.test(part)),
    alt: parts.some(part => /^(alt|option)$/i.test(part)),
    meta: parts.some(part => /^(meta|command|cmd)$/i.test(part))
  };
}

function matches(event: UiohookKeyboardEvent, hotkey: ParsedHotkey): boolean {
  return event.keycode === hotkey.keycode && event.ctrlKey === hotkey.ctrl && event.shiftKey === hotkey.shift && event.altKey === hotkey.alt && event.metaKey === hotkey.meta;
}

export class HotkeyController {
  private hotkey: ParsedHotkey;
  private mode: ShortcutMode;
  private down = false;

  constructor(accelerator: string, mode: ShortcutMode, private readonly onPress: () => void, private readonly onRelease: () => void) {
    this.hotkey = parseAccelerator(accelerator);
    this.mode = mode;
    uIOhook.on("keydown", this.handleDown);
    uIOhook.on("keyup", this.handleUp);
    uIOhook.start();
  }

  update(accelerator: string, mode: ShortcutMode): void {
    this.hotkey = parseAccelerator(accelerator);
    this.mode = mode;
    this.down = false;
  }

  stop(): void {
    uIOhook.stop();
  }

  private handleDown = (event: UiohookKeyboardEvent): void => {
    if (!matches(event, this.hotkey) || this.down) return;
    this.down = true;
    this.onPress();
  };

  private handleUp = (event: UiohookKeyboardEvent): void => {
    if (event.keycode !== this.hotkey.keycode || !this.down) return;
    this.down = false;
    if (this.mode === "hold") this.onRelease();
  };
}

export function pasteShortcut(): void {
  const modifier = process.platform === "darwin" ? UiohookKey.Meta : UiohookKey.Ctrl;
  uIOhook.keyTap(UiohookKey.V, [modifier]);
}

export function undoShortcut(): void {
  const modifier = process.platform === "darwin" ? UiohookKey.Meta : UiohookKey.Ctrl;
  uIOhook.keyTap(UiohookKey.Z, [modifier]);
}

export async function clearAllShortcut(): Promise<void> {
  const modifier = process.platform === "darwin" ? UiohookKey.Meta : UiohookKey.Ctrl;
  uIOhook.keyTap(UiohookKey.A, [modifier]);
  await new Promise(resolve => setTimeout(resolve, 45));
  uIOhook.keyTap(UiohookKey.Backspace);
}
