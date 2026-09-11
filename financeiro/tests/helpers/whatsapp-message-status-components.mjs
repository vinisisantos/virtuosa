import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import * as messageStatus from "../../src/lib/whatsapp/message-status.ts";

const require = createRequire(import.meta.url);
export const inboxSource = readFileSync(new URL("../../src/app/crm/inbox/page.tsx", import.meta.url), "utf8");

function compileComponent(source, dependencies = {}) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  });
  const module = { exports: {} };
  const resolve = (specifier) => dependencies[specifier] ?? require(specifier);
  new Function("require", "module", "exports", outputText)(resolve, module, module.exports);
  return module.exports;
}

export const { MessageStatusIcon } = compileComponent(
  readFileSync(new URL("../../src/components/whatsapp/message-status-icon.tsx", import.meta.url), "utf8"),
  { "@/lib/whatsapp/message-status": messageStatus },
);

const inboxAst = ts.createSourceFile("inbox.tsx", inboxSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function functionSource(name) {
  const declaration = inboxAst.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!declaration) throw new Error(`Função ${name} não encontrada no Inbox`);
  return declaration.getText(inboxAst);
}

// Exercise the actual private timestamp without importing the entire browser page.
export const { MessageTimestamp } = compileComponent(
  `import { MessageStatusIcon } from "./status-icon";\n${functionSource("formatMessageTime")}\nexport ${functionSource("MessageTimestamp")}`,
  { "./status-icon": { MessageStatusIcon } },
);
