let stream: MediaStream | null = null;
let context: AudioContext | null = null;
let processor: ScriptProcessorNode | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let recording = false;
let wantsRecording = false;

const pill = document.querySelector<HTMLElement>("#overlay-pill")!;
const label = document.querySelector<HTMLElement>("#overlay-label")!;
const bars = Array.from(document.querySelectorAll<HTMLElement>(".meter i"));

async function startCapture(): Promise<void> {
  if (recording) return;
  stream = stream ?? await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false
  });
  context = new AudioContext({ latencyHint: "interactive" });
  source = context.createMediaStreamSource(stream);
  processor = context.createScriptProcessor(2048, 1, 1);
  processor.onaudioprocess = event => {
    if (!recording) return;
    const input = event.inputBuffer.getChannelData(0);
    const copy = Array.from(input);
    const rms = Math.sqrt(input.reduce((sum, value) => sum + value * value, 0) / input.length);
    window.echo.sendAudioChunk({ sampleRate: context!.sampleRate, samples: copy, level: Math.min(1, rms * 8) });
  };
  source.connect(processor);
  processor.connect(context.destination);
  recording = true;
  if (!wantsRecording) await stopCapture();
}

async function stopCapture(): Promise<void> {
  if (!recording) return;
  recording = false;
  processor?.disconnect();
  source?.disconnect();
  await context?.close();
  processor = null;
  source = null;
  context = null;
  window.echo.endAudio();
}

function render(phase: string, message: string): void {
  pill.dataset.phase = phase;
  label.textContent = message;
  wantsRecording = phase === "recording";
  if (wantsRecording) void startCapture().catch(error => {
    label.textContent = error instanceof Error ? error.message : "Microphone unavailable";
    void window.echo.endTest();
    window.echo.endAudio();
  });
  else void stopCapture();
}

window.echo.onSnapshot(({ status }) => render(status.phase, status.message));
window.echo.getSnapshot().then(({ status }) => render(status.phase, status.message));

const setLevel = (level: number): void => {
  bars.forEach((bar, index) => {
    const threshold = index / Math.max(1, bars.length - 1);
    bar.style.transform = `scaleY(${Math.max(0.25, level > threshold ? 0.45 + level * 0.8 : 0.25)})`;
  });
};

window.echo.onLevel(setLevel);
setInterval(() => {
  if (!recording) setLevel(0.12);
}, 300);
