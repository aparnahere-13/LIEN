/* =========================================================
   LIEN – Real-time multilingual subtitles
   Flow: Microphone -> Web Speech API -> text -> MyMemory
         translation -> translated subtitle -> history
   ========================================================= */

'use strict';

/* ---------------------------------------------------------
   1. Settings
   --------------------------------------------------------- */

// Each language has two codes:
//   speech    -> used by the Web Speech API (needs a region, like "en-US")
//   translate -> used by the MyMemory API (simple two-letter code)
const LANGUAGES = [
  { name: 'English',  speech: 'en-US', translate: 'en' },
  { name: 'Hindi',    speech: 'hi-IN', translate: 'hi' },
  { name: 'Spanish',  speech: 'es-ES', translate: 'es' },
  { name: 'French',   speech: 'fr-FR', translate: 'fr' },
  { name: 'German',   speech: 'de-DE', translate: 'de' },
  { name: 'Japanese', speech: 'ja-JP', translate: 'ja' },
  { name: 'Korean',   speech: 'ko-KR', translate: 'ko' },
];

const TRANSLATE_URL = 'https://api.mymemory.translated.net/get';
const MAX_CHUNK_LENGTH = 450;      // MyMemory accepts about 500 characters per request
const REQUEST_TIMEOUT_MS = 30000;  // give up on a translation after 10 seconds

/* ---------------------------------------------------------
   2. Grab elements from the page (every ID exists in index.html)
   --------------------------------------------------------- */

const sourceSelect   = document.getElementById('sourceLang');
const targetSelect   = document.getElementById('targetLang');
const swapBtn        = document.getElementById('swapBtn');
const startBtn       = document.getElementById('startBtn');
const startBtnLabel  = document.getElementById('startBtnLabel');
const clearBtn       = document.getElementById('clearBtn');
const downloadBtn    = document.getElementById('downloadBtn');
const statusPill     = document.getElementById('statusPill');
const statusText     = document.getElementById('statusText');
const messageBox     = document.getElementById('message');
const originalText   = document.getElementById('originalText');
const translatedText = document.getElementById('translatedText');
const historyList    = document.getElementById('historyList');
const historyEmpty   = document.getElementById('historyEmpty');
const historyCount   = document.getElementById('historyCount');

/* ---------------------------------------------------------
   3. App state
   --------------------------------------------------------- */

const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;      // the speech recognition object
let wantListening = false;   // true while the user WANTS to be translating
let restartTimer = null;     // timer used to restart recognition after it ends
let activeSourceLang = null; // the language recognition was started with
let lastStartTime = 0;       // when recognition last started (to detect restart loops)
let quickEnds = 0;           // how many times in a row recognition ended almost instantly
let intentionalRestart = false; // true when WE stopped recognition to switch language
let requestCounter = 0;      // gives every translation request a number
const history = [];          // all subtitles from this session (oldest first)

/* ---------------------------------------------------------
   4. Small helper functions
   --------------------------------------------------------- */

// Find a language object from its two-letter code
function getLanguage(code) {
  return LANGUAGES.find((lang) => lang.translate === code);
}

// Fill both drop-downs with the language list
function fillLanguageSelects() {
  LANGUAGES.forEach((lang) => {
    sourceSelect.add(new Option(lang.name, lang.translate));
    targetSelect.add(new Option(lang.name, lang.translate));
  });
  sourceSelect.value = 'en';
  targetSelect.value = 'es';
}

// Update the small status pill (states: idle, connecting, listening, error)
function setStatus(state, text) {
  statusPill.dataset.state = state;
  statusText.textContent = text;
}

// Show (or hide, if text is empty) a message under the buttons
function showMessage(text, type) {
  messageBox.textContent = text;
  messageBox.dataset.type = type || 'info';
  messageBox.hidden = !text;
}

// Update the Start/Stop button to match the current state
function updateStartButton() {
  startBtn.classList.toggle('is-listening', wantListening);
  startBtnLabel.textContent = wantListening ? 'Stop Translating' : 'Start Translating';
}

/*
  SECURITY NOTE: We always insert text using .textContent (never .innerHTML).
  .textContent treats the text as plain text, so anything that looks like HTML
  (for example "<script>") is shown as text and is never run. This is how
  user-generated and API-generated text is escaped in this project.
*/

