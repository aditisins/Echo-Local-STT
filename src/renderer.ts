import type { EchoConfig, EchoSnapshot } from "./types";
import type { SetupProgress } from "./types";
import { animate, stagger } from "motion";

let current: EchoSnapshot;
let activeSection = "home";
let shortcutCapture: HTMLElement | null = null;

const $ = <T extends HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
const $$ = <T extends HTMLElement>(selector: string): T[] => Array.from(document.querySelectorAll<T>(selector));

function platformShortcut(value: string): string {
  if (current.status.platform !== "macos") return value.replace("Meta", "Win");
  return value.replace("Ctrl", "⌃").replace("Shift", "⇧").replace("Alt", "⌥").replace("Meta", "⌘").replaceAll("+", " ");
}

function basename(path: string | null): string {
  return path?.split(/[\\/]/).at(-1) ?? "Not selected";
}

function render(snapshot: EchoSnapshot): void {
  current = snapshot;
  const { config, status } = snapshot;
  $("#status-dot").dataset.phase = status.phase;
  $("#status-copy").textContent = status.message;
  $("#shortcut-key").textContent = platformShortcut(config.shortcut.accelerator);
  $("#shortcut-mode").textContent = config.shortcut.mode === "hold" ? "Hold to talk" : "Press to toggle";
  $("#model-status").textContent = status.modelReady ? basename(config.whisper.modelPath) : "Setup needed";
  $("#model-status").classList.toggle("ready", status.modelReady);
  $("#engine-summary").textContent = status.modelReady ? "Ready — works without internet" : "Private and subscription-free";
  $("#last-transcript").textContent = status.lastTranscript || "Your latest dictation will appear here after a mic test.";
  $("#test-button").textContent = status.phase === "recording" ? "Stop test" : "Test microphone";
  $$<HTMLElement>("[data-shortcut-capture]").forEach(control => {
    if (control !== shortcutCapture) control.querySelector("span")!.textContent = platformShortcut(config.shortcut.accelerator);
  });
  $$<HTMLButtonElement>("[data-shortcut-mode-value]").forEach(button => {
    const selected = button.dataset.shortcutModeValue === config.shortcut.mode;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  ($("#language") as HTMLSelectElement).value = config.whisper.language;
  ($("#threads") as HTMLInputElement).value = String(config.whisper.threads);
  $$<HTMLInputElement>("[data-voice-commands]").forEach(input => { input.checked = config.voiceCommands; });
  ($("#launch-login") as HTMLInputElement).checked = config.launchAtLogin;
  $("#binary-path").textContent = basename(config.whisper.binaryPath);
  $("#model-path").textContent = basename(config.whisper.modelPath);
  $$<HTMLElement>("[data-vocab-count]").forEach(element => { element.textContent = `${config.vocabulary.length} ${config.vocabulary.length === 1 ? "word" : "words"}`; });
  $("#vocab-list").innerHTML = config.vocabulary.map((word, index) => `<button class="word-chip" data-index="${index}" aria-label="Remove ${escapeHtml(word)}"><span>${escapeHtml(word)}</span><b>×</b></button>`).join("");
  $("#setup-banner").classList.toggle("hidden", status.modelReady);
  $("#accessibility-note").classList.toggle("hidden", status.platform !== "macos" || status.accessibilityReady);
  $("#setup-title").textContent = status.modelReady ? "Echo is ready to listen." : "Let Echo set itself up.";
  $("#setup-description").textContent = status.modelReady
    ? "The speech engine and model are stored on this computer. You can now dictate without an internet connection."
    : "Echo will download a trusted speech engine and an English model. When it finishes, you can disconnect from the internet forever.";
  const setupButton = $("#auto-setup") as HTMLButtonElement;
  setupButton.querySelector("span")!.textContent = status.modelReady ? "Setup complete" : "Set up Echo for me";
  setupButton.disabled = status.modelReady;
  if (status.modelReady) {
    $$<HTMLElement>("[data-setup-step]").forEach(step => step.classList.add("done"));
    $("#setup-progress").classList.remove("hidden");
    $("#setup-progress-label").textContent = "Everything is ready";
    $("#setup-progress-detail").textContent = "Works offline";
    ($("#setup-progress-bar") as HTMLElement).style.width = "100%";
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!);
}

async function save(changes: (config: EchoConfig) => void): Promise<void> {
  const next = structuredClone(current.config);
  changes(next);
  render(await window.echo.saveConfig(next));
}

function showSection(section: string): void {
  activeSection = section;
  $$("[data-section]").forEach(element => element.classList.toggle("active", element.dataset.section === section));
  $$("[data-nav]").forEach(element => element.classList.toggle("active", element.dataset.nav === section));
  $("#section-title").textContent = ({ home: "Good afternoon", dictionary: "Word library", commands: "Voice commands", setup: "Setup" } as Record<string, string>)[section];
  const activePage = $<HTMLElement>(`[data-section="${section}"]`);
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    animate(activePage, { opacity: [0, 1], y: [10, 0] }, { duration: .34, ease: [.22, 1, .36, 1] });
    animate(activePage.querySelectorAll("[data-motion-card]"), { opacity: [0, 1], y: [13, 0], scale: [.985, 1] }, { duration: .38, delay: stagger(.045), ease: [.22, 1, .36, 1] });
  }
}

function renderSetupProgress(progress: SetupProgress): void {
  $("#setup-progress").classList.remove("hidden");
  $("#setup-progress-label").textContent = progress.message;
  $("#setup-progress-detail").textContent = progress.detail;
  ($("#setup-progress-bar") as HTMLElement).style.width = `${progress.percent}%`;
  const runtime = $<HTMLElement>("[data-setup-step='runtime']");
  const model = $<HTMLElement>("[data-setup-step='model']");
  const ready = $<HTMLElement>("[data-setup-step='ready']");
  [runtime, model, ready].forEach(step => step.classList.remove("active"));
  if (progress.stage === "runtime") runtime.classList.add("active");
  if (progress.stage === "model") { runtime.classList.add("done"); model.classList.add("active"); }
  if (progress.stage === "complete") { runtime.classList.add("done"); model.classList.add("done"); ready.classList.add("done", "active"); }
  if (progress.stage === "error") {
    $("#setup-title").textContent = "Setup needs a little help.";
    const button = $("#auto-setup") as HTMLButtonElement;
    button.disabled = false;
    button.querySelector("span")!.textContent = "Try setup again";
  }
}

$$("[data-nav]").forEach(button => button.addEventListener("click", () => showSection(button.dataset.nav!)));
$$("[data-go]").forEach(button => button.addEventListener("click", () => showSection(button.dataset.go!)));

$("#test-button").addEventListener("click", async () => {
  if (current.status.phase === "recording") await window.echo.endTest();
  else await window.echo.beginTest();
});

$("#auto-setup").addEventListener("click", async () => {
  const button = $("#auto-setup") as HTMLButtonElement;
  button.disabled = true;
  button.querySelector("span")!.textContent = "Setting things up…";
  renderSetupProgress({ stage: "runtime", percent: 0, message: "Starting setup…", detail: "Keep Echo open" });
  try {
    render(await window.echo.automaticSetup());
  } catch {
    // The progress channel displays a plain-language error and enables retry.
  }
});

async function endShortcutCapture(restore = true): Promise<void> {
  if (!shortcutCapture) return;
  const control = shortcutCapture;
  shortcutCapture = null;
  control.classList.remove("capturing");
  if (restore) control.querySelector("span")!.textContent = platformShortcut(current.config.shortcut.accelerator);
  $("#shortcut-help").textContent = "Use a key combination, or an F-key such as F8.";
  $("#shortcut-help").classList.remove("error");
  await window.echo.setShortcutCapture(false);
}

$$<HTMLButtonElement>("[data-shortcut-capture]").forEach(control => {
  control.addEventListener("click", async () => {
    if (shortcutCapture === control) return;
    await endShortcutCapture();
    shortcutCapture = control;
    control.classList.add("capturing");
    control.querySelector("span")!.textContent = "Press your shortcut now…";
    $("#shortcut-help").textContent = "Press Escape to cancel.";
    await window.echo.setShortcutCapture(true);
    control.focus();
  });
  control.addEventListener("keydown", async event => {
    if (shortcutCapture !== control) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      await endShortcutCapture();
      return;
    }
    if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) return;
    const parts: string[] = [];
    if (event.ctrlKey) parts.push("Ctrl");
    if (event.shiftKey) parts.push("Shift");
    if (event.altKey) parts.push("Alt");
    if (event.metaKey) parts.push("Meta");
    const key = event.code === "Space" ? "Space" : event.code.replace(/^Key/, "").replace(/^Digit/, "");
    const safeSingleKey = /^F(?:[1-9]|1[0-2])$/.test(key);
    if (parts.length === 0 && !safeSingleKey) {
      $("#shortcut-help").textContent = "Add Ctrl, Shift, Alt, or Windows—or use F1 through F12.";
      $("#shortcut-help").classList.add("error");
      return;
    }
    parts.push(key);
    control.querySelector("span")!.textContent = platformShortcut(parts.join("+"));
    await save(config => { config.shortcut.accelerator = parts.join("+"); });
    await endShortcutCapture(false);
  });
  control.addEventListener("blur", () => {
    setTimeout(() => {
      if (shortcutCapture === control) void endShortcutCapture();
    }, 0);
  });
});

