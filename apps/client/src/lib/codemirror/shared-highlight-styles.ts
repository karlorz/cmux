import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/**
 * Dark theme syntax highlighting style shared across CodeMirror editors.
 */
export const darkHighlightStyle = HighlightStyle.define([
  {
    tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.moduleKeyword],
    color: "#f472b6",
  },
  {
    tag: [t.typeName, t.className, t.tagName, t.attributeName],
    color: "#38bdf8",
  },
  {
    tag: [t.string, t.special(t.string), t.character],
    color: "#fbbf24",
  },
  {
    tag: [t.number, t.bool, t.null, t.atom],
    color: "#facc15",
  },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName)],
    color: "#c4b5fd",
  },
  {
    tag: t.propertyName,
    color: "#5eead4",
  },
  {
    tag: t.comment,
    color: "#9ca3af",
    fontStyle: "italic",
  },
  {
    tag: [t.operator, t.punctuation],
    color: "#fb7185",
  },
]);
