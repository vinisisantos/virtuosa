import * as ts from 'typescript';
import * as fs from 'fs';
const sourceFile = ts.createSourceFile('page.tsx', fs.readFileSync('financeiro/src/app/crm/inbox/page.tsx', 'utf8'), ts.ScriptTarget.Latest, true);
function traverse(node) {
    if (node.kind === ts.SyntaxKind.JsxElement) {
        const start = ts.getLineAndCharacterOfPosition(sourceFile, node.getStart());
        const end = ts.getLineAndCharacterOfPosition(sourceFile, node.getEnd());
        // console.log(`JSXElement at ${start.line + 1}`);
    }
    ts.forEachChild(node, traverse);
}
traverse(sourceFile);
