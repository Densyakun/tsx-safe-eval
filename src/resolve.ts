import path from 'path-browserify';
import { TSConfig } from './types';

/**
 * tsconfigに合わせてモジュールを解決して、モジュール名からソースファイルパスを求める
 * @param moduleName モジュール名
 * @param sourceFilePath 参照元のソースファイルパス
 * @param tsConfig tsConfig
 * @param sourceFilePaths ソースファイルパスの配列
 * @param packageTypeIsModule package.jsonのtypeフィールドの値がmoduleであるかどうか
 * @param allowImportTsByJs JSのファイルからTSのファイルをインポートできるかどうか。一部のランタイムとトランスパイラで使用する
 * @returns ソースファイルパス
 */
export function getSourceFilePathByResolvingModule(
  moduleName: string,
  sourceFilePath: string,
  tsConfig: TSConfig,
  sourceFilePaths: string[],
  packageTypeIsModule = false,
  allowImportTsByJs = false
) {
  // TODO tsConfig.extends
  // TODO 参照されていない引数のエラーを回避
  tsConfig;
  packageTypeIsModule;
  // TODO compilerOptions.paths
  // TODO compilerOptions.baseUrl
  // TODO Project References
  // TODO moduleResolution

  // モジュール名に拡張子が付いている場合
  const dirPath = path.dirname(sourceFilePath);
  if (path.extname(moduleName) !== "") return path.join(dirPath, moduleName);

  // 拡張子を省略したモジュール名から実際のファイルパスを求める
  /*const importModeIsEsm = (tsConfig.compilerOptions.module === "nodenext" || tsConfig.compilerOptions.module === "node16")
    ? packageTypeIsModule
    : tsConfig.compilerOptions.moduleResolution !== "node16" && tsConfig.compilerOptions.moduleResolution !== "nodenext";*/
  const importModeIsEsm = true;

  const ext = path.parse(sourceFilePath).ext;
  const importByTs = ext !== "mjs" && ext !== "cjs" && ext !== "js" && ext !== "jsx";

  //const jsx = tsConfig.compilerOptions.jsx;
  const jsx = "react-jsx";
  const allowJsx = /*jsx === "preserve" || jsx === "react" || */jsx === "react-jsx";

  return getSourceFilePathA(
    sourceFilePaths,
    dirPath,
    moduleName,
    importModeIsEsm,
    importByTs,
    allowJsx,
    allowImportTsByJs
  )
    || getSourceFilePathA(
      sourceFilePaths,
      dirPath,
      moduleName + "/index",
      importModeIsEsm,
      importByTs,
      allowJsx,
      allowImportTsByJs
    );
}

function getSourceFilePathA(
  sourceFilePaths: string[],
  dirPath: string,
  modulePath: string,
  importModeIsEsm: boolean,
  importByTs: boolean,
  allowJsx: boolean,
  allowImportTsByJs: boolean
) {
  let p = "";

  if (importByTs || allowImportTsByJs) {
    if (importModeIsEsm) {
      if (p = getSourceFilePathB(sourceFilePaths, path.join(dirPath, modulePath + ".mts")))
        return p;
    } else if (p = getSourceFilePathB(sourceFilePaths, path.join(dirPath, modulePath + ".cts")))
      return p;

    if (p = getSourceFilePathB(sourceFilePaths, path.join(dirPath, modulePath + ".ts")))
      return p;

    if (allowJsx)
      if (p = getSourceFilePathB(sourceFilePaths, path.join(dirPath, modulePath + ".tsx")))
        return p;

    if (importByTs) {
      if (importModeIsEsm) {
        if (p = getSourceFilePathB(sourceFilePaths, path.join(dirPath, modulePath + ".d.mts")))
          return p;
      } else if (p = getSourceFilePathB(sourceFilePaths, path.join(dirPath, modulePath + ".d.cts")))
        return p;
      if (p = getSourceFilePathB(sourceFilePaths, path.join(dirPath, modulePath + ".d.ts")))
        return p;
    }
  }

  //const allowJs = tsConfig.compilerOptions.allowJs;
  const allowJs = false;

  if (allowJs) {
    if (importModeIsEsm) {
      if (p = getSourceFilePathB(sourceFilePaths, path.join(dirPath, modulePath + ".mjs")))
        return p;
    } else if (p = getSourceFilePathB(sourceFilePaths, path.join(dirPath, modulePath + ".cjs")))
      return p;
    if (p = getSourceFilePathB(sourceFilePaths, path.join(dirPath, modulePath + ".js")))
      return p;
    if (allowJsx)
      if (p = getSourceFilePathB(sourceFilePaths, path.join(dirPath, modulePath + ".jsx")))
        return p;
  }

  return p;
}

function getSourceFilePathB(sourceFilePaths: string[], path: string) {
  const res = sourceFilePaths.includes(path);
  return res ? path : "";
}
