# DSH Skin

English | [中文](README.zh-CN.md)

A visual customization plugin for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web interface. It provides localized wallpaper backgrounds, theme management, conversation readability controls, and a favorites-based slideshow for the chat area — with all settings persisted across page refreshes and process restarts.

![License](https://img.shields.io/badge/license-MIT-blue)
![DSH](https://img.shields.io/badge/dsh-0.1.0--rc.6-gray)
![Platform](https://img.shields.io/badge/platform-Windows-lightgray)

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Persistence](#persistence)
- [Compatibility](#compatibility)
- [Development](#development)
- [Uninstall](#uninstall)
- [License](#license)

## Features

- **Wallpapers** — Use images from any local folder as the chat-area background. Supports drag-to-pan, height-based proportional zoom, and three fit modes (`cover`, `contain`, `custom`). Per-image adjustments are remembered individually.
- **Favorites & slideshow** — Favorite images together with their adjusted settings; settings stay in sync when you re-tune an image. Play favorites as a slideshow with intervals from 3 seconds to 1 hour. Clearing the favorites list requires confirmation.
- **Theming** — Auto-extract a theme from the active wallpaper, or choose from built-in presets and a custom color picker. Independent controls for tint intensity, background veil opacity, input-surface opacity, and conversation-bubble opacity.
- **Readability** — Conversation bubbles use semi-transparent contrast colors; ambient UI text (tool calls, statistics, artifact rows) uses high-contrast colors with theme-aware text shadows.
- **Adaptive preview** — A live preview that mirrors the actual page geometry (sidebar, chat column, details column), re-measured continuously and multi-monitor aware.
- **Server-side thumbnails** — Thumbnails are generated on the host (PowerShell / System.Drawing) and disk-cached, keeping the settings page responsive on large folders.
- **Persistence** — All preferences are stored in a JSON state file and restored on startup.

## Installation

### Prerequisites

- Windows
- A running [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web profile (see [Compatibility](#compatibility) for version notes)
- Git (only for the GitHub-hosted install below)

### Official install (recommended)

dsh-skin is packaged as a standard DSH bundle. Install it with the official CLI:

```sh
dsh plugin --profile web add github:HuggingFries/dsh-skin
```

The command installs the package with pnpm and automatically enables it by adding the `dsh.bundle` declaration to the profile's bundles layer.

> **One-time prerequisite for dsh `0.1.0-rc.6`**: this version's `dsh plugin` simply forwards to pnpm, which refuses to add dependencies at the workspace root. Add a `.npmrc` file to the profile directory (`%USERPROFILE%\.dsh\profiles\web\.npmrc`) with the following line, then run the install command:
>
> ```ini
> ignore-workspace-root-check=true
> ```

After installation, restart `dsh web`, open the plugin's settings section, and select an image folder.

To update the plugin later, run the same install command again (it fetches the latest commit from the repository). To uninstall, run the symmetric command and restart:

```sh
dsh plugin --profile web remove dsh-skin
```

### Alternative: install script

From the repository root, run `.\install.ps1` — it tries the official `dsh plugin` command first (writing the `.npmrc` prerequisite automatically) and falls back to a manual copy-and-register install when the CLI is unavailable. Idempotent, safe to re-run. Uninstall with `.\uninstall.ps1`.

### Manual install

See [INSTALL.md](INSTALL.md) for the step-by-step manual method, data migration, and troubleshooting.

## Usage

Open **Settings** in the harness sidebar and locate the plugin section. From there you can:

- Pick the wallpaper folder and browse images (filmstrip, favorites strip, dropdown).
- Adjust position and scale for the current image; changes apply to the page immediately.
- Favorite images, manage the favorites list, and control slideshow playback and interval.
- Configure the theme (auto-detect / presets / custom color) and the four opacity controls.
- Use the live preview to fine-tune the composition before closing the panel.

## Persistence

- **State file** — `.dsh-skin-state.json`, resolved relative to the working directory of the `dsh` process. Contains favorites, per-image settings, and theme preferences. Deleting it resets the plugin to defaults.
- **Thumbnail cache** — `.dsh-skin-thumbs/`, regenerated on demand. Safe to delete.
- No other files are written outside the working directory.

## Compatibility

- Background and theming functionality relies on stable theme tokens and remains functional across minor harness versions.
- Certain UI styling targets hashed class names from the shipped frontend build (`0.1.0-rc.6`). On other harness versions these rules may silently no-op; core functionality is unaffected.

## Development

- Repository layout: `lib/index.js` (host half: HTTP API, image and thumbnail routes), `lib/client.js` (browser half: settings UI, theme engine, preview), `package.json` (dual-face package declaration).
- The host half exposes a small JSON API (`/dsh-skin-api/*`) consumed by the client half.
- Validate changes with `node --check` on both files; the client bundle is served from disk, so client-only changes apply after a page refresh, while host changes require a harness restart.

## Uninstall

1. Remove `%USERPROFILE%\.dsh\profiles\web\node_modules\dsh-skin`.
2. Remove the `- insert:` block from `cordis.patch.yml`.
3. Restart `dsh web`.

## License

[MIT](LICENSE) © 2026 HuggingFries
