import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const USER_FACING = new Set(["aria-label", "title", "alt", "placeholder", "aria-description"]);
const CJK = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u3040-\u30FF\u3400-\u9FFF]/u;
const LETTER = /\p{L}/u;

export function findHardcodedUiStrings(fileName: string, sourceText: string): string[] {
  const source = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const hits: string[] = [];

  function lineOf(node: ts.Node): number {
    return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  }

  function visit(node: ts.Node) {
    if (ts.isJsxText(node)) {
      const text = node.getText(source);
      if (LETTER.test(text)) {
        hits.push(`${fileName}:${lineOf(node)} jsx text ${JSON.stringify(text.trim())}`);
      }
    }
    if (
      ts.isJsxAttribute(node) &&
      ts.isIdentifier(node.name) &&
      USER_FACING.has(node.name.text) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      LETTER.test(node.initializer.text)
    ) {
      hits.push(
        `${fileName}:${lineOf(node)} ${node.name.text} ${JSON.stringify(node.initializer.text)}`,
      );
    }
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      CJK.test(node.text)
    ) {
      hits.push(`${fileName}:${lineOf(node)} literal ${JSON.stringify(node.text)}`);
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return hits;
}

export function isScannedUiFile(name: string): boolean {
  return (
    /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !/\.stories\.tsx?$/.test(name)
  );
}

export function scanUiTree(root: string): string[] {
  const hits: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!isScannedUiFile(entry)) {
        continue;
      }
      hits.push(...findHardcodedUiStrings(path, readFileSync(path, "utf8")));
    }
  }
  walk(root);
  return hits;
}
