const pageList = document.getElementById("page-list");
const canvas = document.getElementById("canvas");
const statusEl = document.getElementById("status");
const saveButton = document.getElementById("save");
const openLiveButton = document.getElementById("open-live");
const toolbar = document.getElementById("toolbar");
const addLinkButton = document.getElementById("add-link");
const uploadButton = document.getElementById("upload-image");
const imageInput = document.getElementById("image-input");
const templateSelect = document.getElementById("template-select");
const insertTemplateButton = document.getElementById("insert-template");

const state = {
  pages: [],
  currentPath: null,
  doctype: ""
};

const templates = {
  callout:
    '\n<div class="callout">\n  <h3>Callout Title</h3>\n  <p>Share an important announcement or invitation here.</p>\n</div>\n',
  "two-column":
    '\n<div class="columns">\n  <div>\n    <h3>Column One</h3>\n    <p>Add content for the first column.</p>\n  </div>\n  <div>\n    <h3>Column Two</h3>\n    <p>Add content for the second column.</p>\n  </div>\n</div>\n',
  "event-card":
    '\n<div class="event-card">\n  <h3>Event Title</h3>\n  <p><strong>Date:</strong> Add date and time</p>\n  <p><strong>Location:</strong> Add location</p>\n  <p>Share the event details here.</p>\n</div>\n'
};

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Request failed");
  }
  return response.json();
}

function setStatus(message, tone = "") {
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
}

function parseDoctype(html) {
  const match = html.match(/<!doctype[^>]*>/i);
  return match ? match[0] : "";
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
  setStatus("Loading pages...");
  try {
    const data = await fetchJson("/__api/pages");
    state.pages = data.pages || [];
    renderPages();
    if (state.pages.length === 0) {
      setStatus("No pages found in /public.");
    } else {
      setStatus("Select a page to edit.");
    }
  } catch (error) {
    console.error(error);
    setStatus("Failed to load pages.");
  }
}

async function loadPage(path, button) {
  setStatus(`Loading ${path}...`);
  try {
    const response = await fetch(`/__api/page?path=${encodeURIComponent(path)}`);
    if (!response.ok) {
      throw new Error("Failed to load page");
    }
    const html = await response.text();
    state.currentPath = path;
    state.doctype = parseDoctype(html);

    const cleanHtml = html.replace(state.doctype, "");
    canvas.srcdoc = cleanHtml;
    canvas.onload = () => {
      const doc = canvas.contentDocument;
      if (!doc) return;
      doc.designMode = "on";
      setStatus(`Editing ${path}`);
    };

    clearActive();
    button.setAttribute("aria-current", "true");
  } catch (error) {
    console.error(error);
    setStatus("Failed to load the page.");
  }
}

function getEditedHtml() {
  const doc = canvas.contentDocument;
  if (!doc) return "";
  const html = doc.documentElement.outerHTML;
  if (state.doctype) {
    return `${state.doctype}\n${html}`;
  }
  return html;
}

async function savePage() {
  if (!state.currentPath) {
    setStatus("Select a page before saving.");
    return;
  }
  setStatus("Saving...");
  try {
    await fetchJson("/__api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: state.currentPath,
        html: getEditedHtml()
      })
    });
    setStatus(`Saved ${state.currentPath}`, "success");
  } catch (error) {
    console.error(error);
    setStatus("Save failed. Check the server logs.");
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

saveButton.addEventListener("click", savePage);
openLiveButton.addEventListener("click", () => {
  if (!state.currentPath) {
    setStatus("Select a page to open.");
    return;
  }
  window.open(`/${state.currentPath}`, "_blank");
});

toolbar.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const cmd = button.dataset.cmd;
  if (!cmd) return;
  const value = button.dataset.value || null;
  if (cmd === "formatBlock" && value) {
    execCommand(cmd, value);
    return;
  }
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
  imageInput.click();
});

imageInput.addEventListener("change", async () => {
  const file = imageInput.files?.[0];
  if (!file) return;
  setStatus("Uploading image...");
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const dataUrl = reader.result;
      const response = await fetchJson("/__api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, dataUrl })
      });
      execCommand("insertImage", response.path);
      const alt = window.prompt("Alt text for the image (optional):");
      if (alt) {
        const doc = canvas.contentDocument;
        const images = doc?.querySelectorAll(`img[src="${response.path}"]`);
        const img = images && images[images.length - 1];
        if (img) img.alt = alt;
      }
      setStatus("Image uploaded.", "success");
    } catch (error) {
      console.error(error);
      setStatus("Image upload failed.");
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

loadPages();
