import { existsSync, promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { EchoConfig } from "./types";

export function resolveWhisperBinary(configuredPath: string | null, resourcesPath: string): string | null {
  const executable = process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
  const candidates = [configuredPath, join(resourcesPath, "bin", executable), join(process.cwd(), "resources", "bin", process.platform, process.arch, executable)];
  return candidates.find((value): value is string => Boolean(value && existsSync(value))) ?? null;
}

function resample(input: Float32Array, fromRate: number, toRate = 16000): Float32Array {
  if (fromRate === toRate) return input;
  const outputLength = Math.max(1, Math.round(input.length * toRate / fromRate));
  const output = new Float32Array(outputLength);
  const ratio = fromRate / toRate;
  for (let i = 0; i < outputLength; i += 1) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(input.length - 1, left + 1);
    const mix = position - left;
    output[i] = input[left] * (1 - mix) + input[right] * mix;
  }
  return output;
}

function wavBuffer(samples: Float32Array, sampleRate: number): Buffer {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    buffer.writeInt16LE(Math.round(sample < 0 ? sample * 32768 : sample * 32767), 44 + index * 2);
  }
  return buffer;
}

export async function transcribe(
  samples: Float32Array,
  inputRate: number,
  config: EchoConfig,
  resourcesPath: string
): Promise<string> {
  const binary = resolveWhisperBinary(config.whisper.binaryPath, resourcesPath);
  if (!binary) throw new Error("Choose a whisper-cli executable in Setup.");
  if (!config.whisper.modelPath || !existsSync(config.whisper.modelPath)) throw new Error("Choose a local Whisper model in Setup.");
  if (samples.length < inputRate * 0.18) throw new Error("That recording was too short.");

  const id = `echo-${process.pid}-${Date.now()}`;
  const wavPath = join(tmpdir(), `${id}.wav`);
  const outputBase = join(tmpdir(), id);
  const outputPath = `${outputBase}.txt`;
  const normalized = resample(samples, inputRate);
  await fs.writeFile(wavPath, wavBuffer(normalized, 16000));

  const args = [
    "-m", config.whisper.modelPath,
    "-f", wavPath,
    "-t", String(config.whisper.threads),
    "-l", config.whisper.language,
    "-otxt", "-of", outputBase,
    "-nt", "-np"
  ];
  if (config.vocabulary.length) args.push("--prompt", config.vocabulary.slice(0, 120).join(", "));

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(binary, args, { windowsHide: true });
      let errors = "";
      child.stderr.on("data", chunk => { errors += String(chunk); });
      child.once("error", reject);
      child.once("exit", code => code === 0 ? resolve() : reject(new Error(errors.trim().split("\n").at(-1) || `Whisper exited with code ${code}.`)));
    });
    return (await fs.readFile(outputPath, "utf8")).trim();
  } finally {
    await Promise.allSettled([fs.unlink(wavPath), fs.unlink(outputPath)]);
  }
}
