import { createArrayWithOnlyFirstKey } from 'i-want-to-go-home';
import { Node, SourceFile, SyntaxKind, SyntaxList } from 'ts-morph';
import { TSNodeType, TSSourceFileType, TSSyntaxListType, TSTextNodeType, TSTextNodeKindString, TSTextNodeKindArray } from './types';

export const FirstKindNames = createArrayWithOnlyFirstKey(SyntaxKind);

export function getChildrenOtherThanComments(node: Node) {
  // コメントが重複しないよう、コメントノードを除く
  return node.getChildren().filter(child =>
    child.getKindName() !== "SingleLineCommentTrivia"
    && child.getKindName() !== "MultiLineCommentTrivia"
    && child.getKindName() !== "JSDoc"
  );
}

function addWhitespacesToSourceFile(sourceFileFullText: string, node: TSSourceFileType, start = 0) {
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

function addWhitespacesToNode(sourceFileFullText: string, node: TSNodeType, start = 0) {
  if (node.children)
    node.children.forEach(child => start = child.kind === "SyntaxList"
      ? addWhitespacesToSyntaxList(sourceFileFullText, child as TSSyntaxListType, start)
      : !isTSTextNode(child)
        ? addWhitespacesToNode(sourceFileFullText, child, start)
        : addWhitespacesToTextNode(sourceFileFullText, child as TSTextNodeType, start)
    );

  return start;
}

function addWhitespacesToSyntaxList(sourceFileFullText: string, node: TSSyntaxListType, start = 0) {
  node.children.forEach(child => start = !isTSTextNode(child)
    ? addWhitespacesToNode(sourceFileFullText, child, start)
    : addWhitespacesToTextNode(sourceFileFullText, child as TSTextNodeType, start)
  );
  return start;
}

function addWhitespacesToTextNode(sourceFileFullText: string, node: TSTextNodeType, start = 0) {
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

export function getFromSourceFile(sourceFile: SourceFile): TSSourceFileType {
  const children = sourceFile.getChildren();

  const syntaxList = getFromSyntaxList(children[0] as SyntaxList);

  const commentRangesAtEndOfFile = children[1].getLeadingCommentRanges().map(commentRange => commentRange.getText());

  const sourceFileJson: TSSourceFileType = {
    syntaxList,
    commentRangesAtEndOfFile,
    whitespaces: [],
  };

  addWhitespacesToSourceFile(sourceFile.getFullText(), sourceFileJson);

  return sourceFileJson;
}

export function setToSourceFile(sourceFile: SourceFile, json: TSSourceFileType) {
  const oldFullText = sourceFile.getFullText();

  const fullText = addFullText(json.syntaxList.children, undefined, undefined, json.commentRangesAtEndOfFile, json.whitespaces);
  if (oldFullText !== fullText) {
    sourceFile.set({ statements: [] });
    sourceFile.replaceWithText(fullText);
  }
}

export function addFullText(children?: (TSNodeType | TSTextNodeType)[], leadingCommentRanges?: string[], text?: string, trailingCommentRanges?: string[], whitespaces?: string[], fullText = "") {
  if (children)
    children.forEach(child => fullText = child.children.length
      ? addFullText(child.children, undefined, undefined, undefined, undefined, fullText)
      : addFullText(child.children, (child as TSTextNodeType).leadingCommentRanges, (child as TSTextNodeType).text, (child as TSTextNodeType).trailingCommentRanges, (child as TSTextNodeType).whitespaces, fullText)
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

export function getFromSyntaxList(syntaxList: SyntaxList): TSSyntaxListType {
  // 次の兄弟要素と重複するため、leadingCommentRangesは含まない
  const children = getChildrenOtherThanComments(syntaxList);

  return {
    kind: "SyntaxList",
    children: children.map(child => getFromNotSyntaxList(child)),
  };
}

export function getFromNotSyntaxList(node: Node): TSNodeType | TSTextNodeType {
  const kind = FirstKindNames[node.getKind()];

  const children = getChildrenOtherThanComments(node);

  if (children.length)
    return {
      kind,
      children: children.map(child =>
        child.getKindName() === "SyntaxList"
          ? getFromSyntaxList(child as SyntaxList)
          : getFromNotSyntaxList(child)),
    } as TSNodeType;

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
  } as TSTextNodeType;
}

export function isTSTextNode(node: TSNodeType | TSTextNodeType): node is TSTextNodeType {
  /*return (
    typeof (node as TSTextNodeType).text === "string" &&
    Array.isArray((node as TSTextNodeType).leadingCommentRanges) &&
    Array.isArray((node as TSTextNodeType).trailingCommentRanges) &&
    Array.isArray((node as TSTextNodeType).whitespaces)
  );*/
  return isTSTextNodeByKind(node.kind);
}

export function isTSTextNodeByKind(kind: string): kind is TSTextNodeKindString {
  return (TSTextNodeKindArray as readonly string[]).includes(kind);
}
