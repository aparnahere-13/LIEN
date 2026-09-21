# LIEN

**Real-time multilingual subtitles.**

LIEN is a browser-based student project that listens to your voice, shows live subtitles of what you say, and translates each finished sentence into another language. It is built with plain HTML, CSS and JavaScript, uses the browser's built-in Web Speech API for speech recognition, and the free MyMemory API for translation. There is nothing to install and no API key to set up.

> **Note:** LIEN is a learning project that combines browser speech recognition with a public translation API. It is not a production-ready AI system, and its accuracy depends on the browser, the microphone, and the free translation service.

## Features

- Choose a spoken (source) language and a translation (target) language
- Swap the two languages with one click
- Start and stop listening with one button
- Live subtitles of your speech while you talk (interim results)
- Each finished sentence is translated and shown as a large subtitle
- Session history with timestamps and language pairs
- Download the session as a `.txt` file
- Clear the session at any time
- Clear status indicator (microphone off / waiting / listening / error)
- Friendly error messages for microphone, speech and translation problems
- Automatic, safe restart if the browser stops listening unexpectedly
- Responsive dark interface with keyboard focus styles and accessible labels

**Supported languages:** English, Hindi, Spanish, French, German, Japanese, Korean (any combination as source and target).

## Technology used

| Part | Technology |
| --- | --- |
| Structure | HTML5 (semantic elements) |
| Styling | CSS3 (custom properties, grid, flexbox, media queries) |
| Logic | Vanilla JavaScript (no frameworks, no build step) |
| Speech-to-text | Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) |
| Translation | [MyMemory Translation API](https://mymemory.translated.net/doc/spec.php) (free demo endpoint, no key) |

## How the application works

1. You pick the language you will speak and the language you want subtitles in.
2. You click **Start Translating** and allow microphone access when the browser asks.
3. The Web Speech API turns your speech into text. While you are still talking, the text appears in the **Original speech** panel as a dimmed live subtitle.
4. When the browser decides a sentence is finished (a *final* result), LIEN sends it to the MyMemory API.
5. The translation appears in the **Translated subtitle** panel and both versions are added to the session history.
6. If the browser stops listening by itself while you are still translating, LIEN restarts recognition automatically (and gives up with a message if it keeps failing).
7. You can download the history as a `.txt` file or clear the session.

All text from speech and from the translation service is inserted into the page with `textContent`, never `innerHTML`, so it is always treated as plain text and cannot run as code.

### Architecture flow

```
Microphone
    ↓
Web Speech API
    ↓
Speech-to-Text
    ↓
Translation API
    ↓
Translated Subtitle
    ↓
Subtitle History
```

## Project structure

```
LIEN/
├── index.html   # page structure
├── style.css    # dark responsive design
├── app.js       # speech recognition, translation, history, download
├── README.md
└── .gitignore
```

## How to run locally

Speech recognition needs a browser that supports it (see below) and works best when the page is served from `localhost` or HTTPS.

**Option 1: VS Code Live Server (easiest)**

1. Install the *Live Server* extension in VS Code.
2. Open the `LIEN` folder in VS Code.
3. Right-click `index.html` and choose **Open with Live Server**.

**Option 2: Python (if installed)**

```bash
cd LIEN
python -m http.server 8000
```

Then open <http://localhost:8000> in Chrome or Edge.

**Option 3: GitHub Pages**

Push the project to GitHub, then go to *Settings → Pages*, choose the `main` branch and the root folder, and save. GitHub Pages uses HTTPS, so the microphone works.

When the browser asks for microphone permission, click **Allow**.

## Browser compatibility

| Browser | Speech recognition |
| --- | --- |
| Google Chrome (desktop and Android) | Works (recommended) |
| Microsoft Edge (desktop) | Works |
| Safari | Partial or inconsistent support |
| Firefox | Not supported (LIEN shows a message) |

Support changes over time, so check the current browser compatibility table for `SpeechRecognition` on MDN if something does not work.

## Known limitations

- Speech recognition depends on the browser. In Chrome, the audio is sent to Google's servers to be recognized, so an internet connection is required.
- The free MyMemory endpoint has a daily usage limit and a length limit per request (LIEN splits long sentences to stay within it). When the limit is reached, translations will fail until it resets.
- Translations are machine-generated and can be inaccurate, especially for slang, names, or short phrases.
- Subtitles are translated per finished sentence, so there is a small delay and translations are not word-by-word.
- Recognition quality varies by language, accent, background noise and microphone.
- History exists only in memory. It is lost when the page is closed or refreshed, unless you download it.
- Only 7 languages are included.

## Future improvements

- Save history in the browser (`localStorage`) so it survives a refresh
- Add more languages
- Text-to-speech to read the translation aloud
- Export subtitles as `.srt` files for videos
- Adjustable subtitle text size and a fullscreen "presentation" mode
- Optional use of a paid translation API with a private backend for better quality
- Automatic tests for the helper functions

## GitHub project description

**Short description (for the repository "About" box):**

> Real-time multilingual subtitles in the browser: live speech recognition with the Web Speech API and instant translation with the MyMemory API. Built with HTML, CSS and vanilla JavaScript.

**Suggested topics:** `speech-recognition`, `translation`, `web-speech-api`, `subtitles`, `javascript`, `html-css-javascript`, `student-project`, `mymemory-api`

**Longer description (for a portfolio or project page):**

> LIEN is a browser-based student project that turns spoken words into live subtitles and translates each finished sentence into another language. It combines the Web Speech API for speech recognition with the MyMemory Translation API, and keeps a downloadable subtitle history for the session. The project uses no frameworks, no backend and no API keys, and focuses on clean, readable JavaScript, a responsive dark interface, and graceful handling of microphone and network errors.

## License

This project is for learning purposes. Add a license of your choice (for example MIT) before sharing it publicly if you want others to reuse it.
