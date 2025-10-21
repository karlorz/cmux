"use client";

import { loader } from "@monaco-editor/react";

import * as monaco from "monaco-editor";
import "monaco-editor/esm/vs/editor/editor.all";
import "monaco-editor/esm/vs/editor/browser/services/hoverService/hoverService";

function createWorker(url: string): Worker {
  return new Worker(new URL(url, import.meta.url), { type: "module" });
}

const monacoEnvironment = {
  getWorker(_: string, label: string): Worker {
    if (label === "json") {
      return createWorker("monaco-editor/esm/vs/language/json/json.worker.js");
    }
    if (label === "css" || label === "scss" || label === "less") {
      return createWorker("monaco-editor/esm/vs/language/css/css.worker.js");
    }
    if (label === "html" || label === "handlebars" || label === "razor") {
      return createWorker("monaco-editor/esm/vs/language/html/html.worker.js");
    }
    if (label === "typescript" || label === "javascript") {
      return createWorker("monaco-editor/esm/vs/language/typescript/ts.worker.js");
    }
    return createWorker("monaco-editor/esm/vs/editor/editor.worker.js");
  },
};

const globalScope = self as typeof self & {
  MonacoEnvironment?: typeof monacoEnvironment;
};

Object.assign(globalScope, { MonacoEnvironment: monacoEnvironment });

loader.config({
  monaco,
});

function defineThemes(instance: typeof monaco) {
  instance.editor.defineTheme("cmux-light", {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "diffEditor.unchangedRegionBackground": "#f4f4f5",
      "diffEditor.unchangedRegionForeground": "#52525b",
      "diffEditor.unchangedRegionShadow": "#0f172a33",
    },
  });

  instance.editor.defineTheme("cmux-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "diffEditor.unchangedRegionBackground": "#27272a",
      "diffEditor.unchangedRegionForeground": "#e5e5e5",
      "diffEditor.unchangedRegionShadow": "#00000080",
    },
  });
}

export const loaderInitPromise = new Promise<typeof monaco>((resolve) => {
  loader.init().then((instance) => {
    defineThemes(instance);
    resolve(instance);
  });
});
