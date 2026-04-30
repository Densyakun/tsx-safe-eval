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

## プロジェクトの読み込み・保存 (Project API)

本ライブラリは、スタンドアロン（Node.js環境）および非スタンドアロン（ブラウザ環境）の両方でディレクトリからのプロジェクトの読み込みや保存をサポートします。環境に合わせて `path` モジュールと `ts-morph` の `ProjectOptions` を渡すことができます。

### スタンドアロン環境 (Node.js) での使い方

Node.jsの標準モジュールである `path` をコンテキストとして渡すことで、実際のファイルシステムを対象に読み書きします。ファイルシステム操作自体は `ts-morph` 側の FileSystemHost を利用して自動的に処理されます。

```typescript
import { loadProject, ProjectContext } from 'tsx-safe-eval';
import path from 'path';

const context: ProjectContext = {
  path: path,
  // 必要な場合は ts-morph の ProjectOptions を渡すことができます
  // projectOptions: { compilerOptions: { ... } }
};

async function main() {
  const projectData = await loadProject('./project/tsconfig.json', context);
  console.log(projectData);
}
```

### ブラウザ環境での使い方

ブラウザ環境ではネイティブのファイルシステム操作ができないため、`path-browserify` などのパス操作モジュールと、`ts-morph` のインメモリファイルシステム（またはカスタムファイルシステム）を組み合わせて使用します。

```typescript
import { loadProject, ProjectContext } from 'tsx-safe-eval';
import path from 'path-browserify';

const context: ProjectContext = {
  path: path,
  projectOptions: {
    useInMemoryFileSystem: true // メモリ上でファイルシステムをエミュレートする
  }
};

async function main() {
  const projectData = await loadProject('/project/tsconfig.json', context);
  console.log(projectData);
}
```
