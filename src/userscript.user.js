// ==UserScript==
// @name         Translate Selection to Vietnamese (OpenAI, Dark Theme, Auto Close Overlay Fixed)
// @description  Translate selected text into Vietnamese via OpenAI API with Shift trigger, dark overlay, draggable popup, auto-close on outside click.
// @namespace    https://your-namespace.example
// @version      1.3
// @author       You
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
  'use strict';

  let HOTKEY = GM_getValue("translate_hotkey", "Shift") ;
  let TARGET_LANG = GM_getValue("translate_target_lang", "Vietnamese"); // mặc định


  const MODEL = 'gpt-4o-mini';
  const MAX_CHUNK_SIZE = 4000;

  let isPressed = false;
  let overlayEl = null;
  let dragData = null;

  GM_registerMenuCommand("OpenAI — Set/Update API Key", promptForApiKey);
  GM_registerMenuCommand("Translate — Set Hotkey", promptForHotkey);
  GM_registerMenuCommand("Translate — Set Target Language", chooseTargetLanguage);

function chooseTargetLanguage() {
  const LANGUAGES = ["Vietnamese", "English", "Japanese", "French", "Chinese", "Korean", "German", "Spanish"];
  const choice = prompt(
    "Choose target language:\n" + 
    LANGUAGES.map((l, i) => `${i + 1}. ${l}`).join("\n") +
    `\n\nCurrent: ${TARGET_LANG}\n\nEnter number (1-${LANGUAGES.length}):`
  );

  if (!choice) return;
  const idx = parseInt(choice, 10) - 1;
  if (idx >= 0 && idx < LANGUAGES.length) {
    TARGET_LANG = LANGUAGES[idx];
    GM_setValue("translate_target_lang", TARGET_LANG);
    alert("Target language set to: " + TARGET_LANG);
  } else {
    alert("Invalid choice.");
  }
}

