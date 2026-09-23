<div align="center">

<img src="https://capsule-render.vercel.app/api?type=hollow&color=0:2cb67d,50:7f5af0,100:0d1117&height=140&section=header&text=Aurora&fontSize=38&fontColor=7f5af0&desc=a%20complete%20operating%20system%20running%20in%20your%20browser&descSize=15&descAlignY=72" width="100%" />

![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)
![npm](https://img.shields.io/badge/npm-aurora--os-blue?style=flat-square&logo=nodedotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript)
![Docker](https://img.shields.io/badge/Docker-GHCR-2496ED?style=flat-square&logo=docker)
![Tests](https://img.shields.io/badge/Tests-Passing-brightgreen?style=flat-square)

**A complete operating system running in your browser.**

[![npm](https://img.shields.io/npm/v/aurora-os?style=for-the-badge&logo=nodedotjs)](https://www.npmjs.com/package/aurora-os)
[![GHCR](https://img.shields.io/badge/GHCR-image-2496ED?style=for-the-badge&logo=docker)](https://github.com/BartoszOsiej/Aurora/pkgs/container/aurora-os)
[![Release](https://img.shields.io/badge/release-live-8A2BE2?style=for-the-badge&logo=github)](https://github.com/BartoszOsiej/Aurora/releases)
![TypeScript](https://img.shields.io/badge/TypeScript-zero%20deps-3178C6?style=for-the-badge&logo=typescript)
[![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)](LICENSE)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/BartoszOsiej/Aurora/badge)](https://scorecard.dev/viewer/?uri=github.com/BartoszOsiej/Aurora)

*A from-scratch desktop environment — window manager, virtual file system,
shell, and eight applications — entirely in TypeScript with **zero runtime
dependencies**. No frameworks, no bundler at runtime, no server.*

> 🇵🇱 [Wersja polska](README.pl.md) · [Documentation](https://bartoszosiej.github.io/Docs/projects/aurora-os/) · [Live Demo](https://bartoszosiej.github.io/Aurora/)

> *"Your browser is now your computer."*

</div>

## Table of Contents

- [Demo](#-demo)
- [Features](#features)
- [Quick Start](#quick-start)
- [First Steps](#first-steps-inside-the-os)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Tests](#tests)
- [Docker](#docker)
- [License](#license)

---

## 📺 Demo



<!-- VHS auto-rendered — run: vhs demos/aurora.tape -->



![AURORA OS Demo](assets/aurora-demo.gif)



## Features

| Layer | What you get |
|---|---|
| 🧠 **Kernel** | Animated boot sequence, typed EventBus, process table, settings, localStorage persistence |
| 🪟 **Window manager** | Drag, resize (8 handles), minimize/maximize, cascading placement, glassmorphism chrome |
| 📂 **Virtual filesystem** | POSIX-inspired: `ls`/`cd`/`cat`/`mkdir -p`/`cp`/`mv`/`rm -r`/`grep`/`tree`, error codes |
| ⌨️ **Terminal** | 36+ commands, command history, Tab completion, output redirection, ANSI colors |
| 📱 **Apps** | Files, Terminal, Editor, Calculator, Paint (save PNG), System Monitor, Settings, About |
| 🎨 **Theming** | 5 themes (Aurora, Midnight, Ember, Forest, Daylight) + 5 animated wallpapers |
| 🔊 **Audio** | Fully procedural WebAudio — boot chime, UI clicks, window swooshes. No audio files. |

---

## Quick Start

```bash
git clone https://github.com/BartoszOsiej/Aurora.git
cd Aurora
npm install          # installs esbuild (dev-only build tool)
npm run build        # bundles to dist/
npm run serve        # http://localhost:8080
```

<details>
<summary><b>🖱️ First steps inside the OS</b></summary>

| Command | What it does |
|---|---|
| `npm run build` | esbuild bundle → `dist/main.js`, copy CSS |
| `npm run typecheck` | strict `tsc` type checking |
| `npm test` | core-logic test harness (EventBus, FS, shell) |
| `npm run serve` | static server for `index.html` |

---

## First Steps Inside the OS

1. Double-click **Terminal** on the desktop (or use the Start menu ◈)
2. Type `help` to list all 36+ commands
3. `neofetch` for the system banner, `fortune` for wisdom
4. Create files: `echo hello > hello.txt`, then `cat hello.txt`
5. `open editor hello.txt` to edit graphically
6. Right-click the desktop: new folder, new file, wallpaper, lock screen
7. `ps` + `kill <pid>` to manage processes
8. Press **Ctrl+Alt+L** to lock the system

---

## Architecture

```
┌─────────────────────────── Browser ───────────────────────────┐
│  boot() ──► boot screen ──► desktop shell                      │
│                                                               │
│  ┌────────────┐   ┌─────────────┐   ┌───────────────────┐     │
│  │ WindowMgr  │   │ ProcessMgr  │   │    AppRegistry    │     │
│  │ drag/resize│   │ pid/ps/kill │   │ 8 apps registered │     │
│  └─────┬──────┘   └──────┬──────┘   └────────┬──────────┘     │
│        └─────────────────┼───────────────────┘                 │
│                     ┌────▼─────┐                         ┌─────▼─────┐
│                     │ EventBus │◄── every module talks   │ FileSystem│
│                     └────┬─────┘    only through events  │ +persist  │
│                          │                               └───────────┘
│                    ┌─────▼──────┐
│                    │   shell    │  Terminal ⇄ commands.ts ⇄ FileSystem
│                    └────────────┘
└───────────────────────────────────────────────────────────────────┘
```

**Design rules:**

- **No direct imports between subsystems** — everything communicates over the typed `EventBus`
- **Pure core, thin UI** — the shell interpreter, filesystem and event bus run without a DOM
- **Zero runtime dependencies** — no React, no Redux, no bundler in the output

---

## Project Structure

```
aurora-os/
├── index.html              # Boot screen + desktop shell DOM
├── src/
│   ├── main.ts             # Kernel entry
│   ├── style.css           # Complete OS stylesheet
│   ├── core/               # EventBus, ProcessManager, WindowManager, AppRegistry
│   ├── fs/                 # Virtual file system
│   ├── term/               # Interactive shell (36+ commands)
│   ├── apps/               # Terminal, Files, Editor, Calculator, Paint, Monitor, Settings, About
│   └── sound/              # Procedural WebAudio sound effects
├── tests/                  # Core-logic test harness (no DOM)
└── scripts/                # Build helpers
```

---

## Tests

```bash
npm test        # EventBus, FileSystem, shell interpreter
npm run typecheck
```

Covers EventBus (emit/once/unsubscribe/error isolation), FileSystem (path
resolution, CRUD, error codes, recursive ops) and the shell interpreter
(echo, cd/pwd, ls, redirection, cat, mkdir, touch, wc).

---

## Docker

```bash
# Build
docker build -t aurora-os .

# Run
docker run -p 8080:80 aurora-os

# Or from GHCR
docker pull ghcr.io/bartoszosiej/aurora-os:latest
docker run -p 8080:80 ghcr.io/bartoszosiej/aurora-os:latest
```

---

## License

MIT — do whatever you want with it.

---
