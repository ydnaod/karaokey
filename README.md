# karaokey

A lightweight in-browser karaoke app. Queue YouTube videos, change the key (pitch) in real time, and play through your laptop into a TV or speaker.

> 📺 **Prefer to follow along with a video?** Watch the [full setup & usage tutorial on YouTube](https://www.youtube.com/watch?v=pTq55FWx9PA).

---

## ⚠️ Before you run anything — is this safe?

**You should only ever run software from people you trust.** How do you know you can trust this project? You don't! Running a setup script from the internet is *not* a normal, automatically-safe thing to do — so here's how to check it for yourself first:

- **Ask an AI chatbot to review it.** Send the `setup.command` file to your preferred AI chatbot (ChatGPT, Claude, Gemini, etc.) and ask it to read the file and tell you whether it's safe to run. You can also hand it the other files in the folder so it can see exactly what the script installs. Ask it to be **extra thorough** and flag anything malicious or any security concern.
- **Be careful with scripts and commands from strangers on the internet.** This is true for *any* script, not just this one — take a minute to verify before you run. 🙂
- **More technically savvy?** You don't have to run either script. Clone the repo, install the dependencies yourself, and run the servers locally — see [Not on a Mac?](#not-on-a-mac) and [For developers](#for-developers) below.

---

## Quick install on a Mac (for everyone, not just programmers)

This works on any modern Mac, both Intel and Apple Silicon (M1/M2/M3/M4).

### 1. Download the project

1. On this page, click the green **Code** button → **Download ZIP**.
2. Open your **Downloads** folder.
3. **Double-click `karaokey-main.zip`** to unzip it. You'll get a folder called `karaokey-main`.
4. Drag that folder somewhere easy to find — your **Desktop** is fine.

### 2. Run the setup (one time only)

Recent versions of macOS block scripts downloaded from the internet if you
double-click them (you'll see *"Apple could not verify…"*). To get around this,
you run the setup through the Terminal **once** — after that, starting the app
is a normal double-click.

1. Open the **Terminal** app: press `Cmd` + `Space`, type `Terminal`, press **Enter**.
2. In the Terminal window, type the word `bash` followed by a single space.
   **Do not press Enter yet.**
3. Open the `karaokey-main` folder in Finder. **Drag the `setup.command` file
   onto the Terminal window** and let go. Its location gets filled in for you.
4. Now press **Enter**. The setup starts installing things. **This can take
   5–15 minutes** on a fresh Mac.
5. You may be asked for your Mac password — type it and press Enter (you won't
   see the characters as you type — that's normal).
6. When you see **"All set!"** at the bottom, you're done. Close the window.

What this installs:
- Apple's developer tools (needed by everything else)
- Homebrew (the standard Mac package manager)
- Node.js (runs the app)
- yt-dlp + ffmpeg (download audio from YouTube)
- The karaokey app's own dependencies

### 3. Start the app

1. In the `karaokey-main` folder, **double-click `start.command`**.
   (The setup step above unlocked this file, so it just works now.)
2. After a few seconds, your web browser will open to the karaokey app.
3. **Leave the Terminal window open** while you use the app.

### 4. Stop the app

- Close the Terminal window, or click in it and press **Ctrl + C**.

---

## How to use it

1. **Host:** click *Create Room*. You get a 4-letter room code and a QR code.
2. **Friends:** scan the QR code (or go to the URL shown) and enter their name to join.
3. Anyone in the room can add YouTube songs to the queue.
4. Only the **host** controls playback (play/pause/skip) and the **key** (pitch).
5. The host's laptop plays the audio — plug it into your TV or speaker.

---

## Tips

- **Update yt-dlp every few weeks.** YouTube changes its format occasionally and old yt-dlp versions stop working. Just re-run `setup.command` — it will upgrade everything that's outdated.
- **Use Chrome or Safari** for best results. Pitch shifting uses a modern Web Audio feature that works in all major browsers, but Chrome and Safari are best tested.
- **Connect your laptop to the speaker before starting the app.** If you switch audio outputs mid-song, you may need to refresh.

---

## Troubleshooting

**"Apple could not verify…" when opening a `.command` file** → This is expected for `setup.command` — don't double-click it. Run it through the Terminal as described in *Run the setup* above (`bash`, then drag the file in, then Enter). `start.command` is unlocked automatically once setup finishes.

**Re-running `setup.command` later** → Same as the first time: run it through the Terminal with the `bash` + drag method.

**Songs fail to load / "Failed to extract"** → YouTube probably changed something. Re-run `setup.command` to upgrade yt-dlp.

**The browser doesn't open automatically** → Open `http://localhost:5173/` in any browser.

**Port already in use** → Another app is using port 3001 or 5173. Quit the other app, or restart your Mac.

**Friends can't join the room** → Your laptop and your friends need to be on the **same Wi-Fi network**.

---

## Not on a Mac?

The setup script only handles macOS. On Linux or Windows, you'll need to manually install:

- Node.js 20+ (https://nodejs.org)
- yt-dlp (https://github.com/yt-dlp/yt-dlp#installation)
- ffmpeg (https://ffmpeg.org/download.html)

Then in a terminal, from inside this folder:

```bash
npm install
npm run dev
```

Open `http://localhost:5173/` in your browser.

---

## For developers

Architecture, socket events, and technical details are in [CLAUDE.md](CLAUDE.md).
