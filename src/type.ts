import { SyntaxKind } from "ts-morph";

export type TSNodeType = ({
  kind: SyntaxKind;
  children: (TSNodeType | TSTextNodeType)[];
});

export type TSTextNodeType = TSNodeType & ({
  children: never[];
  text: string;
  leadingCommentRanges: string[];
  trailingCommentRanges: string[];
  whitespaces: string[];
});

export type TSSyntaxListType = TSNodeType & {
  kind: SyntaxKind.SyntaxList;
};

export type TSSourceFileType = {
  syntaxList: TSSyntaxListType;
  commentRangesAtEndOfFile: string[];
  whitespaces: string[];
};

export type TSSourceFilesType = {
  [relativeFilePath: string]: TSSourceFileType;
};
