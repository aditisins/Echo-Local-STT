import { createHash } from "node:crypto";
import { createReadStream, existsSync, promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { net } from "electron";
import extract from "extract-zip";
import type { EchoConfig, SetupProgress } from "./types";
import { resolveWhisperBinary } from "./whisper";

const WHISPER_VERSION = "v1.9.1";
const WINDOWS_RUNTIME_URL = `https://github.com/ggml-org/whisper.cpp/releases/download/${WHISPER_VERSION}/whisper-bin-x64.zip`;
const WINDOWS_RUNTIME_SHA256 = "7d8be46ecd31828e1eb7a2ecdd0d6b314feafd82163038ab6092594b0a063539";
const MODEL_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin?download=true";
const MODEL_SHA256 = "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002";

type ProgressReporter = (progress: SetupProgress) => void;

async function sha256(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", chunk => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolve(hash.digest("hex")));
  });
}

async function download(
  url: string,
  target: string,
  stage: SetupProgress["stage"],
  label: string,
  report: ProgressReporter
): Promise<void> {
  await fs.mkdir(dirname(target), { recursive: true });
  const partial = `${target}.download`;
  const response = await net.fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`Could not download ${label}. Check your internet connection and try again.`);
  const total = Number(response.headers.get("content-length") ?? 0);
  const reader = response.body.getReader();
  const file = await fs.open(partial, "w");
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await file.write(value);
      received += value.byteLength;
      const percent = total ? Math.min(99, Math.round(received / total * 100)) : 0;
      report({ stage, percent, message: `Downloading ${label}…`, detail: total ? `${Math.round(received / 1024 / 1024)} of ${Math.round(total / 1024 / 1024)} MB` : `${Math.round(received / 1024 / 1024)} MB` });
    }
  } finally {
    await file.close();
  }
  await fs.rename(partial, target);
}

async function findFile(root: string, name: string): Promise<string | null> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) return path;
    if (entry.isDirectory()) {
      const nested = await findFile(path, name);
      if (nested) return nested;
    }
  }
  return null;
}

async function ensureWindowsRuntime(userData: string, report: ProgressReporter): Promise<string> {
  if (process.arch !== "x64") throw new Error("Automatic runtime setup currently supports 64-bit Windows. Use Advanced setup on this device.");
  const engineDir = join(userData, "engine", WHISPER_VERSION);
  const existing = existsSync(engineDir) ? await findFile(engineDir, "whisper-cli.exe") : null;
  if (existing) return existing;
  const archive = join(userData, "downloads", `whisper-${WHISPER_VERSION}-x64.zip`);
  await fs.unlink(archive).catch(() => undefined);
  report({ stage: "runtime", percent: 0, message: "Getting the speech engine…", detail: "About 8 MB" });
  await download(WINDOWS_RUNTIME_URL, archive, "runtime", "the speech engine", report);
  report({ stage: "runtime", percent: 99, message: "Checking the speech engine…", detail: "Almost done" });
  if (await sha256(archive) !== WINDOWS_RUNTIME_SHA256) throw new Error("The speech engine download could not be verified. Please try again.");
  await fs.mkdir(engineDir, { recursive: true });
  await extract(archive, { dir: engineDir });
  await fs.unlink(archive).catch(() => undefined);
  const binary = await findFile(engineDir, "whisper-cli.exe");
  if (!binary) throw new Error("The downloaded speech engine was missing whisper-cli.exe.");
  return binary;
}

async function ensureModel(userData: string, report: ProgressReporter): Promise<string> {
  const model = join(userData, "models", "ggml-base.en.bin");
  if (existsSync(model) && await sha256(model) === MODEL_SHA256) return model;
  await fs.unlink(model).catch(() => undefined);
  report({ stage: "model", percent: 0, message: "Downloading the English model…", detail: "About 148 MB — one time only" });
  await download(MODEL_URL, model, "model", "the English model", report);
  report({ stage: "model", percent: 99, message: "Checking the model…", detail: "Keeping everything private" });
  if (await sha256(model) !== MODEL_SHA256) {
    await fs.unlink(model).catch(() => undefined);
    throw new Error("The model download could not be verified. Please try again.");
  }
  return model;
}

export async function automaticSetup(
  userData: string,
  resourcesPath: string,
  config: EchoConfig,
  report: ProgressReporter
): Promise<EchoConfig> {
  const next = structuredClone(config);
  let binary = resolveWhisperBinary(next.whisper.binaryPath, resourcesPath);
  if (!binary && process.platform === "win32") binary = await ensureWindowsRuntime(userData, report);
  if (!binary) throw new Error("This build does not include the Mac speech engine yet. Open Advanced setup and choose your whisper-cli file.");
  const model = await ensureModel(userData, report);
  next.whisper.binaryPath = binary;
  next.whisper.modelPath = model;
  next.whisper.language = "en";
  report({ stage: "complete", percent: 100, message: "Echo is ready", detail: "Your speech now stays on this device" });
  return next;
}
