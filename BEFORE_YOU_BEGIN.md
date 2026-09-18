# Before You Begin — ICRUSH Browser

Read this pre-flight operator guide before launching or compiling **ICRUSH Browser**.

---

## 1. System Requirements & Hardware Checklist

| Metric | Minimum (Standard Web) | Recommended (Local AI Agent) | Power / Workstation Tier |
| :--- | :--- | :--- | :--- |
| **Operating System** | Windows 10/11 (64-bit), macOS 12+, Ubuntu 22.04+ | Windows 11, macOS (Apple Silicon), Linux | Windows 11 / Linux (CUDA-enabled) |
| **Processor (CPU)** | 4 Cores (2.0 GHz+) | 6–8 Cores (Intel Core i5/i7, AMD Ryzen 5/7, M1/M2/M3) | 8+ Cores (Ryzen 7/9, Intel i7/i9, M2/M3 Max) |
| **System Memory (RAM)**| 8 GB | 16 GB | 32 GB+ |
| **Graphics (GPU)** | Integrated Graphics | 4 GB VRAM (or Apple Silicon Unified Memory) | 8 GB+ VRAM (NVIDIA RTX with CUDA support) |
| **Disk Space** | 2 GB free space | 10 GB free space (accommodates 3B/7B Ollama weights)| 25 GB+ NVMe SSD |
| **Local Daemons** | None | Ollama (`127.0.0.1:11434`) + Tor (`127.0.0.1:9050`) | Ollama + Tor Expert Bundle |

---

## 2. Local AI Engine Setup (Ollama)

ICRUSH Browser prioritizes **100% on-device local intelligence**. No browsing telemetry or queries leave your machine by default.

### Step 1: Install Ollama
- **Windows / macOS / Linux**: Download from [ollama.com](https://ollama.com/download) or run:
  ```bash
  # Linux / macOS
  curl -fsSL https://ollama.com/install.sh | sh
  ```

### Step 2: Pull Recommended Local Models
Run the following in your terminal to cache the default high-efficiency neural weights:

```bash
# General Chat, Tab Summarization & Navigation (Fast & Lightweight - ~2.0 GB)
ollama pull qwen2.5:3b

# Alternative Compact General Model (~2.0 GB)
ollama pull llama3.2:3b

# Autonomous Code & DOM Extraction (~4.5 GB)
ollama pull qwen2.5-coder:7b
```

### Step 3: Verify Local Ollama Daemon
Ensure Ollama is running and responding locally:
```bash
curl http://127.0.0.1:11434/api/tags
```
ICRUSH Browser will automatically discover all locally installed models on launch.

---

## 3. Tor Network Proxy Setup (Optional but Recommended)

For per-tab circuit isolation and anonymous routing:
1. **Windows**: Install the Tor Expert Bundle or Tor Browser. Ensure Tor is running and listening on SOCKS5 port `127.0.0.1:9050` (or `9150`).
2. **Linux**:
   ```bash
   sudo apt update && sudo apt install tor
   sudo systemctl enable --now tor
   ```
3. **macOS**:
   ```bash
   brew install tor
   brew services start tor
   ```
*Note: If Tor is inactive, ICRUSH will alert you and route tabs through direct local interface until the Tor daemon is detected.*

---

## 4. Native C++ Build Tools (Required for npm install)

This application compiles native C++ bindings for encrypted SQLite storage (`better-sqlite3`) and OS keychain security (`keytar`).
- **Windows**: Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the **"Desktop development with C++"** workload.
- **Linux**:
  ```bash
  sudo apt install -y build-essential libsecret-1-dev python3
  ```
- **macOS**:
  ```bash
  xcode-select --install
  ```

---

## 5. Quick Start Commands

```bash
# 1. Clone sovereign repository
git clone https://github.com/NIGHTMARE-personal/icrush-browser.git
cd icrush-browser

# 2. Install dependencies
npm install

# 3. Initialize environment variables
cp .env.example .env

# 4. Run development instance (cleans ports and starts Vite + Electron)
npm run dev:clean

# 5. Compile standalone desktop binary
npm run dist
```

---

## 6. Architecture & Governance

- **Project Lead & Architect**: **NIGHTMARE**
- **Studio**: **NIGHTMARE-PROJECTS**
- **Telemetry**: Absolute zero. No analytics, no phone-home, no corporate trackers.