// Show text in the "Original speech" panel
function showOriginal(text, isInterim) {
  originalText.textContent = text;
  originalText.classList.remove('is-placeholder');
  originalText.classList.toggle('is-interim', isInterim);
}

// Show text in the "Translated subtitle" panel
function showTranslated(text) {
  translatedText.textContent = text;
  translatedText.classList.remove('is-placeholder');
}

// Put both panels back to their empty state
function resetPanels() {
  originalText.textContent = 'Your words will appear here as you speak.';
  originalText.classList.add('is-placeholder');
  originalText.classList.remove('is-interim');
  translatedText.textContent = 'The translation will appear here.';
  translatedText.classList.add('is-placeholder');
}

// MyMemory sometimes returns HTML entities (like &#39;). A <textarea> can decode
// them safely into normal characters without running any code.
function decodeEntities(text) {
  const helper = document.createElement('textarea');
  helper.innerHTML = text;
  return helper.value;
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/* ---------------------------------------------------------
   5. Translation (MyMemory API)
   --------------------------------------------------------- */

// MyMemory limits each request's length, so long sentences are cut into chunks
function splitIntoChunks(text, maxLength) {
  const chunks = [];
  let current = '';

  for (let word of text.split(' ')) {
    // A single very long "word" (for example Japanese, which has no spaces)
    // is cut into pieces that fit.
    while (word.length > maxLength) {
      if (current) { chunks.push(current); current = ''; }
      chunks.push(word.slice(0, maxLength));
      word = word.slice(maxLength);
    }

    const candidate = current ? current + ' ' + word : word;
    if (candidate.length > maxLength) {
      chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

// Translate one short piece of text. Throws an Error with a friendly message on failure.
async function fetchTranslation(text, sourceCode, targetCode) {
  // encodeURIComponent makes the text safe to place inside a URL
  const url =
    TRANSLATE_URL +
    '?q=' + encodeURIComponent(text) +
    '&langpair=' + encodeURIComponent(sourceCode + '|' + targetCode);

  // AbortController lets us cancel the request if it takes too long
  // const controller = new AbortController();
  // const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('The translation service is having problems (error ' + response.status + '). Please try again.');
    }

    const data = await response.json();
    const translated = data.responseData && data.responseData.translatedText;

    // MyMemory reports its own status code inside the JSON
    const details = String(data.responseDetails || '');

    // When the free daily limit is used up, MyMemory sends a "MYMEMORY WARNING" text
    if (/MYMEMORY WARNING/i.test(details) || /MYMEMORY WARNING/i.test(translated || '')) {
      throw new Error('The free daily translation limit has been reached. Try again later.');
    }
    if (Number(data.responseStatus) !== 200 || !translated) {
      throw new Error(details || 'The translation service did not return a result.');
    }

    return decodeEntities(translated);
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('The translation took too long. Check your internet connection.');
    }
    if (error instanceof TypeError) {
      // fetch() throws a TypeError when the network is down or the request is blocked
      throw new Error('Could not reach the translation service. Check your internet connection.');
    }
    throw error;
  }// finally {
    // clearTimeout(timeoutId);
  //}
}

// Translate a full sentence (handles same-language and long text)
async function translateText(text, sourceCode, targetCode) {
  // Nothing to translate if both languages are the same
  if (sourceCode === targetCode) return text;

  const chunks = splitIntoChunks(text, MAX_CHUNK_LENGTH);
  const results = [];
  for (const chunk of chunks) {
    results.push(await fetchTranslation(chunk, sourceCode, targetCode));
  }
  return results.join(' ');
}

/* ---------------------------------------------------------
   6. Handling a finished speech segment
   --------------------------------------------------------- */

function handleFinalSegment(text) {
  // Use the language recognition was started with (the dropdown may have just changed)
  const sourceLang = activeSourceLang || getLanguage(sourceSelect.value);
  const targetLang = getLanguage(targetSelect.value);

  showOriginal(text, false);

  // Add the subtitle to history right away; the translation is filled in later
  const entry = {
    time: new Date(),
    sourceLang,
    targetLang,
    original: text,
    translated: null,
    error: null,
  };
  history.push(entry);
  renderHistory();

  // Each request gets a number so an older, slower translation
  // never overwrites a newer one in the big panel.
  const requestId = ++requestCounter;
  translatedText.textContent = 'Translating…';
  translatedText.classList.add('is-placeholder');

  translateText(text, sourceLang.translate, targetLang.translate)
    .then((translated) => {
      entry.translated = translated;
      if (requestId === requestCounter) showTranslated(translated);
    })
    .catch((error) => {
      entry.error = error.message;
      if (requestId === requestCounter) {
        translatedText.textContent = 'Translation unavailable.';
        translatedText.classList.add('is-placeholder');
      }
      if (history.includes(entry)) showMessage(error.message, 'error');
    })
    .finally(renderHistory);
}

/* ---------------------------------------------------------
   7. Subtitle history
   --------------------------------------------------------- */

// Small helper to create an element with text
function makeElement(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text; // textContent = safe, no HTML is run
  return el;
}

function renderHistory() {
  historyList.textContent = ''; // empty the list

  // Newest subtitle first
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    const item = makeElement('li', 'history__item');

    const meta = makeElement('div', 'history__meta');
    meta.appendChild(makeElement('span', '', formatTime(entry.time)));
    meta.appendChild(makeElement('span', '', entry.sourceLang.name + ' → ' + entry.targetLang.name));

    const original = makeElement('p', 'history__original', entry.original);
    original.lang = entry.sourceLang.translate;

    let translated;
    if (entry.error) {
      translated = makeElement('p', 'history__translated is-failed', 'Translation unavailable: ' + entry.error);
    } else if (entry.translated === null) {
      translated = makeElement('p', 'history__translated is-pending', 'Translating…');
    } else {
      translated = makeElement('p', 'history__translated', entry.translated);
      translated.lang = entry.targetLang.translate;
    }

    item.append(meta, original, translated);
    historyList.appendChild(item);
  }

  const count = history.length;
  historyCount.textContent = count + (count === 1 ? ' subtitle' : ' subtitles');
  historyEmpty.hidden = count > 0;
  downloadBtn.disabled = count === 0;
}

