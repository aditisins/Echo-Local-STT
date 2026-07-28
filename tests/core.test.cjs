const test = require("node:test");
const assert = require("node:assert/strict");
const { migrateConfig, DEFAULT_CONFIG } = require("../dist/config.js");
const { interpretTranscript } = require("../dist/commands.js");

test("migrates the legacy hotkey without losing safe defaults", () => {
  const migrated = migrateConfig({ version: 1, hotkey: "Ctrl+Alt+K", vocabulary: ["Aditi", 42, ""] });
  assert.equal(migrated.version, 2);
  assert.equal(migrated.shortcut.accelerator, "Ctrl+Alt+K");
  assert.deepEqual(migrated.vocabulary, ["Aditi"]);
  assert.equal(migrated.whisper.language, DEFAULT_CONFIG.whisper.language);
});

test("clamps unsafe numeric config values", () => {
  const migrated = migrateConfig({ whisper: { threads: 1000 }, pasteDelayMs: -5 });
  assert.equal(migrated.whisper.threads, 32);
  assert.equal(migrated.pasteDelayMs, 0);
});

test("preserves the chosen push-to-talk behavior", () => {
  assert.equal(migrateConfig({ shortcut: { accelerator: "F8", mode: "hold" } }).shortcut.mode, "hold");
  assert.equal(migrateConfig({ shortcut: { accelerator: "Ctrl+Space", mode: "toggle" } }).shortcut.mode, "toggle");
});

test("interprets spoken formatting commands locally", () => {
  assert.deepEqual(interpretTranscript("Hello comma new paragraph world period", true), [
    { type: "text", value: "Hello,\n\nworld." }
  ]);
  assert.deepEqual(interpretTranscript("delete that", true), [{ type: "undo" }]);
  assert.deepEqual(interpretTranscript("clear all", true), [{ type: "clear_all" }]);
});

test("leaves transcripts alone when commands are disabled", () => {
  assert.deepEqual(interpretTranscript("new paragraph", false), [{ type: "text", value: "new paragraph" }]);
});
