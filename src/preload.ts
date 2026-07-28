import { contextBridge, ipcRenderer } from "electron";
import type { AudioChunk, EchoApi, EchoConfig, EchoSnapshot, SetupProgress } from "./types";

const api: EchoApi = {
  getSnapshot: () => ipcRenderer.invoke("echo:get-snapshot"),
  saveConfig: (config: EchoConfig) => ipcRenderer.invoke("echo:save-config", config),
  chooseFile: (kind: "model" | "binary") => ipcRenderer.invoke("echo:choose-file", kind),
  automaticSetup: () => ipcRenderer.invoke("echo:automatic-setup"),
  setShortcutCapture: (active: boolean) => ipcRenderer.invoke("echo:set-shortcut-capture", active),
  openSettings: () => ipcRenderer.invoke("echo:open-settings"),
  beginTest: () => ipcRenderer.invoke("echo:begin-test"),
  endTest: () => ipcRenderer.invoke("echo:end-test"),
  sendAudioChunk: (chunk: AudioChunk) => ipcRenderer.send("echo:audio-chunk", chunk),
  endAudio: () => ipcRenderer.send("echo:audio-end"),
  onSnapshot: (listener: (snapshot: EchoSnapshot) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, snapshot: EchoSnapshot) => listener(snapshot);
    ipcRenderer.on("echo:snapshot", wrapped);
    return () => ipcRenderer.removeListener("echo:snapshot", wrapped);
  },
  onLevel: (listener: (level: number) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, level: number) => listener(level);
    ipcRenderer.on("echo:level", wrapped);
    return () => ipcRenderer.removeListener("echo:level", wrapped);
  },
  onSetupProgress: (listener: (progress: SetupProgress) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, progress: SetupProgress) => listener(progress);
    ipcRenderer.on("echo:setup-progress", wrapped);
    return () => ipcRenderer.removeListener("echo:setup-progress", wrapped);
  }
};

contextBridge.exposeInMainWorld("echo", api);
