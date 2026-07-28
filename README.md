# Echo

[![License: MIT](https://img.shields.io/badge/License-MIT-705CF6.svg)](LICENSE)

Echo is a private, offline dictation app for Windows and macOS - A Wispr Flow alternative. A global shortcut starts a small non-focus-stealing overlay, records the microphone, transcribes with local `whisper.cpp`, and inserts the result into the app that already owns the cursor.

## What works in this MVP

- Toggle or push-to-talk global shortcuts, including full modifier combinations
- A visible Activation panel for recording a shortcut and choosing hold-to-talk or press-to-toggle behavior
- Always-on-top recording and transcription overlay that does not steal focus
- Local `whisper-cli` inference with custom model selection
- Metal-compatible whisper.cpp setup on Apple Silicon and optimized CPU inference on Windows
- Personal vocabulary passed to Whisper as an initial prompt
- Local voice commands: new paragraph, new line, punctuation, and delete/undo that
- Versioned, type-safe JSON config with automatic v1-to-v2 migration and atomic saves
- Tray operation, launch at login, local microphone testing, and clipboard restoration
- One-click Windows setup that downloads and verifies the official runtime and recommended model
- Motion-powered page transitions and an accessible guided setup experience

## Run Echo

Requirements: Node.js 20+ and a local `whisper.cpp` build.

```powershell
npm install
npm run dev
```

On first launch, open **Setup** and click **Set up Echo for me**. Echo downloads the official Windows runtime and the recommended English model, verifies both, and configures their paths automatically.

If you are offline or prefer to choose files yourself, open **Advanced or offline setup** and choose:

1. The `whisper-cli` executable from a release or local whisper.cpp build.
2. A GGML model such as `ggml-base.en.bin`.

After those files are present, Echo performs dictation without an internet connection or subscription.

## Build whisper.cpp

### macOS (Apple Silicon with Metal)

```bash
git clone https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp
cmake -B build -DGGML_METAL=ON -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release -j
./models/download-ggml-model.sh base.en
```

Choose `build/bin/whisper-cli` and `models/ggml-base.en.bin` in Echo. macOS will ask for Microphone and Accessibility access; both are required for global dictation.

### Windows

```powershell
git clone https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp
cmake -B build -A x64
cmake --build build --config Release -j
```

Choose `build/bin/Release/whisper-cli.exe` and a downloaded GGML model in Echo. No cloud API key is used.

## Package installers

Place platform-specific `whisper-cli` builds under:

- `resources/bin/win32/x64/whisper-cli.exe`
- `resources/bin/darwin/arm64/whisper-cli`
- `resources/bin/darwin/x64/whisper-cli`

Then run `npm run dist` on each target OS. Native desktop apps must be packaged on their target platform; a CI matrix can produce the Windows installer and macOS DMG.

## Privacy notes

Microphone audio is held in memory, written to a temporary WAV only for local transcription, and deleted immediately afterward. Config and vocabulary remain in Electron's per-user application data folder. Echo has no analytics, sign-in, or network runtime dependency.

## License

Echo is available under the [MIT License](LICENSE).
