# tsx-safe-eval

TSXコードの文字列を安全に（`eval`を使わずに）動的実行するためのランタイムのライブラリです。 `eval()` や `new Function()` を使用しないため、比較的安全です。 `ts-morph` を使用して抽象構文木（AST）を解析し、独自のインタプリタで実行します。

## 機能

- コーディングスタイルを完全に保持するソースファイルのJSONデータ構造 (AST)
- ソースファイルのASTコード文字列とJSONの変換（コンパイル）
- JSONで定義されたソースファイルのスクリプト実行

## インストール

```bash
npm install tsx-safe-eval
```

## 使い方

```typescript
import { evalSyntaxList, getFromSourceFile } from 'tsx-safe-eval';
import { Project } from 'ts-morph';

const project = new Project({ useInMemoryFileSystem: true });
const sourceFile = project.createSourceFile("test.ts", "export const a = 1 + 2;");
const sourceFileJson = getFromSourceFile(sourceFile);

const variables = [{}]; // スコープ
const modules = {};    // インポート可能なモジュール

const result = evalSyntaxList(sourceFileJson.syntaxList, variables, modules);
console.log(result.exports.object.a); // 3
```
