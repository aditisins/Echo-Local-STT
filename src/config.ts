import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { availableParallelism } from "node:os";
import type { EchoConfig } from "./types";

export const DEFAULT_CONFIG: EchoConfig = {
  version: 2,
  shortcut: { accelerator: "Ctrl+Shift+Space", mode: "toggle" },
  whisper: {
    binaryPath: null,
    modelPath: null,
    language: "auto",
    threads: Math.max(2, Math.min(8, Math.floor(availableParallelism() / 2)))
  },
  vocabulary: ["Echo", "Whisper", "OpenAI"],
  voiceCommands: true,
  launchAtLogin: false,
  pasteDelayMs: 90
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function migrateConfig(value: unknown): EchoConfig {
  const root = asRecord(value);
  const shortcut = asRecord(root.shortcut);
  const whisper = asRecord(root.whisper);
  const legacyHotkey = typeof root.hotkey === "string" ? root.hotkey : undefined;
  const vocabulary = Array.isArray(root.vocabulary)
    ? root.vocabulary.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean)
    : DEFAULT_CONFIG.vocabulary;

  return {
    version: 2,
    shortcut: {
      accelerator: typeof shortcut.accelerator === "string" ? shortcut.accelerator : legacyHotkey ?? DEFAULT_CONFIG.shortcut.accelerator,
      mode: shortcut.mode === "hold" ? "hold" : "toggle"
    },
    whisper: {
      binaryPath: typeof whisper.binaryPath === "string" ? whisper.binaryPath : null,
      modelPath: typeof whisper.modelPath === "string" ? whisper.modelPath : null,
      language: typeof whisper.language === "string" ? whisper.language : "auto",
      threads: typeof whisper.threads === "number" ? Math.max(1, Math.min(32, Math.round(whisper.threads))) : DEFAULT_CONFIG.whisper.threads
    },
    vocabulary,
    voiceCommands: typeof root.voiceCommands === "boolean" ? root.voiceCommands : true,
    launchAtLogin: typeof root.launchAtLogin === "boolean" ? root.launchAtLogin : false,
    pasteDelayMs: typeof root.pasteDelayMs === "number" ? Math.max(0, Math.min(1000, Math.round(root.pasteDelayMs))) : 90
  };
}

export class ConfigStore {
  private config: EchoConfig;

  constructor(private readonly path: string) {
    this.config = this.load();
  }

  get(): EchoConfig {
    return structuredClone(this.config);
  }

  set(next: unknown): EchoConfig {
    this.config = migrateConfig(next);
    mkdirSync(dirname(this.path), { recursive: true });
    const tempPath = `${this.path}.tmp`;
    writeFileSync(tempPath, JSON.stringify(this.config, null, 2), "utf8");
    renameSync(tempPath, this.path);
    return this.get();
  }

  private load(): EchoConfig {
    try {
      const migrated = migrateConfig(JSON.parse(readFileSync(this.path, "utf8")));
      this.config = migrated;
      return this.set(migrated);
    } catch {
      return structuredClone(DEFAULT_CONFIG);
    }
  }
}
