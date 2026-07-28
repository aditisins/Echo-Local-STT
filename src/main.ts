import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  session,
  systemPreferences,
  Tray
} from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ConfigStore } from "./config";
import { interpretTranscript } from "./commands";
import { clearAllShortcut, HotkeyController, pasteShortcut, undoShortcut } from "./hotkey";
import { resolveWhisperBinary, transcribe } from "./whisper";
import { automaticSetup } from "./setup";
import type { AudioChunk, EchoConfig, EchoSnapshot, RuntimeStatus } from "./types";

let settingsWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let store: ConfigStore;
let hotkeys: HotkeyController | null = null;
let quitting = false;
let chunks: Float32Array[] = [];
let audioRate = 48000;
let testing = false;
let capturingShortcut = false;

const status: RuntimeStatus = {
  phase: "idle",
  message: "Ready to dictate",
  modelReady: false,
  lastTranscript: "",
  platform: process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "other",
  accessibilityReady: process.platform !== "darwin"
};

function appFile(name: string): string {
  return join(__dirname, name);
}

function snapshot(): EchoSnapshot {
  const config = store.get();
  status.modelReady = Boolean(resolveWhisperBinary(config.whisper.binaryPath, process.resourcesPath) && config.whisper.modelPath && existsSync(config.whisper.modelPath));
  status.accessibilityReady = process.platform !== "darwin" || systemPreferences.isTrustedAccessibilityClient(false);
  return { config, status: { ...status } };
}

