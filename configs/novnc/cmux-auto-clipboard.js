import UI from "./ui.js";

const extraPanelSelectors = [
  "#noVNC_clipboard",
  "#noVNC_settings",
  "#noVNC_credentials_dlg",
  "#noVNC_power",
];

function isTextInput(element) {
  if (!element) {
    return false;
  }

  if (element instanceof HTMLTextAreaElement) {
    return true;
  }

  if (element instanceof HTMLInputElement) {
    const type = (element.type || "").toLowerCase();
    return (
      type === "" ||
      type === "text" ||
      type === "search" ||
      type === "email" ||
      type === "url" ||
      type === "password" ||
      type === "number" ||
      type === "tel"
    );
  }

  return element.isContentEditable;
}

function isUiTextField(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.id === "noVNC_keyboardinput") {
    return false;
  }

  for (const selector of extraPanelSelectors) {
    if (element.closest(selector)) {
      return true;
    }
  }

  if (element.closest("#noVNC_control_bar")) {
    return true;
  }

  return isTextInput(element);
}

function focusRemote() {
  try {
    if (UI && UI.rfb) {
      UI.rfb.focus();
    }
  } catch (error) {
    // ignore focus errors
  }
}

function handlePaste(event) {
  if (!event.clipboardData || event.defaultPrevented) {
    return;
  }

  if (!UI || !UI.rfb || !UI.connected) {
    return;
  }

  const target = event.target;
  if (target instanceof HTMLElement && isUiTextField(target)) {
    return;
  }

  const text = event.clipboardData.getData("text/plain");
  if (!text) {
    return;
  }

  event.preventDefault();
  try {
    UI.rfb.clipboardPasteFrom(text);
    const clipboardText = document.getElementById("noVNC_clipboard_text");
    if (clipboardText instanceof HTMLTextAreaElement) {
      clipboardText.value = text;
    }
    window.setTimeout(focusRemote, 0);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Failed to forward clipboard to VNC session", error);
  }
}

function registerAutoPaste() {
  document.addEventListener("paste", handlePaste, true);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", registerAutoPaste, { once: true });
} else {
  registerAutoPaste();
}
