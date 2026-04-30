import { TSSourceFilesJSONType } from "./sourcefile/types";

export type TSProjectType = {
  sourceFiles: TSSourceFilesJSONType;
  tsConfig: TSConfig;
  referencedProjects: TSReferencedProjectsType;
};

export type TSReferencedProjectsType = {
  [tsConfigFilePath: string]: TSProjectType;
};

export type TSConfig = {
  references?: {
    path: string;
  }[];
  include?: string[];
  // TODO 小文字にしたcompilerOptions.module,compilerOptions.moduleResolutionを追加する
  // TODO compilerOptions.jsx,compilerOptions.allowJsを追加する
};