// Build the text file content, oldest subtitle first
function buildTranscript() {
  const lines = [
    'LIEN - Real-time multilingual subtitles',
    'Saved: ' + new Date().toLocaleString(),
    '',
  ];

  history.forEach((entry, index) => {
    lines.push('#' + (index + 1) + '  [' + formatTime(entry.time) + ']  ' +
      entry.sourceLang.name + ' -> ' + entry.targetLang.name);
    lines.push('Original:   ' + entry.original);
    lines.push('Translated: ' + (entry.translated !== null ? entry.translated : '(not available)'));
    lines.push('');
  });

  return lines.join('\n');
}

function downloadHistory() {
  if (history.length === 0) return;

  // "\uFEFF" is a byte-order mark so Notepad opens Hindi/Japanese/Korean text correctly
  const blob = new Blob(['\uFEFF' + buildTranscript()], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  // Make a temporary link, click it, and remove it
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) +
    '-' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());

  const link = document.createElement('a');
  link.href = url;
  link.download = 'lien-subtitles-' + stamp + '.txt';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000); // wait a moment so the download can start
}

function clearSession() {
  history.length = 0;
  requestCounter++;   // ignore any translation that is still on its way
  resetPanels();
  showMessage('');
  renderHistory();
}

/* ---------------------------------------------------------
   8. Speech recognition (Web Speech API)
   --------------------------------------------------------- */

