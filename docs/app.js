const pageList = document.getElementById("page-list");
const canvas = document.getElementById("canvas");
const statusEl = document.getElementById("status");
const saveButton = document.getElementById("save");
const publishButton = document.getElementById("publish");
const discardButton = document.getElementById("discard");
const openLiveButton = document.getElementById("open-live");
const toolbar = document.getElementById("toolbar");
const addLinkButton = document.getElementById("add-link");
const uploadButton = document.getElementById("upload-image");
const imageInput = document.getElementById("image-input");
const templateSelect = document.getElementById("template-select");
const insertTemplateButton = document.getElementById("insert-template");
const tokenInput = document.getElementById("session-token");
const connectButton = document.getElementById("connect");
const connectionState = document.getElementById("connection-state");

const runtimeConfig = window.FLC_EDITOR_CONFIG || {};
const apiBase = String(runtimeConfig.apiBase || "").replace(/\/$/, "");
const liveBase = String(runtimeConfig.liveBase || "https://firstlutheranifalls.site").replace(/\/$/, "");

const state = {
  pages: [],
  currentPath: null,
  doctype: "",
  token: "",
  connected: false,
};

const templates = {
  callout:
    '\n<div class="callout">\n  <h3>Callout Title</h3>\n  <p>Share an important announcement or invitation here.</p>\n</div>\n',
  "two-column":
    '\n<div class="columns">\n  <div>\n    <h3>Column One</h3>\n    <p>Add content for the first column.</p>\n  </div>\n  <div>\n    <h3>Column Two</h3>\n    <p>Add content for the second column.</p>\n  </div>\n',
  "event-card":
    '\n<div class="event-card">\n  <h3>Event Title</h3>\n  <p><strong>Date:</strong> Add date and time</p>\n  <p><strong>Location:</strong> Add location</p>\n  <p>Share the event details here.</p>\n</div>\n',
};

function apiUrl(path) {
  if (!apiBase) throw new Error("Editor API is not configured");
  return `${apiBase}${path}`;
}

function setConnected(connected, message = "") {
  state.connected = connected;
  saveButton.disabled = !connected;
  publishButton.disabled = !connected;
  discardButton.disabled = !connected;
  uploadButton.disabled = !connected;
  connectionState.textContent = message || (connected ? "Connected" : "Not connected");
  connectionState.dataset.tone = connected ? "success" : "error";
  if (!connected) {
    state.token = "";
    state.pages = [];
    state.currentPath = null;
    pageList.innerHTML = "";
  }
}

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Accept", headers.get("Accept") || "application/json");
  if (state.token) headers.set("Authorization", `Bearer ${state.token}`);

  const response = await fetch(apiUrl(path), {
    ...options,
    headers,
  });

  if (response.status === 401) {
    setConnected(false, "Authentication failed");
    throw new Error("Authentication failed");
  }
  return response;
}