function promptForHotkey() {
  const key = prompt("Enter the hotkey you want to use (e.g. Shift, Control, Alt, T):", HOTKEY);
  if (key && key.trim()) {
    HOTKEY = key.trim();
    GM_setValue("translate_hotkey", HOTKEY);
    alert("Hotkey set to: " + HOTKEY);
  }
}


  async function getApiKey() {
    let key = await GM_getValue("openai_api_key", null);
    if (!key) {
      await promptForApiKey();
      key = await GM_getValue("openai_api_key", null);
    }
    return key;
  }

  async function promptForApiKey() {
    const key = prompt("Enter your OpenAI API key:");
    if (key && key.trim()) {
      GM_setValue("openai_api_key", key.trim());
      alert("API key saved!");
    }
  }

  document.addEventListener("keydown", async (e) => {
    if (e.key === HOTKEY && !isPressed) {
      if (isTypingInInput(e)) return;
      isPressed = true;
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : "";
      if (!text) return;
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const bubble = showStatusBubble(rect, "Translating...");
      try {
        const translation = await translateText(text);
        bubble.remove();
        showTranslationOverlay(text, translation, rect);
      } catch (err) {
        bubble.remove();
        showTranslationOverlay(text, "[Error] " + err.message, rect);
      }
    }
  });

  document.addEventListener("keyup", (e) => {
    if (e.key === HOTKEY) {
      isPressed = false;
    }
  });

  function isTypingInInput(e) {
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return true;
    if (e.target.isContentEditable) return true;
    return false;
  }

  async function translateText(text) {
    const key = await getApiKey();
    if (!key) throw new Error("No API key set.");

    const chunks = chunkText(text, MAX_CHUNK_SIZE);
    let results = [];

    for (let chunk of chunks) {
      const result = await callOpenAI(key, chunk);
      results.push(result);
    }

    return results.join("\n");
  }

  function chunkText(str, len) {
    let res = [];
    for (let i = 0; i < str.length; i += len) {
      res.push(str.slice(i, i + len));
    }
    return res;
  }

  async function callOpenAI(apiKey, text) {
    const endpoint = "https://api.openai.com/v1/chat/completions";
    const body = {
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "Bạn là một dịch giả chuyên dịch tài liệu lập trình. Hãy dịch đoạn văn sang " + TARGET_LANG + " tự nhiên, dễ hiểu. \
  QUAN TRỌNG: \
  - Giữ nguyên các thuật ngữ/ký hiệu kỹ thuật lập trình (ví dụ: list, dictionary, tuple, array, class, object, function, API, library, framework...). \
  - Nếu cần, có thể thêm giải thích ngắn gọn bằng " + TARGET_LANG + " trong ngoặc để người đọc dễ hiểu, nhưng KHÔNG thay thế hay dịch hẳn các từ khóa này. \
  - Không dịch code block hoặc inline code, giữ nguyên cú pháp. \
  - Ưu tiên văn phong rõ ràng, gần gũi, nhưng không được dịch thô.",
        },
        {
          role: "user",
          content: text,
        },
      ],
    };

    return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "POST",
      url: endpoint,
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      data: JSON.stringify(body),
      onload: (response) => {
        if (response.status === 401) {
          reject(new Error("Unauthorized: Invalid API key"));
          return;
        }
        if (response.status === 429) {
          reject(new Error("Rate limited"));
          return;
        }
        if (response.status < 200 || response.status >= 300) {
          reject(new Error("Network/API Error: " + response.status));
          return;
        }

        try {
          const data = JSON.parse(response.responseText);
          if (data.error) {
            reject(new Error("OpenAI Error: " + data.error.message));
          } else {
            resolve(data.choices[0].message.content.trim());
          }
        } catch (err) {
          reject(new Error("Invalid JSON or bad response"));
        }
      },
      onerror: (err) => reject(err),
    });
  });
}

  function showStatusBubble(rect, message) {
    const bubble = document.createElement("div");
    bubble.className = "vmtrans-bubble";
    bubble.textContent = message;
    positionElement(bubble, rect);
    document.body.appendChild(bubble);
    return bubble;
  }

  function showTranslationOverlay(original, translated, rect) {
    closeOverlay();

    const overlay = document.createElement("div");
    overlay.className = "vmtrans-overlay";
    overlay.innerHTML = `
      <div class="vmtrans-header">
        Translation
        <span class="vmtrans-close">&times;</span>
      </div>
      <div class="vmtrans-body">
        <details>
          <summary>Original text</summary>
          <pre class="vmtrans-original"></pre>
        </details>
        <div class="vmtrans-translation"></div>
        <button class="vmtrans-copy">Copy translation</button>
      </div>
    `;

    overlay.querySelector(".vmtrans-original").textContent = original;
    overlay.querySelector(".vmtrans-translation").textContent = translated;

    overlay.querySelector(".vmtrans-close").onclick = closeOverlay;
    overlay.querySelector(".vmtrans-copy").onclick = () => {
      navigator.clipboard.writeText(translated);
      alert("Translated text copied.");
    };

    makeDraggable(overlay);

    document.body.appendChild(overlay);
    positionElement(overlay, rect);
    overlayEl = overlay;

    document.addEventListener("keydown", escListener);
    setTimeout(() => {
      document.addEventListener("click", outsideClickListener);
    }, 0);
  }

  function closeOverlay() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
      document.removeEventListener("keydown", escListener);
      document.removeEventListener("click", outsideClickListener);
    }
  }

  function escListener(e) {
    if (e.key === "Escape") closeOverlay();
  }

  function outsideClickListener(e) {
    if (overlayEl && !overlayEl.contains(e.target)) {
      closeOverlay();
    }
  }

  function positionElement(el, rect) {
    el.style.top = window.scrollY + rect.bottom + 5 + "px";
    el.style.left = window.scrollX + rect.left + "px";
  }

  function makeDraggable(el) {
    const header = el.querySelector(".vmtrans-header");
    header.style.cursor = "move";
    header.addEventListener("mousedown", (e) => {
      dragData = {
        offsetX: e.clientX - el.offsetLeft,
        offsetY: e.clientY - el.offsetTop,
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", stop);
    });

    function move(e) {
      el.style.top = e.clientY - dragData.offsetY + "px";
      el.style.left = e.clientX - dragData.offsetX + "px";
    }

    function stop() {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", stop);
      dragData = null;
    }
  }

  GM_addStyle(`
    .vmtrans-overlay {
      position: absolute;
      max-width: 480px;
      background: #2b2b2b !important;
      color: #f0f0f0 !important;
      border: 1px solid #444;
      border-radius: 6px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.6);
      font-family: sans-serif;
      font-size: 14px;
      z-index: 999999;
    }
    .vmtrans-overlay,
    .vmtrans-overlay * { color: #f0f0f0 !important; }
    .vmtrans-header {
      padding: 5px 10px;
      background: #3a3a3a !important;
      display: flex;
      justify-content: space-between;
      border-radius: 6px 6px 0 0;
    }
    .vmtrans-body { padding: 10px; }
    .vmtrans-body pre {
      white-space: pre-wrap;
      max-height: 200px;
      overflow: auto;
      background: #1e1e1e;
      padding: 5px;
      border: 1px solid #555;
      border-radius: 4px;
    }
    .vmtrans-translation { margin-top: 8px; white-space: pre-wrap; }
    .vmtrans-copy {
      margin-top: 8px;
      padding: 5px 10px;
      border: 1px solid #666;
      background: #3a3a3a;
      border-radius: 4px;
      cursor: pointer;
    }
    .vmtrans-copy:hover { background: #505050; }
    .vmtrans-close { cursor: pointer; font-size: 16px; }
    .vmtrans-bubble {
      position: absolute;
      background: #333;
      color: white;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 999999;
    }
  `);
})();