function createRecognition() {
  const rec = new SpeechRecognitionAPI();
  rec.continuous = true;       // keep listening after each pause
  rec.interimResults = true;   // give us partial text while the person is still talking
  rec.maxAlternatives = 1;     // only the best guess

  // The microphone is on and the browser is listening
  rec.onstart = () => {
    setStatus('listening', 'Listening…');
  };

  // The browser has new text for us
  rec.onresult = (event) => {
    quickEnds = 0;
    showMessage(''); // hide old "didn't hear anything" style messages

    let interim = '';
    // event.resultIndex is the first result that changed since last time
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0].transcript.trim();
      if (!transcript) continue;

      if (result.isFinal) {
        handleFinalSegment(transcript);   // finished sentence -> translate it
      } else {
        interim += transcript + ' ';      // still being spoken -> live subtitle
      }
    }

    if (interim) showOriginal(interim.trim(), true);
  };

  // Something went wrong
  rec.onerror = (event) => {
    switch (event.error) {
      case 'no-speech':
        // Not fatal: recognition ends and is restarted automatically
        showMessage("I didn't hear anything. Keep talking, or check that your microphone is working.", 'info');
        break;
      case 'aborted':
        break; // we stopped it ourselves, nothing to report
      case 'not-allowed':
      case 'service-not-allowed':
        stopWithError('Microphone access is blocked. Click the lock icon in the address bar, allow the microphone, then press Start Translating again.');
        break;
      case 'audio-capture':
        stopWithError('No microphone was found. Plug one in or check your system sound settings, then try again.');
        break;
      case 'network':
        stopWithError('Speech recognition needs an internet connection and could not reach its service. Check your connection and try again.');
        break;
      case 'language-not-supported':
        stopWithError('This browser cannot recognize the selected spoken language. Try another language.');
        break;
      default:
        stopWithError('Speech recognition error: ' + event.error + '. Please try again.');
    }
  };

  // Recognition stopped. If the user still wants to translate, start it again.
  rec.onend = () => {
    if (!wantListening) {
      if (statusPill.dataset.state !== 'error') setStatus('idle', 'Microphone off');
      return;
    }

    // Safety check: if it keeps ending instantly, something is wrong. Stop trying.
    // (A restart we asked for ourselves, like a language change, doesn't count.)
    if (intentionalRestart) {
      intentionalRestart = false;
      quickEnds = 0;
    } else {
      quickEnds = (Date.now() - lastStartTime < 1000) ? quickEnds + 1 : 0;
    }
    if (quickEnds >= 5) {
      stopWithError('Speech recognition keeps stopping. Check your microphone and try again.');
      return;
    }

    setStatus('connecting', 'Reconnecting…');
    restartTimer = setTimeout(() => {
      if (wantListening) startRecognition();
    }, 300);
  };

  return rec;
}

// Actually start the browser's speech recognition
function startRecognition() {
  // Always use the currently selected spoken language
  activeSourceLang = getLanguage(sourceSelect.value);
  recognition.lang = activeSourceLang.speech;
  lastStartTime = Date.now();
  try {
    recognition.start();
  } catch (error) {
    // start() throws if recognition is already running. That's fine.
    console.warn('Speech recognition start skipped:', error.message);
  }
}

function startListening() {
  wantListening = true;
  quickEnds = 0;
  intentionalRestart = false;
  showMessage('');
  updateStartButton();
  setStatus('connecting', 'Waiting for microphone…'); // the browser may ask for permission now
  startRecognition();
}

function stopListening() {
  wantListening = false;
  clearTimeout(restartTimer);
  updateStartButton();
  setStatus('idle', 'Microphone off');
  recognition.stop(); // stop() (not abort) lets the last words finish
}

// Stop everything and show an error message
function stopWithError(message) {
  wantListening = false;
  clearTimeout(restartTimer);
  updateStartButton();
  setStatus('error', 'Stopped');
  showMessage(message, 'error');
}

// If the language changes while listening, restart so the new language is used
function restartIfListening() {
  if (!wantListening) return;
  intentionalRestart = true;
  recognition.stop(); // onend will start it again with the new language
}

/* ---------------------------------------------------------
   9. Button and dropdown events
   --------------------------------------------------------- */

function setUpEvents() {
  startBtn.addEventListener('click', () => {
    if (wantListening) stopListening();
    else startListening();
  });

  clearBtn.addEventListener('click', clearSession);
  downloadBtn.addEventListener('click', downloadHistory);

  swapBtn.addEventListener('click', () => {
    const oldSource = sourceSelect.value;
    sourceSelect.value = targetSelect.value;
    targetSelect.value = oldSource;
    restartIfListening();
  });

  sourceSelect.addEventListener('change', restartIfListening);
}

/* ---------------------------------------------------------
   10. Start the app
   --------------------------------------------------------- */

function init() {
  fillLanguageSelects();
  renderHistory();
  setUpEvents();

  if (!SpeechRecognitionAPI) {
    startBtn.disabled = true;
    setStatus('error', 'Not supported');
    showMessage('This browser does not support speech recognition. Please open LIEN in Google Chrome or Microsoft Edge.', 'error');
    return;
  }

  recognition = createRecognition();
}

init();
