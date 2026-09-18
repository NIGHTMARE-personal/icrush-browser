# ICRUSH BROWSER
### Sovereign Cybernetic Desktop Web Runtime & Local Multi-Agent Browser

[![Architecture](https://img.shields.io/badge/Architecture-Electron_28_%7C_React_18_%7C_TypeScript_5-d4af37?style=for-the-badge)](https://github.com/NIGHTMARE-personal/icrush-browser)
[![Local AI](https://img.shields.io/badge/Local_AI-Ollama_Native_(Zero_Cloud_Default)-10b981?style=for-the-badge)](https://ollama.com)
[![Privacy Shield](https://img.shields.io/badge/Privacy-Tor_Isolated_Circuits_%7C_WebRTC_Shielded-6366f1?style=for-the-badge)](https://torproject.org)
[![Telemetry](https://img.shields.io/badge/Telemetry-ZERO_(100%25_Offline_Capable)-rose?style=for-the-badge)](https://github.com/NIGHTMARE-personal/icrush-browser)
[![Studio](https://img.shields.io/badge/Engineered_By-NIGHTMARE--PROJECTS-amber?style=for-the-badge)](https://github.com/NIGHTMARE-personal)

---

## 👁️ Executive Architectural Vision

Commercial web browsers have devolved into corporate surveillance conduits—harvesting browsing telemetry, syncing credentials to external ad networks, and enforcing cloud dependence.

**ICRUSH Browser** is engineered from bare metal up as an anti-surveillance, sovereign desktop browsing runtime:
- **Local-First Neural Intelligence**: Powered by an on-device model router interfacing directly with **Ollama** (`127.0.0.1:11434`). Runs models like `qwen2.5:3b`, `llama3.2:3b`, and `qwen2.5-coder:7b` completely offline. No silent cloud fallback.
- **Per-Tab Tor Circuit Isolation**: Every tab can operate on an independent SOCKS5 Tor circuit with distinct exit nodes, preventing cross-origin session profiling.
- **Hardware-Level Fingerprint Neutralization**: Spoofs canvas fingerprints, injects audio buffer entropy, blocks WebRTC ICE leak vectors, and enforces Quad9 / Cloudflare DNS-over-HTTPS.
- **Autonomous Multi-Agent DOM Engine**: An embedded 5-step recursive agent framework capable of autonomous web exploration, form automation, research synthesis, and audited task execution.
- **Zero Cloud Footprint**: Passwords, history, bookmarks, and agent state live in an encrypted local SQLite database (`better-sqlite3`) backed by OS hardware keychains (`keytar`).

---

## ⚡ Core Capability Matrix

```
+-----------------------------------------------------------------------------------+
|                                  ICRUSH BROWSER                                   |
|                        Sovereign Cybernetic Web Platform                          |
+-----------------------------------------------------------------------------------+
|  [ LOCAL AI ROUTER ]    [ STEALTH CIRCUITS ]    [ AGENT SANDBOX ]   [ WORKSPACE ] |
|  - Ollama Engine        - Tor SOCKS5 Isolation  - 5-Step DOM Loop   - Mind Map    |
|  - Qwen / Llama Local   - Anti-Fingerprinting   - Audit Ledger      - Pomodoro    |
|  - Zero-Cloud Default   - WebRTC Leak Shield    - Sub-Agent Pool    - Sleep Tabs  |
+-----------------------------------------------------------------------------------+
```

### 1. 🧠 Local-First Model Router (Ollama Core)
- **Zero-Cloud Invariant**: Ollama is the permanent default reasoning provider. The browser never pings external cloud endpoints without explicit, in-memory per-session user consent.
- **Intelligent Task Dispatching**:
  - **Chat & Tab Summaries**: Dispatched to lightweight local models (`qwen2.5:3b`, `llama3.2:3b`, `phi3:3.8b`).
  - **DOM Parsing & Code Generation**: Handled by specialized coding models (`qwen2.5-coder:7b`, `deepseek-coder:6.7b`).
  - **Visual Understanding**: Interfaces with multimodal models (`llava:7b`, `moondream:1.8b`).
- **Auto-Discovery**: Interrogates local port `11434` on launch, detects installed parameter sizes, and populates the model switch instantly.

### 2. 🛡️ Tor Circuit & Network Cloaking Engine
- **Independent Tab Personas**: Allocate dedicated Tor circuits to individual tabs. One tab exits via Zurich, another via Reykjavik, another via Frankfurt.
- **Zero-Leak WebRTC Shield**: Hardware network adapter inspection and ICE candidate discovery are completely suppressed.
- **Canvas & WebGL Jitter**: Introduces undetectable noise into HTML5 Canvas readbacks to poison browser fingerprint hashes.
- **Ghostery Adblock Core**: Native declarative network blocking intercepts telemetry trackers, fingerprinters, and ad scripts before execution.

### 3. 🤖 Autonomous Multi-Agent DOM Engine
- **Recursive Action Cycle**: Perceive -> Plan -> Act -> Verify -> Memory Store.
- **DOM Semantic Tree**: Translates raw HTML trees into compressed multimodal schemas optimized for LLM token budgets.
- **Safety Policy & Audit Ledger**: Every click, form entry, or navigation triggered by an agent is validated against safe boundary policies and written to an immutable audit ledger.
- **Undo/Redo State Machine**: Roll back agent browser actions with full session state preservation.

### 4. 🗂️ Cybernetic Workspace & Memory Optimization
- **Visual Tab Mind Map**: View, group, and manipulate tabs as nodes on an interactive infinite canvas.
- **Tab Hibernation Engine**: Automatically drops DOM memory allocations for idle tabs while preserving scroll position and session cookies.
- **Encrypted Local Vault**: Credentials and sessions encrypted with AES-256 via SQLite and system keychain.

---

## 🖥️ System & Hardware Requirements

| Metric | Minimum (Light Browsing) | Recommended (Local AI Agent) | Power / Workstation Tier |
| :--- | :--- | :--- | :--- |
| **Operating System** | Windows 10/11 (64-bit), macOS 12+, Ubuntu 22.04+ | Windows 11, macOS (Apple Silicon M1-M4), Linux | Windows 11 / Linux (CUDA) |
| **Processor (CPU)** | 4 Cores (2.0 GHz+) | 6–8 Cores (Intel i5/i7, AMD Ryzen 5/7, Apple Silicon) | 8+ Cores (Ryzen 7/9, Intel i7/i9, M-Max) |
| **Memory (RAM)** | 8 GB | 16 GB | 32 GB+ |
| **Graphics (GPU)** | Integrated Graphics | 4 GB VRAM (accelerates 3B models) | 8 GB+ VRAM (NVIDIA RTX / Unified Memory) |
| **Disk Storage** | 2 GB free disk space | 10 GB SSD (accommodates Ollama models) | 25 GB+ NVMe SSD |
| **Local Daemons** | None | Ollama (`127.0.0.1:11434`) + Tor (`127.0.0.1:9050`) | Full Tor Expert Bundle + Ollama |

---

## 🚀 Quick Start Guide

### Step 1: Pre-requisites
Ensure **Node.js 20+** is installed on your system.

Install **Ollama** from [ollama.com](https://ollama.com):
```bash
# Verify Ollama is installed
ollama --version

# Pull the primary high-speed local model (~2.0 GB)
ollama pull qwen2.5:3b

# Pull optional coding & DOM synthesis model (~4.5 GB)
ollama pull qwen2.5-coder:7b
```

*(Optional)* Start a local **Tor daemon** listening on port `9050` for stealth circuit routing.

### Step 2: Clone & Install
```bash
# Clone the sovereign repository
git clone https://github.com/NIGHTMARE-personal/icrush-browser.git
cd icrush-browser

# Install dependencies (requires C++ build tools for SQLite and Keytar)
npm install
```

### Step 3: Configure Environment
```bash
cp .env.example .env
```
*Note: You do not need any cloud API keys to use ICRUSH Browser. The local Ollama router will function 100% offline out of the box.*

### Step 4: Run Application
```bash
# Clean dev launch with automated port management
npm run dev:clean
```

### Step 5: Package Standalone Binaries
```bash
# Compiles Vite renderer, Electron main process, and standalone installer
npm run dist
```
Find your compiled binaries inside `dist-electron/` (`.exe` on Windows, `.dmg` on macOS, `.AppImage` on Linux).

---

## 🔒 Security Invariants & Sovereignty Guarantees

1. **Zero Phone-Home**: ICRUSH does not report telemetry, crashes, user behavior, or search queries to any corporate server.
2. **Local Keys At Rest**: Any external keys provided for optional cloud providers are encrypted via Electron `safeStorage` (Windows DPAPI, macOS Keychain, Linux Secret Service).
3. **No Phantom Traffic**: Network traffic is strictly confined to user navigation and explicitly enabled Tor socks proxying.

---

## 📜 Authorship & Governance

- **Lead Architect & Creator**: **NIGHTMARE**
- **Studio**: **NIGHTMARE-PROJECTS**
- **Repository**: [https://github.com/NIGHTMARE-personal/icrush-browser](https://github.com/NIGHTMARE-personal/icrush-browser)
- **Direct Download (.ZIP)**: [https://github.com/NIGHTMARE-personal/icrush-browser/archive/refs/heads/main.zip](https://github.com/NIGHTMARE-personal/icrush-browser/archive/refs/heads/main.zip)

Copyright © 2026 NIGHTMARE PROJECTS. All rights reserved.
