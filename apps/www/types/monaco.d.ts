declare module "monaco-editor/esm/vs/editor/editor.worker?worker" {
  const EditorWorker: { new (): Worker };
  export default EditorWorker;
}

declare module "monaco-editor/esm/vs/language/css/css.worker?worker" {
  const CssWorker: { new (): Worker };
  export default CssWorker;
}

declare module "monaco-editor/esm/vs/language/html/html.worker?worker" {
  const HtmlWorker: { new (): Worker };
  export default HtmlWorker;
}

declare module "monaco-editor/esm/vs/language/json/json.worker?worker" {
  const JsonWorker: { new (): Worker };
  export default JsonWorker;
}

declare module "monaco-editor/esm/vs/language/typescript/ts.worker?worker" {
  const TsWorker: { new (): Worker };
  export default TsWorker;
}