$$<HTMLButtonElement>("[data-shortcut-mode-value]").forEach(button => button.addEventListener("click", () => void save(config => {
  config.shortcut.mode = button.dataset.shortcutModeValue === "hold" ? "hold" : "toggle";
})));
$("#language").addEventListener("change", event => void save(config => { config.whisper.language = (event.target as HTMLSelectElement).value; }));
$("#threads").addEventListener("change", event => void save(config => { config.whisper.threads = Number((event.target as HTMLInputElement).value); }));
$$<HTMLInputElement>("[data-voice-commands]").forEach(input => input.addEventListener("change", event => void save(config => { config.voiceCommands = (event.target as HTMLInputElement).checked; })));
$("#launch-login").addEventListener("change", event => void save(config => { config.launchAtLogin = (event.target as HTMLInputElement).checked; }));

$("#choose-binary").addEventListener("click", async () => {
  const path = await window.echo.chooseFile("binary");
  if (path) await save(config => { config.whisper.binaryPath = path; });
});
$("#choose-model").addEventListener("click", async () => {
  const path = await window.echo.chooseFile("model");
  if (path) await save(config => { config.whisper.modelPath = path; });
});

$("#vocab-form").addEventListener("submit", event => {
  event.preventDefault();
  const input = $("#vocab-input") as HTMLInputElement;
  const value = input.value.trim();
  if (!value) return;
  void save(config => {
    if (!config.vocabulary.some(item => item.toLocaleLowerCase() === value.toLocaleLowerCase())) config.vocabulary.unshift(value);
  });
  input.value = "";
});
$("#vocab-list").addEventListener("click", event => {
  const chip = (event.target as HTMLElement).closest<HTMLElement>("[data-index]");
  if (!chip) return;
  const index = Number(chip.dataset.index);
  void save(config => { config.vocabulary.splice(index, 1); });
});

window.echo.onSnapshot(render);
window.echo.onSetupProgress(renderSetupProgress);
window.echo.getSnapshot().then(snapshot => {
  render(snapshot);
  showSection(activeSection);
});
