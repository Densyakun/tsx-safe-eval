import { addFullText, evalSyntaxList, getFromSourceFile } from '../src/index';
import { Project } from 'ts-morph';

describe('README.md usage', () => {
  it('should evaluate expression from README correctly', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile("test.ts", "export const a = 1 + 2;");
    const sourceFileJson = getFromSourceFile(sourceFile);

    const variables = [{}]; // スコープ
    const modules = {};    // インポート可能なモジュール

    const result = evalSyntaxList(sourceFileJson.syntaxList, variables, modules);
    expect(result!.exports!.object!.a).toBe(3);
  });

  it('JSDoc ts-morph', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const fullText = `/**
 * @argument a ${`a`}
 */
function a(a) {}`;
    const sourceFile = project.createSourceFile("test.ts", fullText);
    const sourceFileJson = getFromSourceFile(sourceFile);

    const printedFullText = addFullText(sourceFileJson.syntaxList.children, undefined, undefined, sourceFileJson.commentRangesAtEndOfFile, sourceFileJson.whitespaces);
    expect(printedFullText).toBe(fullText);
  });
});
