const ts = require('typescript');
const fs = require('fs');
const filePath = 'src/app/protocols/page.tsx';
const source = fs.readFileSync(filePath, 'utf8');
const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram({ rootNames: [filePath], options: { jsx: ts.JsxEmit.ReactJSX } }));
for (const diagnostic of diagnostics) {
  const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  console.log(`${diagnostic.messageText} at ${line + 1}:${character + 1}`);
}
