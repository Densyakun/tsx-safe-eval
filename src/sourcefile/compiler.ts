import { createArrayWithOnlyFirstKey } from 'i-want-to-go-home';
import { Node, SourceFile, SyntaxKind, SyntaxList } from 'ts-morph';
import { TSNodeJSONType, TSSourceFileJSONType, TSSyntaxListJSONType, TSTextNodeJSONType, TSTextNodeKindString, TSTextNodeKindArray } from './types';

export const FirstKindNames = createArrayWithOnlyFirstKey(SyntaxKind);

export function getChildrenOtherThanComments(node: Node) {
  // コメントが重複しないよう、コメントノードを除く
  return node.getChildren().filter(child =>
    child.getKindName() !== "SingleLineCommentTrivia"
    && child.getKindName() !== "MultiLineCommentTrivia"
    && child.getKindName() !== "JSDoc"
  );
}

function addWhitespacesToSourceFile(sourceFileFullText: string, node: TSSourceFileJSONType, start = 0) {
  start = addWhitespacesToSyntaxList(sourceFileFullText, node.syntaxList, start);

  node.commentRangesAtEndOfFile.forEach(commentRange => {
    const indexOf = sourceFileFullText.indexOf(commentRange, start);
    if (indexOf === -1) return;
    node.whitespaces.push(sourceFileFullText.substring(start, indexOf));
    start = indexOf + commentRange.length;
  });

  node.whitespaces.push(sourceFileFullText.substring(start));

  return start;
}

function addWhitespacesToNode(sourceFileFullText: string, node: TSNodeJSONType, start = 0) {
  if (node.children)
    node.children.forEach(child => start = child.kind === "SyntaxList"
      ? addWhitespacesToSyntaxList(sourceFileFullText, child as TSSyntaxListJSONType, start)
      : !isTSTextNode(child)
        ? addWhitespacesToNode(sourceFileFullText, child, start)
        : addWhitespacesToTextNode(sourceFileFullText, child as TSTextNodeJSONType, start)
    );

  return start;
}

function addWhitespacesToSyntaxList(sourceFileFullText: string, node: TSSyntaxListJSONType, start = 0) {
  node.children.forEach(child => start = !isTSTextNode(child)
    ? addWhitespacesToNode(sourceFileFullText, child, start)
    : addWhitespacesToTextNode(sourceFileFullText, child as TSTextNodeJSONType, start)
  );
  return start;
}

function addWhitespacesToTextNode(sourceFileFullText: string, node: TSTextNodeJSONType, start = 0) {
  if (node.text) {
    node.leadingCommentRanges?.forEach(commentRange => {
      const indexOf = sourceFileFullText.indexOf(commentRange, start);
      if (indexOf === -1) return;
      node.whitespaces!.push(sourceFileFullText.substring(start, indexOf));
      start = indexOf + commentRange.length;
    });

    const indexOf = sourceFileFullText.indexOf(node.text, start);
    node.whitespaces!.push(sourceFileFullText.substring(start, indexOf));
    start = indexOf + node.text.length;
  }

  node.trailingCommentRanges?.forEach(commentRange => {
    const indexOf = sourceFileFullText.indexOf(commentRange, start);
    if (indexOf === -1) return;
    node.whitespaces!.push(sourceFileFullText.substring(start, indexOf));
    start = indexOf + commentRange.length;
  });

  return start;
}

export function compileSourceFileToJSON(sourceFile: SourceFile): TSSourceFileJSONType {
  const children = sourceFile.getChildren();

  const syntaxList = compileSyntaxListToJSON(children[0] as SyntaxList);

  const commentRangesAtEndOfFile = children[1].getLeadingCommentRanges().map(commentRange => commentRange.getText());

  const sourceFileJson: TSSourceFileJSONType = {
    syntaxList,
    commentRangesAtEndOfFile,
    whitespaces: [],
  };

  addWhitespacesToSourceFile(sourceFile.getFullText(), sourceFileJson);

  return sourceFileJson;
}

export function applyJSONToSourceFile(sourceFile: SourceFile, json: TSSourceFileJSONType) {
  const oldFullText = sourceFile.getFullText();

  const fullText = generateTextFromJSON(json.syntaxList.children, undefined, undefined, json.commentRangesAtEndOfFile, json.whitespaces);
  if (oldFullText !== fullText) {
    sourceFile.set({ statements: [] });
    sourceFile.replaceWithText(fullText);
  }
}

export function generateTextFromJSON(children?: (TSNodeJSONType | TSTextNodeJSONType)[], leadingCommentRanges?: string[], text?: string, trailingCommentRanges?: string[], whitespaces?: string[], fullText = "") {
  if (children)
    children.forEach(child => fullText = child.children.length
      ? generateTextFromJSON(child.children, undefined, undefined, undefined, undefined, fullText)
      : generateTextFromJSON(child.children, (child as TSTextNodeJSONType).leadingCommentRanges, (child as TSTextNodeJSONType).text, (child as TSTextNodeJSONType).trailingCommentRanges, (child as TSTextNodeJSONType).whitespaces, fullText)
    );

  let whitespaceIndex = 0;

  if (text) {
    leadingCommentRanges?.forEach(commentRange => {
      fullText += whitespaces![whitespaceIndex] + commentRange;
      whitespaceIndex++;
    });

    fullText += whitespaces![whitespaceIndex] + text;
    whitespaceIndex++;
  }

  trailingCommentRanges?.forEach(commentRange => {
    fullText += whitespaces![whitespaceIndex] + commentRange;
    whitespaceIndex++;
  });

  if (whitespaces && whitespaceIndex < whitespaces.length)
    fullText += whitespaces![whitespaceIndex];

  return fullText;
}

export function compileSyntaxListToJSON(syntaxList: SyntaxList): TSSyntaxListJSONType {
  // 次の兄弟要素と重複するため、leadingCommentRangesは含まない
  const children = getChildrenOtherThanComments(syntaxList);

  return {
    kind: "SyntaxList",
    children: children.map(child => compileNotSyntaxListToJSON(child)),
  };
}

export function compileNotSyntaxListToJSON(node: Node): TSNodeJSONType | TSTextNodeJSONType {
  const kind = FirstKindNames[node.getKind()];

  const children = getChildrenOtherThanComments(node);

  if (children.length)
    return {
      kind,
      children: children.map(child =>
        child.getKindName() === "SyntaxList"
          ? compileSyntaxListToJSON(child as SyntaxList)
          : compileNotSyntaxListToJSON(child)),
    } as TSNodeJSONType;

  const text = node.getText();
  const leadingCommentRanges = node.getLeadingCommentRanges().map(commentRange => commentRange.getText());
  const trailingCommentRanges = node.getTrailingCommentRanges().map(commentRange => commentRange.getText());

  return {
    kind,
    children: [],
    text,
    leadingCommentRanges,
    trailingCommentRanges,
    whitespaces: [],
  } as TSTextNodeJSONType;
}

export function isTSTextNode(node: TSNodeJSONType | TSTextNodeJSONType): node is TSTextNodeJSONType {
  /*return (
    typeof (node as TSTextNodeJSONType).text === "string" &&
    Array.isArray((node as TSTextNodeJSONType).leadingCommentRanges) &&
    Array.isArray((node as TSTextNodeJSONType).trailingCommentRanges) &&
    Array.isArray((node as TSTextNodeJSONType).whitespaces)
  );*/
  return isTSTextNodeByKind(node.kind);
}

export function isTSTextNodeByKind(kind: string): kind is TSTextNodeKindString {
  return (TSTextNodeKindArray as readonly string[]).includes(kind);
}