function broadcast(): void {
  const value = snapshot();
  for (const window of [settingsWindow, overlayWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send("echo:snapshot", value);
  }
}

function setPhase(phase: RuntimeStatus["phase"], message: string): void {
  status.phase = phase;
  status.message = message;
  broadcast();
}

function positionOverlay(): void {
  if (!overlayWindow) return;
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  const { x, y, width, height } = display.workArea;
  const [windowWidth, windowHeight] = overlayWindow.getSize();
  overlayWindow.setPosition(
    Math.round(x + (width - windowWidth) / 2),
    Math.round(y + height - windowHeight - 28),
    false
  );
}

function createSettingsWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 900,
    minHeight: 640,
    show: false,
    title: "Echo",
    backgroundColor: "#f4f1ea",
    webPreferences: {
      preload: appFile("preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window.setMenuBarVisibility(false);
  window.loadFile(appFile("index.html"));
  window.once("ready-to-show", () => window.show());
  window.on("close", event => {
    if (!quitting) {
      event.preventDefault();
      window.hide();
    }
  });
  return window;
}

function createOverlayWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 352,
    height: 92,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    show: false,
    focusable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: appFile("preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window.setAlwaysOnTop(true, "floating");
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.loadFile(appFile("overlay.html"));
  return window;
}

function trayImage(): Electron.NativeImage {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><rect x="7" y="2" width="8" height="12" rx="4" fill="#111"/><path d="M4 10a7 7 0 0 0 14 0M11 17v3M7 20h8" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round"/></svg>`;
  const image = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
  image.setTemplateImage(process.platform === "darwin");
  return image;
}

function showSettings(): void {
  settingsWindow?.show();
  settingsWindow?.focus();
  broadcast();
}

function beginRecording(isTest = false): void {
  if (status.phase === "transcribing" || status.phase === "recording") return;
  const ready = snapshot().status.modelReady;
  if (!ready) {
    setPhase("error", "Finish local model setup first");
    showSettings();
    return;
  }
  testing = isTest;
  chunks = [];
  positionOverlay();
  overlayWindow?.showInactive();
  setPhase("recording", "Listening…");
}

function endRecording(): void {
  if (status.phase !== "recording") return;
  setPhase("transcribing", "Turning speech into text…");
}

async function pasteText(text: string, config: EchoConfig): Promise<void> {
  const previous = clipboard.readText();
  clipboard.writeText(text);
  pasteShortcut();
  await new Promise(resolve => setTimeout(resolve, config.pasteDelayMs));
  if (clipboard.readText() === text) clipboard.writeText(previous);
}

async function finishTranscription(): Promise<void> {
  if (status.phase !== "transcribing") return;
  const config = store.get();
  try {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const samples = new Float32Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }
    const transcript = await transcribe(samples, audioRate, config, process.resourcesPath);
    status.lastTranscript = transcript;
    const actions = interpretTranscript(transcript, config.voiceCommands);
    if (!testing) {
      for (const action of actions) {
        if (action.type === "undo") undoShortcut();
        else if (action.type === "clear_all") await clearAllShortcut();
        else await pasteText(action.value, config);
      }
    }
    setPhase("success", testing ? "Mic test complete" : "Inserted at your cursor");
    setTimeout(() => {
      if (status.phase === "success") {
        overlayWindow?.hide();
        setPhase("idle", "Ready to dictate");
      }
    }, 950);
  } catch (error) {
    setPhase("error", error instanceof Error ? error.message : "Dictation failed.");
    setTimeout(() => {
      overlayWindow?.hide();
      if (status.phase === "error") setPhase("idle", "Ready to dictate");
    }, 2600);
  } finally {
    chunks = [];
    testing = false;
  }
}

function configureHotkeys(config: EchoConfig): void {
  if (hotkeys) {
    hotkeys.update(config.shortcut.accelerator, config.shortcut.mode);
    return;
  }
  hotkeys = new HotkeyController(
    config.shortcut.accelerator,
    config.shortcut.mode,
    () => {
      if (capturingShortcut) return;
      if (store.get().shortcut.mode === "toggle" && status.phase === "recording") endRecording();
      else beginRecording();
    },
    () => endRecording()
  );
}

function registerIpc(): void {
  ipcMain.handle("echo:get-snapshot", () => snapshot());
  ipcMain.handle("echo:save-config", (_event, next: EchoConfig) => {
    const previous = store.get();
    try {
      const saved = store.set(next);
      configureHotkeys(saved);
      app.setLoginItemSettings({ openAtLogin: saved.launchAtLogin });
      setPhase("idle", "Settings saved");
      return snapshot();
    } catch (error) {
      store.set(previous);
      throw error;
    }
  });
  ipcMain.handle("echo:choose-file", async (_event, kind: "model" | "binary") => {
    const options: Electron.OpenDialogOptions = {
      title: kind === "model" ? "Choose a local Whisper model" : "Choose whisper-cli",
      properties: ["openFile"],
      filters: kind === "model"
        ? [{ name: "Whisper models", extensions: ["bin"] }]
        : [{ name: "Executable", extensions: process.platform === "win32" ? ["exe"] : ["*"] }]
    };
    const result = settingsWindow
      ? await dialog.showOpenDialog(settingsWindow, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle("echo:automatic-setup", async () => {
    const report = (progress: import("./types").SetupProgress): void => {
      settingsWindow?.webContents.send("echo:setup-progress", progress);
    };
    try {
      const configured = await automaticSetup(app.getPath("userData"), process.resourcesPath, store.get(), report);
      store.set(configured);
      setPhase("idle", "Ready to dictate");
      return snapshot();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Setup did not finish. Please try again.";
      report({ stage: "error", percent: 0, message: "Setup paused", detail: message });
      throw error;
    }
  });
  ipcMain.handle("echo:open-settings", () => showSettings());
  ipcMain.handle("echo:set-shortcut-capture", (_event, active: boolean) => {
    capturingShortcut = Boolean(active);
  });
  ipcMain.handle("echo:begin-test", () => beginRecording(true));
  ipcMain.handle("echo:end-test", () => endRecording());
  ipcMain.on("echo:audio-chunk", (_event, chunk: AudioChunk) => {
    if (status.phase !== "recording" || !Array.isArray(chunk.samples)) return;
    audioRate = chunk.sampleRate;
    chunks.push(Float32Array.from(chunk.samples));
    overlayWindow?.webContents.send("echo:level", chunk.level);
  });
  ipcMain.on("echo:audio-end", () => void finishTranscription());
}

async function initialize(): Promise<void> {
  store = new ConfigStore(join(app.getPath("userData"), "config.json"));
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => callback(permission === "media"));
  registerIpc();
  settingsWindow = createSettingsWindow();
  overlayWindow = createOverlayWindow();
  configureHotkeys(store.get());
  app.setLoginItemSettings({ openAtLogin: store.get().launchAtLogin });

  tray = new Tray(trayImage());
  tray.setToolTip("Echo — offline dictation");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open Echo", click: showSettings },
    { label: "Start dictating", click: () => beginRecording() },
    { type: "separator" },
    { label: "Quit Echo", click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on("double-click", showSettings);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", showSettings);
  app.whenReady().then(initialize);
  app.on("before-quit", () => {
    quitting = true;
    hotkeys?.stop();
  });
  app.on("window-all-closed", () => undefined);
}
