import { loader } from "@monaco-editor/react";

import * as monaco from "monaco-editor";
import "monaco-editor/esm/vs/editor/editor.all";
import "monaco-editor/esm/vs/editor/browser/services/hoverService/hoverService";

import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

import { GITHUB_DIFF_COLORS } from "./diff-colors";

const monacoEnvironment = {
  getWorker(_: string, label: string): Worker {
    if (label === "json") {
      return new jsonWorker();
    }
    if (label === "css" || label === "scss" || label === "less") {
      return new cssWorker();
    }
    if (label === "html" || label === "handlebars" || label === "razor") {
      return new htmlWorker();
    }
    if (label === "typescript" || label === "javascript") {
      return new tsWorker();
    }
    return new editorWorker();
  },
};

Object.assign(self, { MonacoEnvironment: monacoEnvironment });

loader.config({
  monaco,
});

function defineThemes(instance: typeof monaco) {
  const lightDiff = GITHUB_DIFF_COLORS.light;
  const darkDiff = GITHUB_DIFF_COLORS.dark;

  instance.editor.defineTheme("cmux-light", {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "diffEditor.unchangedRegionBackground": "#f4f4f5",
      "diffEditor.unchangedRegionForeground": "#52525b",
      "diffEditor.unchangedRegionShadow": "#0f172a33",
      "diffEditor.insertedTextBackground": lightDiff.addition.text,
      "diffEditor.removedTextBackground": lightDiff.deletion.text,
      "diffEditor.insertedLineBackground": lightDiff.addition.line,
      "diffEditor.removedLineBackground": lightDiff.deletion.line,
      "diffEditorGutter.insertedLineBackground": lightDiff.addition.gutter,
      "diffEditorGutter.removedLineBackground": lightDiff.deletion.gutter,
      "diffEditorOverview.insertedForeground": lightDiff.addition.line,
      "diffEditorOverview.removedForeground": lightDiff.deletion.line,
      "editorGutter.addedBackground": lightDiff.addition.gutter,
      "editorGutter.deletedBackground": lightDiff.deletion.gutter,
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
      "diffEditor.insertedTextBackground": darkDiff.addition.text,
      "diffEditor.removedTextBackground": darkDiff.deletion.text,
      "diffEditor.insertedLineBackground": darkDiff.addition.line,
      "diffEditor.removedLineBackground": darkDiff.deletion.line,
      "diffEditorGutter.insertedLineBackground": darkDiff.addition.gutter,
      "diffEditorGutter.removedLineBackground": darkDiff.deletion.gutter,
      "diffEditorOverview.insertedForeground": darkDiff.addition.line,
      "diffEditorOverview.removedForeground": darkDiff.deletion.line,
      "editorGutter.addedBackground": darkDiff.addition.gutter,
      "editorGutter.deletedBackground": darkDiff.deletion.gutter,
    },
  });
}

export const loaderInitPromise = new Promise<typeof monaco>((resolve) => {
  loader.init().then((instance) => {
    defineThemes(instance);
    resolve(instance);
  });
});
