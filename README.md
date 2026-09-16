# ICRUSH Sovereign Web Browser

> An AI-first sovereign web browser engineered for private, autonomous navigation with native Tor circuit isolation, zero-leak WebRTC shields, and an embedded 5-step Gemini autonomous agent.

---

## Overview

**ICRUSH Browser** is a desktop browsing environment engineered by **NIGHTMARE PROJECTS**. Built on Electron 28 and React 18, it combines strict network privacy (per-tab Tor circuit routing and anti-fingerprinting shields) with native agentic automation powered by the Google Gemini API.

### Core Capabilities

- **Isolated Tor Circuit Routing**: Per-tab SOCKS5 proxy routing through local Tor daemons (`127.0.0.1:9050`), allowing separate circuit identities across tabs.
- **Zero-Leak Privacy Shields**: Ghostery ad-blocking engine, WebRTC ICE leak prevention, canvas fingerprint noise spoofing, and strict DNS over HTTPS.
- **5-Step Autonomous Navigation Agent**: An on-device autonomous loop leveraging Gemini multimodal reasoning to parse DOM states, synthesize intent, execute multi-step web tasks, and extract data autonomously.
- **Sovereign Local Data Store**: Encrypted local SQLite storage (`better-sqlite3`) and Keytar OS keychain credential storage. Zero corporate telemetry.

---

## Tech Stack

- **Runtime**: Electron 28, Node.js 20
- **Frontend**: React 18, Vite 5, Tailwind CSS
- **AI Core**: `@google/generative-ai` (Gemini API)
- **Privacy & Storage**: `@ghostery/adblocker-electron`, `better-sqlite3`, `keytar`

---

## Getting Started

### Prerequisites

1. **Node.js**: v20.0.0 or higher
2. **Tor Daemon**:
   - Windows: Tor Expert Bundle running on `127.0.0.1:9050`
   - Linux: `sudo apt install tor && sudo systemctl start tor`
   - macOS: `brew install tor && brew services start tor`
3. **Gemini API Key**: Obtain a key from [Google AI Studio](https://aistudio.google.com/)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/gemini-browser.git
   cd gemini-browser
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and enter your `GEMINI_API_KEY`.

4. Start development mode:
   ```bash
   npm run dev:clean
   ```

5. Build standalone desktop binaries:
   ```bash
   npm run dist
   ```
   Binaries will be output to `dist-electron/` (Windows `.exe`, macOS `.dmg`, or Linux `.AppImage`).

---

## Security & Sovereignty

- ICRUSH Browser is built on the principle of complete user sovereignty.
- Browsing sessions, cookies, and local credentials remain strictly on your machine.
- AI navigation requests only send user-authorized DOM snapshots directly to your personal Gemini API endpoint.

---

## License

Copyright © 2026 NIGHTMARE PROJECTS. All rights reserved.
