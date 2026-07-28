export type ShortcutMode = "toggle" | "hold";
export type EchoPhase = "idle" | "recording" | "transcribing" | "success" | "error";

export interface EchoConfig {
  version: 2;
  shortcut: {
    accelerator: string;
    mode: ShortcutMode;
  };
  whisper: {
    binaryPath: string | null;
    modelPath: string | null;
    language: string;
    threads: number;
  };
  vocabulary: string[];
  voiceCommands: boolean;
  launchAtLogin: boolean;
  pasteDelayMs: number;
}

export interface RuntimeStatus {
  phase: EchoPhase;
  message: string;
  modelReady: boolean;
  lastTranscript: string;
  platform: "windows" | "macos" | "other";
  accessibilityReady: boolean;
}

export interface EchoSnapshot {
  config: EchoConfig;
  status: RuntimeStatus;
}

export interface AudioChunk {
  sampleRate: number;
  samples: number[];
  level: number;
}

export interface SetupProgress {
  stage: "idle" | "runtime" | "model" | "complete" | "error";
  percent: number;
  message: string;
  detail: string;
}

export interface EchoApi {
  getSnapshot(): Promise<EchoSnapshot>;
  saveConfig(config: EchoConfig): Promise<EchoSnapshot>;
  chooseFile(kind: "model" | "binary"): Promise<string | null>;
  automaticSetup(): Promise<EchoSnapshot>;
  setShortcutCapture(active: boolean): Promise<void>;
  openSettings(): Promise<void>;
  beginTest(): Promise<void>;
  endTest(): Promise<void>;
  sendAudioChunk(chunk: AudioChunk): void;
  endAudio(): void;
  onSnapshot(listener: (snapshot: EchoSnapshot) => void): () => void;
  onLevel(listener: (level: number) => void): () => void;
  onSetupProgress(listener: (progress: SetupProgress) => void): () => void;
}
