# Before You Begin — ICRUSH Browser

Read this setup guide before running or compiling ICRUSH Browser.

---

## 1. Prerequisites Checklist

Before launching the application:

1. **Tor Proxy Daemon**:
   - Ensure a Tor proxy is active and listening on `127.0.0.1:9050` (or `9150`).
   - If Tor is not running, the browser will alert you to launch the daemon before isolated circuits can be assigned.

2. **Google Gemini API Key**:
   - The embedded autonomous navigation agent requires a valid Gemini API key.
   - Get your key from [Google AI Studio](https://aistudio.google.com/).
   - Add it to your `.env` file:
     ```env
     GEMINI_API_KEY=your_key_here
     ```

3. **C++ Build Tools (Native Dependencies)**:
   - This project uses `better-sqlite3` and `keytar` (compiled native C++ Node modules).
   - On Windows: Ensure Visual Studio Build Tools (C++ workload) are installed.
   - On Linux: `sudo apt install build-essential libsecret-1-dev`
   - On macOS: Xcode Command Line Tools (`xcode-select --install`)

---

## 2. Running in Development

```bash
# Clean start with automated port management
npm run dev:clean
```

---

## 3. Packaging & Distribution

To generate standalone installers for Windows, macOS, or Linux:
```bash
npm run dist
```
Check `dist-electron/` for the final binaries.
