import { evalSyntaxList, ModuleExportsType, ModuleType } from "./sourcefile/eval";
import { TSSourceFilesJSONType } from "./sourcefile/types";
import { getSourceFilePathByResolvingModule } from "./resolve";
import { TSConfig } from "./types";

// TODO Node.jsやブラウザで参照可能な変数をすべて追加
export function getNewVariables(): { [key: string]: any; }[] {
  return [{
    "console": {
      error: console.error,
      log: console.log,
      warn: console.warn,
    },
    "Object": {
      keys: Object.keys,
      values: Object.values,
    },
    "setTimeout": setTimeout,
  }];
}

export function evalModule(
  sourceFilesJSON: TSSourceFilesJSONType,
  modules: { [filePath: string]: ModuleType },
  filePath: string,
  customVariables: { [key: string]: any }[] = getNewVariables(),
  tsConfig: TSConfig = {}
): ModuleExportsType | undefined {
  if (modules[filePath]) return modules[filePath].exports;

  const module: ModuleType = { isInitializing: true, exports: { object: {} } };
  modules[filePath] = module;

  const getModuleFunc = (moduleName: string) => {
    const resolvedPath = getSourceFilePathByResolvingModule(
      moduleName,
      filePath,
      tsConfig,
      Object.keys(sourceFilesJSON)
    );

    if (!resolvedPath) throw new Error(`Module not found: ${moduleName}`);

    if (modules[resolvedPath]) return modules[resolvedPath];

    evalModule(sourceFilesJSON, modules, resolvedPath, customVariables, tsConfig);
    return modules[resolvedPath];
  };

  const variables = [...customVariables, { __module: module }];

  try {
    const res = evalSyntaxList(sourceFilesJSON[filePath].syntaxList, variables, getModuleFunc);
    module.isInitializing = false;
    return module.exports = res.exports;
  } catch (e) {
    // console.error(`Error evaluating module ${filePath}:`, e);
    throw e;
  }
}
