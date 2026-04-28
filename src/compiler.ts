import { Node, SourceFile, SyntaxKind, SyntaxList } from 'ts-morph';
import { TSNodeType, TSSourceFileType, TSSyntaxListType, TSTextNodeType } from './type';

export function getChildrenOtherThanComments(node: Node) {
  // コメントが重複しないよう、コメントノードを除く
  return node.getChildren().filter(child =>
    child.getKind() !== SyntaxKind.SingleLineCommentTrivia
    && child.getKind() !== SyntaxKind.MultiLineCommentTrivia
    && child.getKind() !== SyntaxKind.JSDoc
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
    node.children.forEach(child => start = child.kind === SyntaxKind.SyntaxList
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
    kind: syntaxList.getKind() as SyntaxKind.SyntaxList,
    children: children.map(child => getFromNotSyntaxList(child)),
  };
}

export function getFromNotSyntaxList(node: Node): TSNodeType | TSTextNodeType {
  const kind = node.getKind();

  const children = getChildrenOtherThanComments(node);

  if (children.length)
    return {
      kind,
      children: children.map(child =>
        child.isKind(SyntaxKind.SyntaxList)
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

export function isTSTextNodeByKind(kind: SyntaxKind) {
  // typescriptライブラリのバージョンにより値が異なるため、必ずSyntaxKindのキーを参照する
  switch (kind) {
    case SyntaxKind.Unknown:
    case SyntaxKind.EndOfFileToken:
    case SyntaxKind.SingleLineCommentTrivia:
    case SyntaxKind.MultiLineCommentTrivia:
    case SyntaxKind.NewLineTrivia:
    case SyntaxKind.WhitespaceTrivia:
    case SyntaxKind.ShebangTrivia:
    case SyntaxKind.ConflictMarkerTrivia:
    case SyntaxKind.NonTextFileMarkerTrivia:
    case SyntaxKind.NumericLiteral:
    case SyntaxKind.BigIntLiteral:
    case SyntaxKind.StringLiteral:
    case SyntaxKind.JsxText:
    case SyntaxKind.JsxTextAllWhiteSpaces:
    case SyntaxKind.RegularExpressionLiteral:
    case SyntaxKind.NoSubstitutionTemplateLiteral:
    case SyntaxKind.TemplateHead:
    case SyntaxKind.TemplateMiddle:
    case SyntaxKind.TemplateTail:
    case SyntaxKind.OpenBraceToken:
    case SyntaxKind.CloseBraceToken:
    case SyntaxKind.OpenParenToken:
    case SyntaxKind.CloseParenToken:
    case SyntaxKind.OpenBracketToken:
    case SyntaxKind.CloseBracketToken:
    case SyntaxKind.DotToken:
    case SyntaxKind.DotDotDotToken:
    case SyntaxKind.SemicolonToken:
    case SyntaxKind.CommaToken:
    case SyntaxKind.QuestionDotToken:
    case SyntaxKind.LessThanToken:
    case SyntaxKind.LessThanSlashToken:
    case SyntaxKind.GreaterThanToken:
    case SyntaxKind.LessThanEqualsToken:
    case SyntaxKind.GreaterThanEqualsToken:
    case SyntaxKind.EqualsEqualsToken:
    case SyntaxKind.ExclamationEqualsToken:
    case SyntaxKind.EqualsEqualsEqualsToken:
    case SyntaxKind.ExclamationEqualsEqualsToken:
    case SyntaxKind.EqualsGreaterThanToken:
    case SyntaxKind.PlusToken:
    case SyntaxKind.MinusToken:
    case SyntaxKind.AsteriskToken:
    case SyntaxKind.AsteriskAsteriskToken:
    case SyntaxKind.SlashToken:
    case SyntaxKind.PercentToken:
    case SyntaxKind.PlusPlusToken:
    case SyntaxKind.MinusMinusToken:
    case SyntaxKind.LessThanLessThanToken:
    case SyntaxKind.GreaterThanGreaterThanToken:
    case SyntaxKind.GreaterThanGreaterThanGreaterThanToken:
    case SyntaxKind.AmpersandToken:
    case SyntaxKind.BarToken:
    case SyntaxKind.CaretToken:
    case SyntaxKind.ExclamationToken:
    case SyntaxKind.TildeToken:
    case SyntaxKind.AmpersandAmpersandToken:
    case SyntaxKind.BarBarToken:
    case SyntaxKind.QuestionToken:
    case SyntaxKind.ColonToken:
    case SyntaxKind.AtToken:
    case SyntaxKind.QuestionQuestionToken:
    case SyntaxKind.BacktickToken:
    case SyntaxKind.HashToken:
    case SyntaxKind.EqualsToken:
    case SyntaxKind.PlusEqualsToken:
    case SyntaxKind.MinusEqualsToken:
    case SyntaxKind.AsteriskEqualsToken:
    case SyntaxKind.AsteriskAsteriskEqualsToken:
    case SyntaxKind.SlashEqualsToken:
    case SyntaxKind.PercentEqualsToken:
    case SyntaxKind.LessThanLessThanEqualsToken:
    case SyntaxKind.GreaterThanGreaterThanEqualsToken:
    case SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken:
    case SyntaxKind.AmpersandEqualsToken:
    case SyntaxKind.BarEqualsToken:
    case SyntaxKind.BarBarEqualsToken:
    case SyntaxKind.AmpersandAmpersandEqualsToken:
    case SyntaxKind.QuestionQuestionEqualsToken:
    case SyntaxKind.CaretEqualsToken:
    case SyntaxKind.Identifier:
    case SyntaxKind.PrivateIdentifier:
    case SyntaxKind.BreakKeyword:
    case SyntaxKind.CaseKeyword:
    case SyntaxKind.CatchKeyword:
    case SyntaxKind.ClassKeyword:
    case SyntaxKind.ConstKeyword:
    case SyntaxKind.ContinueKeyword:
    case SyntaxKind.DebuggerKeyword:
    case SyntaxKind.DefaultKeyword:
    case SyntaxKind.DeleteKeyword:
    case SyntaxKind.DoKeyword:
    case SyntaxKind.ElseKeyword:
    case SyntaxKind.EnumKeyword:
    case SyntaxKind.ExportKeyword:
    case SyntaxKind.ExtendsKeyword:
    case SyntaxKind.FalseKeyword:
    case SyntaxKind.FinallyKeyword:
    case SyntaxKind.ForKeyword:
    case SyntaxKind.FunctionKeyword:
    case SyntaxKind.IfKeyword:
    case SyntaxKind.ImportKeyword:
    case SyntaxKind.InKeyword:
    case SyntaxKind.InstanceOfKeyword:
    case SyntaxKind.NewKeyword:
    case SyntaxKind.NullKeyword:
    case SyntaxKind.ReturnKeyword:
    case SyntaxKind.SuperKeyword:
    case SyntaxKind.SwitchKeyword:
    case SyntaxKind.ThisKeyword:
    case SyntaxKind.ThrowKeyword:
    case SyntaxKind.TrueKeyword:
    case SyntaxKind.TryKeyword:
    case SyntaxKind.TypeOfKeyword:
    case SyntaxKind.VarKeyword:
    case SyntaxKind.VoidKeyword:
    case SyntaxKind.WhileKeyword:
    case SyntaxKind.WithKeyword:
    case SyntaxKind.ImplementsKeyword:
    case SyntaxKind.InterfaceKeyword:
    case SyntaxKind.LetKeyword:
    case SyntaxKind.PackageKeyword:
    case SyntaxKind.PrivateKeyword:
    case SyntaxKind.ProtectedKeyword:
    case SyntaxKind.PublicKeyword:
    case SyntaxKind.StaticKeyword:
    case SyntaxKind.YieldKeyword:
    case SyntaxKind.AbstractKeyword:
    case SyntaxKind.AccessorKeyword:
    case SyntaxKind.AsKeyword:
    case SyntaxKind.AssertsKeyword:
    case SyntaxKind.AssertKeyword:
    case SyntaxKind.AnyKeyword:
    case SyntaxKind.AsyncKeyword:
    case SyntaxKind.AwaitKeyword:
    case SyntaxKind.BooleanKeyword:
    case SyntaxKind.ConstructorKeyword:
    case SyntaxKind.DeclareKeyword:
    case SyntaxKind.GetKeyword:
    case SyntaxKind.InferKeyword:
    case SyntaxKind.IntrinsicKeyword:
    case SyntaxKind.IsKeyword:
    case SyntaxKind.KeyOfKeyword:
    case SyntaxKind.ModuleKeyword:
    case SyntaxKind.NamespaceKeyword:
    case SyntaxKind.NeverKeyword:
    case SyntaxKind.OutKeyword:
    case SyntaxKind.ReadonlyKeyword:
    case SyntaxKind.RequireKeyword:
    case SyntaxKind.NumberKeyword:
    case SyntaxKind.ObjectKeyword:
    case SyntaxKind.SatisfiesKeyword:
    case SyntaxKind.SetKeyword:
    case SyntaxKind.StringKeyword:
    case SyntaxKind.SymbolKeyword:
    case SyntaxKind.TypeKeyword:
    case SyntaxKind.UndefinedKeyword:
    case SyntaxKind.UniqueKeyword:
    case SyntaxKind.UnknownKeyword:
    case SyntaxKind.UsingKeyword:
    case SyntaxKind.FromKeyword:
    case SyntaxKind.GlobalKeyword:
    case SyntaxKind.BigIntKeyword:
    case SyntaxKind.OverrideKeyword:
    case SyntaxKind.OfKeyword:
      return true;
    default:
      return false;
  }
}