async function fetchJson(path, options = {}) {
  const response = await apiFetch(path, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload;
}

function setStatus(message, tone = "") {
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
}

function parseDoctype(html) {
  const match = html.match(/<!doctype[^>]*>/i);
  return match ? match[0] : "";
}

function injectPreviewBase(html) {
  const baseTag = `<base id="editor-preview-base" href="${liveBase}/">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
  }
  return `${baseTag}${html}`;
}

function clearActive() {
  pageList.querySelectorAll(".page-item").forEach((item) => {
    item.setAttribute("aria-current", "false");
  });
}

function renderPages() {
  pageList.innerHTML = "";
  state.pages.forEach((page) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "page-item";
    button.textContent = page;
    button.addEventListener("click", () => loadPage(page, button));
    pageList.appendChild(button);
  });
}

async function loadPages() {
  if (!state.connected) return;
  setStatus("Loading pages...");
  try {
    const data = await fetchJson("/api/editor/pages");
    state.pages = data.pages || [];
    renderPages();
    if (state.pages.length === 0) {
      setStatus("No pages found in the test website branch.");
    } else {
      setStatus("Select a page to edit.");
    }
  } catch (error) {
    console.error(error);
    setStatus(`Failed to load pages: ${error.message}`, "error");
  }
}

async function loadPage(path, button) {
  setStatus(`Loading ${path}...`);
  try {
    const response = await apiFetch(`/api/editor/page?path=${encodeURIComponent(path)}`, {
      headers: { Accept: "text/html" },
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Failed to load page");
    }
    const html = await response.text();
    state.currentPath = path;
    state.doctype = parseDoctype(html);

    const cleanHtml = html.replace(state.doctype, "");
    canvas.srcdoc = injectPreviewBase(cleanHtml);
    canvas.onload = () => {
      const doc = canvas.contentDocument;
      if (!doc) return;
      doc.designMode = "on";
      setStatus(`Editing ${path} (draft branch)`);
    };

    clearActive();
    button.setAttribute("aria-current", "true");
  } catch (error) {
    console.error(error);
    setStatus(`Failed to load page: ${error.message}`, "error");
  }
}

function getEditedHtml() {
  const doc = canvas.contentDocument;
  if (!doc) return "";
  const clone = doc.documentElement.cloneNode(true);
  clone.querySelector("#editor-preview-base")?.remove();
  const html = clone.outerHTML;
  return state.doctype ? `${state.doctype}\n${html}` : html;
}

async function connectEditor() {
  const token = tokenInput.value.trim();
  if (!token) {
    connectionState.textContent = "Enter the editor token";
    connectionState.dataset.tone = "error";
    return;
  }

  state.token = token;
  tokenInput.value = "";
  connectionState.textContent = "Connecting...";
  connectionState.dataset.tone = "";

  try {
    const status = await fetchJson("/api/editor/status");
    setConnected(true, `Connected · ${status.status}`);
    setStatus(
      `Connected to ${status.draftBranch}. Publish target: ${status.targetBranch}.`,
      "success",
    );
    await loadPages();
  } catch (error) {
    console.error(error);
    setConnected(false, "Connection failed");
    setStatus(`Connection failed: ${error.message}`, "error");
  }
}

async function savePage() {
  if (!state.currentPath) {
    setStatus("Select a page before saving.");
    return;
  }
  setStatus("Saving draft to GitHub...");
  try {
    const result = await fetchJson("/api/editor/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: state.currentPath,
        html: getEditedHtml(),
      }),
    });
    setStatus(`Saved ${state.currentPath} to ${result.branch} (${String(result.commit || "").slice(0, 12)})`, "success");
  } catch (error) {
    console.error(error);
    setStatus(`Save failed: ${error.message}`, "error");
  }
}

async function publishChanges() {
  const confirmed = window.confirm(
    "Publish the saved draft by fast-forwarding the migration test website branch? This affects firstlutheranifalls.site only, not production main.",
  );
  if (!confirmed) return;

  setStatus("Publishing test branch...");
  try {
    const result = await fetchJson("/api/editor/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (result.published === false) {
      setStatus(result.message || "No draft changes to publish.");
      return;
    }
    setStatus(`Published test commit ${String(result.commit || "").slice(0, 12)}. GitHub Pages deployment should follow.`, "success");
  } catch (error) {
    console.error(error);
    setStatus(`Publish blocked: ${error.message}`, "error");
  }
}

async function discardDraft() {
  const confirmed = window.confirm(
    "Discard every unpublished editor draft change and reset the draft branch to the current test website branch?",
  );
  if (!confirmed) return;

  setStatus("Discarding draft changes...");
  try {
    await fetchJson("/api/editor/discard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    state.currentPath = null;
    canvas.srcdoc = "";
    await loadPages();
    setStatus("Draft reset to the current test website branch.", "success");
  } catch (error) {
    console.error(error);
    setStatus(`Could not discard draft: ${error.message}`, "error");
  }
}

function execCommand(command, value = null) {
  const doc = canvas.contentDocument;
  if (!doc) return;
  canvas.contentWindow.focus();
  doc.execCommand(command, false, value);
}

function normalizeUrl(raw) {
  const trimmed = raw.trim();
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:")
  ) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function insertHtml(html) {
  execCommand("insertHTML", html);
}

connectButton.addEventListener("click", connectEditor);
tokenInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") connectEditor();
});
saveButton.addEventListener("click", savePage);
publishButton.addEventListener("click", publishChanges);
discardButton.addEventListener("click", discardDraft);
openLiveButton.addEventListener("click", () => {
  const suffix = state.currentPath ? `/${state.currentPath}` : "/";
  window.open(`${liveBase}${suffix}`, "_blank", "noopener,noreferrer");
});

toolbar.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const cmd = button.dataset.cmd;
  if (!cmd) return;
  const value = button.dataset.value || null;
  execCommand(cmd, value);
});

addLinkButton.addEventListener("click", () => {
  const raw = window.prompt("Enter the link URL (include https://)");
  if (!raw) return;
  const url = normalizeUrl(raw);
  const doc = canvas.contentDocument;
  if (!doc) return;
  const selection = doc.getSelection();
  const selectedText = selection ? selection.toString() : "";
  if (!selectedText) {
    insertHtml(`<a href="${url}">${url}</a>`);
    return;
  }
  execCommand("createLink", url);
});

uploadButton.addEventListener("click", () => {
  if (!state.connected) return;
  imageInput.click();
});

imageInput.addEventListener("change", async () => {
  const file = imageInput.files?.[0];
  if (!file) return;
  setStatus("Uploading image to draft branch...");
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const dataUrl = reader.result;
      const response = await fetchJson("/api/editor/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, dataUrl }),
      });
      execCommand("insertImage", response.path);
      const alt = window.prompt("Alt text for the image (optional):");
      if (alt) {
        const doc = canvas.contentDocument;
        const images = doc?.querySelectorAll(`img[src="${response.path}"]`);
        const img = images && images[images.length - 1];
        if (img) img.alt = alt;
      }
      setStatus(`Image saved to ${response.branch}.`, "success");
    } catch (error) {
      console.error(error);
      setStatus(`Image upload failed: ${error.message}`, "error");
    } finally {
      imageInput.value = "";
    }
  };
  reader.readAsDataURL(file);
});

insertTemplateButton.addEventListener("click", () => {
  const templateKey = templateSelect.value;
  if (!templateKey) return;
  const html = templates[templateKey];
  if (!html) return;
  insertHtml(html);
  templateSelect.value = "";
  setStatus("Template inserted.", "success");
});

setConnected(false, "Not connected");
