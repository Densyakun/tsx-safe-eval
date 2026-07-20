import type { TSNodeJSONType, TSTextNodeJSONType } from "./types";

// TODO varの再宣言と関数スコープ
// TODO false, true, null, this (Expressionとして対応)
// TODO undefined keyword (Identifier)
// TODO while, do...while, for-in, break, continue, ラベル付きブロック
// TODO Symbol.iterator
// TODO switch
// TODO throw, try/catch
// TODO クラス, クラス式, super, static, abstruct
// TODO 残余引数、デフォルト引数
// TODO 分割代入（Destructuring assignment - JavaScript | MDN より次の機能のみ実装済
// - Binding and assignment
// - Unpacking properties from objects passed as a function parameter
// TODO Async
// TODO delete, typeof, void, new, new.target
// TODO 正規表現リテラル, テンプレートリテラル
// TODO ゲッター, セッター
// TODO ジェネレーター関数, yield
// TODO 副作用の import
// TODO JavaScript 以外のモジュールのインポート、withキーワード
// TODO import(), インポート属性, import.meta
// TODO 最上位の await
// TODO var、let、const、function、function*、async function、async function*、classの巻き上げ
// TODO constへの再代入の禁止
// TODO デコレーター
// TODO プライベートプロパティ
// TODO Module Fragments
// TODO ジェネリクス
// TODO enum, const enum

export type ModuleType = { isInitializing: boolean, exports: ModuleExportsType };

export type ModuleExportsType = { default?: any, object?: { [key: string]: any } };

export type ExportAndReturnValueType = { exports: ModuleExportsType, value?: any };

export type GetModuleFuncType = (moduleName: string) => ModuleType;

export type VariableValueType = { get: () => any, set?: (value: any) => void, initialized: boolean };

export function declareVariable(variables: { [key: string]: any }[], name: string, isExport: boolean, exportProps: any) {
  if (name in variables[variables.length - 1]) return variables[variables.length - 1][name] as VariableValueType;

  let val: any;
  const variable: VariableValueType = {
    get: () => {
      if (!variable.initialized) throw new ReferenceError(`${name} is not initialized`);
      return val;
    },
    set: (v: any) => {
      val = v;
      variable.initialized = true;
    },
    initialized: false
  };
  variables[variables.length - 1][name] = variable;

  if (isExport) {
    Object.defineProperty(exportProps, name, {
      get: () => variable.get(),
      set: (v: any) => variable.set!(v),
      enumerable: true,
      configurable: true
    });
  }
  return variable;
}

export function evalVariableDeclarationList(variableDeclarationList: TSNodeJSONType, variables: { [key: string]: any }[], isExport = false, exportProps: { [key: string]: any } = {}) {
  const syntaxList = variableDeclarationList.children[1];
  for (let n = 0; n < syntaxList.children.length; n += 2) {
    const variableDeclaration = syntaxList.children[n] as TSNodeJSONType;

    // TODO ArrayBindingPattern
    if (variableDeclaration.children[0].kind === "Identifier") {
      const identifier = variableDeclaration.children[0] as TSTextNodeJSONType;
      const name = identifier.text;

      const variable = declareVariable(variables, name, isExport, exportProps);

      const initialValue = variableDeclaration.children.length === 1
        || variableDeclaration.children.length < 5 && variableDeclaration.children[1].kind === "ColonToken"
        ? undefined
        : evalExpression(variableDeclaration.children[3 < variableDeclaration.children.length ? 4 : 2], variables)?.value;

      variable.set!(initialValue);
    } else if (variableDeclaration.children[0].kind === "ObjectBindingPattern")
      evalObjectBindingPattern(
        variableDeclaration.children[0] as TSNodeJSONType,
        variables,
        evalExpression(variableDeclaration.children[3 < variableDeclaration.children.length ? 4 : 2], variables)?.value,
        exportProps,
        isExport
      );
  }

  return exportProps;
}

export function evalSyntax(syntax: TSTextNodeJSONType | TSNodeJSONType, variables: { [key: string]: any }[], getModuleFunc: GetModuleFuncType): ExportAndReturnValueType {
  if (syntax.kind === "VariableStatement") {
    let isExport = syntax.children[0].kind === "SyntaxList";
    const moduleScope = variables.find(s => s.__module) || variables[0];
    const exportProps = evalVariableDeclarationList(syntax.children[isExport ? 1 : 0] as TSNodeJSONType, variables, isExport, moduleScope.__module?.exports?.object || {});

    // TODO リテラルの値を正しく共有する
    return { exports: { object: exportProps } };
  } else if (syntax.kind === "ExpressionStatement") {
    evalExpression(syntax.children[0] as TSNodeJSONType, variables);
  } else if (syntax.kind === "IfStatement") {
    if (evalExpression(syntax.children[2] as TSNodeJSONType, variables)?.value) {
      const res = evalBlockOrSyntax(syntax.children[4] as TSNodeJSONType, variables);
      if (Object.keys(res).includes("value")) return res;
    } else if (syntax.children.length === 7)
      return evalBlockOrSyntax(syntax.children[6] as TSNodeJSONType, variables);
  } else if (syntax.kind === "ForStatement") {
    variables.push({});

    if (syntax.children[2].kind === "VariableDeclarationList")
      evalVariableDeclarationList(syntax.children[2] as TSNodeJSONType, variables);
    else
      evalSyntax(syntax.children[2] as TSNodeJSONType, variables, getModuleFunc);

    let res;
    while (evalExpression(syntax.children[4] as TSNodeJSONType, variables)?.value) {
      res = evalBlockOrSyntax(syntax.children[8] as TSNodeJSONType, variables);

      if (Object.keys(res).includes("value")) break;

      evalExpression(syntax.children[6] as TSNodeJSONType, variables);
    }

    variables.pop();

    if (res && Object.keys(res).includes("value")) return res;
  } else if (syntax.kind === "ForOfStatement") {
    const variableDeclarationList = syntax.children[2] as TSNodeJSONType;

    const syntaxList = variableDeclarationList.children[1];

    const variableDeclaration = syntaxList.children[0] as TSNodeJSONType;

    const identifier = variableDeclaration.children[0] as TSTextNodeJSONType;

    const iterable = evalExpression(syntax.children[4] as TSNodeJSONType, variables)?.value;

    let res;
    for (let value of iterable) {
      let val = value;
      variables.push({
        [identifier.text]: {
          get: () => val,
          set: (v: any) => val = v
        }
      });

      res = evalBlockOrSyntax(syntax.children[6] as TSNodeJSONType, variables);

      variables.pop();

      if (Object.keys(res).includes("value")) break;
    }

    if (res && Object.keys(res).includes("value")) return res;
  } else if (syntax.kind === "ReturnStatement") {
    return {
      exports: {},
      value: syntax.children.length < 3 && syntax.children[1].kind === "SemicolonToken" || syntax.children.length === 1
        ? undefined
        : evalExpression(syntax.children[1] as TSNodeJSONType, variables)?.value
    };
  } else if (syntax.kind === "FunctionDeclaration") {
    let isExport = 0;

    let n = 0;
    if (syntax.children[0].kind === "SyntaxList") {
      n++;

      const syntaxList = syntax.children[0];
      if (syntaxList.children[0].kind === "ExportKeyword")
        isExport = 1 < syntaxList.children.length && syntaxList.children[1].kind === "DefaultKeyword"
          ? 2
          : 1;
    }

    // TODO ジェネレーター関数
    const identifier = syntax.children[1 + n] as TSTextNodeJSONType;

    let func = getFunc(
      syntax.children[syntax.children.length - 1] as TSNodeJSONType,
      syntax.children[3 + n] as TSNodeJSONType,
      cloneScope(variables)
    );

    variables[variables.length - 1][identifier.text] = {
      get: () => func,
      set: (v: any) => func = v,
      initialized: true
    };

    if (isExport) {
      if (isExport === 2) {
        return { exports: { default: func } };
      } else {
        const object = {};
        Object.defineProperty(object, identifier.text, {
          get: () => func,
          enumerable: true
        });
        return { exports: { object } };
      }
    }

    return { exports: {} };
  } else if (syntax.kind === "ImportDeclaration") {
    if (syntax.children.length >= 2 && syntax.children[1].kind === "StringLiteral") {
      // import "module-name"; (Side-effect import)
      const moduleName = evalStringLiteral(syntax.children[1] as TSTextNodeJSONType);
      getModuleFunc(moduleName);
      return { exports: {} };
    }

    if (syntax.children.length < 4) return { exports: {} };

    const moduleName = evalStringLiteral(syntax.children[3] as TSTextNodeJSONType);
    const mod = getModuleFunc(moduleName);

    const importClause = syntax.children[1] as TSNodeJSONType;
    if (importClause.children[0].kind === "TypeKeyword") return { exports: {} };

    let n = 0;
    if (importClause.children[0].kind === "Identifier") {
      const name = (importClause.children[0] as TSTextNodeJSONType).text;
      variables[0][name] = {
        get: () => mod.exports.default,
        initialized: true
      };
      if (importClause.children.length < 2) return { exports: {} };
      n += 2;
    }
    if (importClause.children[n].kind === "NamespaceImport") {
      const namespaceImport = importClause.children[n] as TSNodeJSONType;
      const name = (namespaceImport.children[2] as TSTextNodeJSONType).text;
      variables[0][name] = {
        get: () => mod.exports.object,
        initialized: true
      };
    } else if (importClause.children[n].kind === "NamedImports") {
      const namedImports = importClause.children[n] as TSNodeJSONType;
      const syntaxList = namedImports.children[1];

      for (let n = 0; n < syntaxList.children.length; n += 2) {
        const importSpecifier = syntaxList.children[n];
        const identifier = importSpecifier.children[0] as TSTextNodeJSONType;
        const identifierText = identifier.kind === "StringLiteral" ? evalStringLiteral(identifier) : identifier.text;
        if (importSpecifier.children.length == 1) {
          variables[0][identifierText] = {
            get: () => mod.exports.object![identifierText],
            initialized: true
          };
        } else if (importSpecifier.children.length == 3) {
          const identifier1 = importSpecifier.children[2] as TSTextNodeJSONType;

          if (identifierText === "default") {
            variables[0][identifier1.text] = {
              get: () => mod.exports.default,
              initialized: true
            };
          } else {
            variables[0][identifier1.text] = {
              get: () => mod.exports.object![identifierText],
              initialized: true
            };
          }
        }
      }
    }
  } else if (syntax.kind === "ExportAssignment") {
    // TODO リテラルの値を正しく共有する
    return { exports: { default: evalExpression(syntax.children[2] as TSNodeJSONType, variables)?.value } };
  } else if (syntax.kind === "ExportDeclaration") {
    const exports: ModuleExportsType = { object: {} };

    if (syntax.children[1].kind === "AsteriskToken") {
      const moduleName = evalStringLiteral(syntax.children[3] as TSTextNodeJSONType);

      // TODO リテラルの値を正しく共有する
      // TODO モジュールの初期化状態に合わせて評価する
      Object.defineProperty(exports, 'default', {
        get: () => getModuleFunc(moduleName).exports.default,
        enumerable: true,
        configurable: true
      });

      const targetModule = getModuleFunc(moduleName);
      if (targetModule.exports.object) {
        for (const key of Object.keys(targetModule.exports.object)) {
          Object.defineProperty(exports.object!, key, {
            get: () => getModuleFunc(moduleName).exports.object![key],
            enumerable: true,
            configurable: true
          });
        }
      }
    } else if (syntax.children[1].kind === "NamedExports") {
      const syntaxList = syntax.children[1].children[1];

      if (syntax.children.length < 4) {
        for (let n = 0; n < syntaxList.children.length; n += 2) {
          const exportSpecifier = syntaxList.children[n];
          const identifier = exportSpecifier.children[0] as TSTextNodeJSONType;
          if (exportSpecifier.children.length < 2) {
            // TODO リテラルの値を正しく共有する
            if (identifier.text === "default") {
              Object.defineProperty(exports, 'default', {
                get: () => getVariableValue(variables, identifier.text),
                enumerable: true,
                configurable: true
              });
            } else {
              Object.defineProperty(exports.object!, identifier.text, {
                get: () => getVariableValue(variables, identifier.text),
                enumerable: true,
                configurable: true
              });
            }
          } else {
            const identifier1 = exportSpecifier.children[2] as TSTextNodeJSONType;
            const identifier1Text = identifier1.kind === "StringLiteral" ? evalStringLiteral(identifier1) : identifier1.text;

            // TODO リテラルの値を正しく共有する
            if (identifier1Text === "default") {
              Object.defineProperty(exports, 'default', {
                get: () => getVariableValue(variables, identifier.text),
                enumerable: true,
                configurable: true
              });
            } else {
              Object.defineProperty(exports.object!, identifier1Text, {
                get: () => getVariableValue(variables, identifier.text),
                enumerable: true,
                configurable: true
              });
            }
          }
        }
      } else {
        const moduleName = evalStringLiteral(syntax.children[3] as TSTextNodeJSONType);

        for (let n = 0; n < syntaxList.children.length; n += 2) {
          const exportSpecifier = syntaxList.children[n];
          if (exportSpecifier.children.length < 2) {
            const identifier = exportSpecifier.children[0] as TSTextNodeJSONType;

            // TODO リテラルの値を正しく共有する
            if (identifier.text === "default") {
              Object.defineProperty(exports, 'default', {
                get: () => getModuleFunc(moduleName).exports.default,
                enumerable: true,
                configurable: true
              });
            } else {
              Object.defineProperty(exports.object!, identifier.text, {
                get: () => getModuleFunc(moduleName).exports.object![identifier.text],
                enumerable: true,
                configurable: true
              });
            }
          } else {
            const identifier = exportSpecifier.children[0] as TSTextNodeJSONType;
            const identifier1 = exportSpecifier.children[2] as TSTextNodeJSONType;

            // TODO リテラルの値を正しく共有する
            if (identifier.text === "default") {
              if (identifier1.text === "default") {
                Object.defineProperty(exports, 'default', {
                  get: () => getModuleFunc(moduleName).exports.default,
                  enumerable: true,
                  configurable: true
                });
              } else {
                Object.defineProperty(exports.object!, identifier1.text, {
                  get: () => getModuleFunc(moduleName).exports.default,
                  enumerable: true,
                  configurable: true
                });
              }
            } else if (identifier1.text === "default") {
              Object.defineProperty(exports, 'default', {
                get: () => getModuleFunc(moduleName).exports.object![identifier.text],
                enumerable: true,
                configurable: true
              });
            } else {
              Object.defineProperty(exports.object!, identifier1.text, {
                get: () => getModuleFunc(moduleName).exports.object![identifier.text],
                enumerable: true,
                configurable: true
              });
            }
          }
        }
      }
    } else if (syntax.children[1].kind === "NamespaceExport") {
      const moduleName = evalStringLiteral(syntax.children[3] as TSTextNodeJSONType);

      // TODO module.defaultの扱いは正しいか？
      // TODO リテラルの値を正しく共有する
      const namespaceExport = syntax.children[1] as TSNodeJSONType;
      const name = (namespaceExport.children[2] as TSTextNodeJSONType).text;
      Object.defineProperty(exports.object!, name, {
        get: () => {
          const module = getModuleFunc(moduleName);
          return module.exports.default
            ? { default: module.exports.default, ...module.exports.object }
            : { ...module.exports.object };
        },
        enumerable: true,
        configurable: true
      });
    }

    // TODO リテラルの値を正しく共有する
    return {
      exports: exports.object && Object.keys(exports.object).length
        ? exports
        : exports.default
          ? { default: exports.default }
          : {}
    };
  } else if (syntax.kind !== "TypeAliasDeclaration")
    return { exports: {}, value: evalExpression(syntax, variables)?.value };

  return { exports: {} };
}

export function evalSyntaxList(syntaxList: TSNodeJSONType, variables: { [key: string]: any }[], getModuleFunc: GetModuleFuncType): ExportAndReturnValueType {
  const moduleScope = variables.find(s => s.__module) || variables[0];
  const exports: ModuleExportsType = moduleScope.__module?.exports || { object: {} };
  if (!exports.object) exports.object = {};

  // 1. Pre-scan for hoisting and exports
  for (const child of syntaxList.children) {
    if (child.kind === "FunctionDeclaration") {
      const res = evalSyntax(child as TSNodeJSONType, variables, getModuleFunc);
      if (res.exports.default) exports.default = res.exports.default;
      if (res.exports.object) {
        Object.defineProperties(exports.object!, Object.getOwnPropertyDescriptors(res.exports.object));
      }
    } else if (child.kind === "VariableStatement" || child.kind === "ExportDeclaration") {
      // Hoist variable declarations that are exports to support TDZ and circularity
      let isExport = child.kind === "ExportDeclaration" || (child.children[0].kind === "SyntaxList" && child.children[0].children.some(c => c.kind === "ExportKeyword"));
      if (isExport && child.kind === "VariableStatement") {
        const declarationList = child.children[child.children[0].kind === "SyntaxList" ? 1 : 0] as TSNodeJSONType;
        const listInner = declarationList.children[1];
        for (let n = 0; n < listInner.children.length; n += 2) {
          const decl = listInner.children[n] as TSNodeJSONType;
          if (decl.children[0].kind === "Identifier") {
            declareVariable(variables, (decl.children[0] as TSTextNodeJSONType).text, true, exports.object);
          }
        }
      }
    }
  }

  // 2. Hoist imports
  for (const child of syntaxList.children) {
    if (child.kind === "ImportDeclaration") {
      evalSyntax(child as TSNodeJSONType, variables, getModuleFunc);
    }
  }

  // 3. Evaluate statements
  for (const child of syntaxList.children) {
    if (child.kind === "ImportDeclaration") continue;
    if (child.kind === "FunctionDeclaration") continue; // Already hoisted and initialized

    const res = evalSyntax(child as TSNodeJSONType, variables, getModuleFunc);

    // TODO リテラルの値を正しく共有する
    if (res.exports.default)
      exports.default = res.exports.default;
    if (res.exports.object) {
      Object.defineProperties(exports.object!, Object.getOwnPropertyDescriptors(res.exports.object));
    }

    if (Object.keys(res).includes("value")) return { ...res, exports };
  }

  return { exports };
}

export function getVariableValue(variables: { [key: string]: any }[], key: string) {
  for (let n = variables.length - 1; n >= 0; n--)
    if (key in variables[n]) {
      const val = variables[n][key];
      return (val && typeof val === 'object' && 'get' in val && typeof val.get === 'function' && 'initialized' in val)
        ? (val as VariableValueType).get()
        : val;
    }
}

export function assignVariable(variables: { [key: string]: any }[], key: string, value: any) {
  for (let n = variables.length - 1; n >= 0; n--)
    if (key in variables[n]) {
      const val = variables[n][key];
      if (val && typeof val === 'object' && 'get' in val && typeof val.get === 'function' && 'initialized' in val) {
        const v = val as VariableValueType;
        if (v.set) return v.set(value);
        throw new Error(`Cannot assign to read-only variable '${key}'`);
      }
      return variables[n][key] = value;
    }
}

export function evalExpression(syntax: TSTextNodeJSONType | TSNodeJSONType, variables: { [key: string]: any }[]): { value: any, assignmentFunc: ((value: any) => any) | undefined } | undefined {
  if (syntax.kind === "NumericLiteral") {
    return { value: Number((syntax as TSTextNodeJSONType).text), assignmentFunc: undefined };
  } else if (syntax.kind === "StringLiteral") {
    return { value: evalStringLiteral(syntax as TSTextNodeJSONType), assignmentFunc: undefined };
  } else if (syntax.kind === "TrueKeyword") {
    return { value: true, assignmentFunc: undefined };
  } else if (syntax.kind === "FalseKeyword") {
    return { value: false, assignmentFunc: undefined };
  } else if (syntax.kind === "NullKeyword") {
    return { value: null, assignmentFunc: undefined };
  } else if (syntax.kind === "Identifier") {
    return { value: getVariableValue(variables, (syntax as TSTextNodeJSONType).text), assignmentFunc: (value: any) => assignVariable(variables, (syntax as TSTextNodeJSONType).text, value) };
  } else if (syntax.kind === "ComputedPropertyName") {
    return evalExpression(syntax.children[1] as TSNodeJSONType, variables);
  } else if (syntax.kind === "ArrayLiteralExpression") {
    const syntaxList = syntax.children[1];

    const list: any[] = [];
    for (let n = 0; n < syntaxList.children.length; n += 2) {
      if (syntaxList.children[n].kind === "SpreadElement")
        list.push(...evalExpression(syntaxList.children[n].children[1] as TSNodeJSONType, variables)?.value);
      else
        list.push(evalExpression(syntaxList.children[n] as TSNodeJSONType, variables)?.value);
    }

    return { value: list, assignmentFunc: undefined };
  } else if (syntax.kind === "ObjectLiteralExpression") {
    const syntaxList = syntax.children[1];

    // TODO スプレッド構文
    const object: any = {};
    for (let n = 0; n < syntaxList.children.length; n += 2) {
      if (syntaxList.children[n].kind === "PropertyAssignment") {
        const identifierOrComputedPropertyName = syntaxList.children[n].children[0] as TSNodeJSONType;
        object[
          identifierOrComputedPropertyName.kind === "Identifier"
            ? (identifierOrComputedPropertyName as TSTextNodeJSONType).text
            : evalExpression(identifierOrComputedPropertyName, variables)?.value
        ] = evalExpression(syntaxList.children[n].children[2] as TSNodeJSONType, variables)?.value;
      } else if (syntaxList.children[n].kind === "ShorthandPropertyAssignment") {
        const identifier = syntaxList.children[n].children[0] as TSTextNodeJSONType;
        object[identifier.text] = evalExpression(identifier, variables)?.value;
      }
    }

    return { value: object, assignmentFunc: undefined };
  } else if (syntax.kind === "PropertyAccessExpression") {
    const object = evalExpression(syntax.children[0] as TSNodeJSONType, variables)?.value;
    if (object === undefined)
      if (syntax.children[1].kind === "DotToken")
        throw new Error(`${addChildCodeTextForLog(syntax.children[0])} is undefined`);
      else
        return {
          value: undefined,
          assignmentFunc: undefined
        };

    const newValue = object[(syntax.children[2] as TSTextNodeJSONType).text];
    return {
      value:
        typeof newValue === "function"
          ? newValue.bind(object)
          : newValue,
      assignmentFunc: (value: any) => object[(syntax.children[2] as TSTextNodeJSONType).text] = value
    };
  } else if (syntax.kind === "ElementAccessExpression") {
    const expression = evalExpression(syntax.children[0] as TSNodeJSONType, variables);
    const expression1 = evalExpression(syntax.children[2] as TSNodeJSONType, variables);

    return { value: expression!.value[expression1!.value], assignmentFunc: (value: any) => expression!.value[expression1!.value] = value };
  } else if (syntax.kind === "CallExpression") {
    const func = evalExpression(syntax.children[0] as TSNodeJSONType, variables)?.value;

    const syntaxList = syntax.children[2];

    const args: any[] = [];
    for (let n = 0; n < syntaxList.children.length; n += 2) {
      if (syntaxList.children[n].kind === "SpreadElement") {
        args.push(...evalExpression(syntaxList.children[n].children[1] as TSNodeJSONType, variables)?.value);
      } else
        args.push(evalExpression(syntaxList.children[n] as TSNodeJSONType, variables)?.value);
    }

    if (typeof func !== "function")
      throw new Error(`TypeError: ${addChildCodeTextForLog(syntax.children[0])} is not a function`);

    return { value: func(...args), assignmentFunc: undefined };
  } else if (syntax.kind === "ParenthesizedExpression") {
    return evalExpression(syntax.children[1] as TSNodeJSONType, variables);
  } else if (syntax.kind === "PrefixUnaryExpression") {
    if (syntax.children[0].kind === "PlusToken")
      return { value: +evalExpression(syntax.children[1] as TSNodeJSONType, variables)?.value, assignmentFunc: undefined };
    else if (syntax.children[0].kind === "MinusToken")
      return { value: -evalExpression(syntax.children[1] as TSNodeJSONType, variables)?.value, assignmentFunc: undefined };
    else if (syntax.children[0].kind === "PlusPlusToken") {
      const right = evalExpression(syntax.children[1] as TSNodeJSONType, variables);
      return { value: right?.assignmentFunc!(++right.value), assignmentFunc: undefined };
    } else if (syntax.children[0].kind === "MinusMinusToken") {
      const right = evalExpression(syntax.children[1] as TSNodeJSONType, variables);
      return { value: right?.assignmentFunc!(--right.value), assignmentFunc: undefined };
    } else if (syntax.children[0].kind === "ExclamationToken")
      return { value: !evalExpression(syntax.children[1] as TSNodeJSONType, variables)?.value, assignmentFunc: undefined };
    else if (syntax.children[0].kind === "TildeToken")
      return { value: ~evalExpression(syntax.children[1] as TSNodeJSONType, variables)?.value, assignmentFunc: undefined };
    else
      throw new Error();
  } else if (syntax.kind === "PostfixUnaryExpression") {
    if (syntax.children[1].kind === "PlusPlusToken") {
      const left = evalExpression(syntax.children[0] as TSNodeJSONType, variables);
      const value = left?.value;
      left?.assignmentFunc!(++left.value);
      return { value, assignmentFunc: undefined };
    } else if (syntax.children[1].kind === "MinusMinusToken") {
      const left = evalExpression(syntax.children[0] as TSNodeJSONType, variables);
      const value = left?.value;
      left?.assignmentFunc!(--left.value);
      return { value, assignmentFunc: undefined };
    } else
      throw new Error();
  } else if (syntax.kind === "BinaryExpression") {
    const left = evalExpression(syntax.children[0] as TSNodeJSONType, variables);
    const right = evalExpression(syntax.children[2] as TSNodeJSONType, variables);

    if (syntax.children[1].kind === "CommaToken")
      return { value: right?.value, assignmentFunc: undefined };
    else if (syntax.children[1].kind === "LessThanToken")
      return { value: left?.value < right?.value, assignmentFunc: undefined };
    else if (syntax.children[1].kind === "GreaterThanToken")
      return { value: left?.value > right?.value, assignmentFunc: undefined };
    else if (syntax.children[1].kind === "LessThanEqualsToken")
      return { value: left?.assignmentFunc!(left.value < right?.value), assignmentFunc: undefined };
    else if (syntax.children[1].kind === "GreaterThanEqualsToken")
      return { value: left?.assignmentFunc!(left.value > right?.value), assignmentFunc: undefined };
    else if (syntax.children[1].kind === "EqualsEqualsToken")
      return { value: left?.value == right?.value, assignmentFunc: undefined };
    else if (syntax.children[1].kind === "ExclamationEqualsToken")
      return { value: left?.value != right?.value, assignmentFunc: undefined };
    else if (syntax.children[1].kind === "EqualsEqualsEqualsToken")
      return { value: left?.value === right?.value, assignmentFunc: undefined };
    else if (syntax.children[1].kind === "ExclamationEqualsEqualsToken")
      return { value: left?.value !== right?.value, assignmentFunc: undefined };
    else if (syntax.children[1].kind === "PlusToken")
      return { value: left?.value + right?.value, assignmentFunc: undefined };
    else if (syntax.children[1].kind === "MinusToken")
      return { value: left?.value - right?.value, assignmentFunc: undefined };
    else if (syntax.children[1].kind === "AsteriskToken")
      return { value: left?.value * right?.value, assignmentFunc: undefined };
    else if (syntax.children[1].kind === "AsteriskAsteriskToken")
      return { value: left?.value ** right?.value, assignmentFunc: undefined };
    else if (syntax.children[1].kind === "SlashToken")
      return { value: left?.value / right?.value, assignmentFunc: undefined };
    else if (syntax.children[1].kind === "PercentToken")
      return { value: left?.value % right?.value, assignmentFunc: undefined };
    else if (syntax.children[1].kind === "LessThanLessThanToken")
      return { value: left?.value << right?.value, assignmentFunc: undefined };
    else if (syntax.children[1].kind === "GreaterThanGreaterThanToken")
      return { value: left?.value >> right?.value, assignmentFunc: undefined };
    else if (syntax.children[1].kind === "GreaterThanGreaterThanGreaterThanToken")
      return { value: left?.value >>> right?.value, assignmentFunc: undefined };
    else if (syntax.children[1].kind === "AmpersandToken")
      return { value: left?.value & right?.value, assignmentFunc: undefined };
    else if (syntax.children[1].kind === "BarToken")
      return { value: left?.value | right?.value, assignmentFunc: undefined };
    else if (syntax.children[1].kind === "CaretToken")
      return { value: left?.value ^ right?.value, assignmentFunc: undefined };
    else if (syntax.children[1].kind === "AmpersandAmpersandToken")
      return { value: left?.value && right?.value, assignmentFunc: undefined };
    else if (syntax.children[1].kind === "BarBarToken")
      return { value: left?.value || right?.value, assignmentFunc: undefined };
    else if (syntax.children[1].kind === "QuestionQuestionToken")
      return { value: left?.value ?? right?.value, assignmentFunc: undefined };
    else if (syntax.children[1].kind === "EqualsToken")
      return { value: left?.assignmentFunc!(right?.value), assignmentFunc: undefined };
    else if (syntax.children[1].kind === "PlusEqualsToken")
      return { value: left?.assignmentFunc!(left.value + right?.value), assignmentFunc: undefined };
    else if (syntax.children[1].kind === "MinusEqualsToken")
      return { value: left?.assignmentFunc!(left.value - right?.value), assignmentFunc: undefined };
    else if (syntax.children[1].kind === "AsteriskEqualsToken")
      return { value: left?.assignmentFunc!(left.value * right?.value), assignmentFunc: undefined };
    else if (syntax.children[1].kind === "AsteriskAsteriskEqualsToken")
      return { value: left?.assignmentFunc!(left.value ** right?.value), assignmentFunc: undefined };
    else if (syntax.children[1].kind === "SlashEqualsToken")
      return { value: left?.assignmentFunc!(left.value / right?.value), assignmentFunc: undefined };
    else if (syntax.children[1].kind === "PercentEqualsToken")
      return { value: left?.assignmentFunc!(left.value % right?.value), assignmentFunc: undefined };
    else if (syntax.children[1].kind === "LessThanLessThanEqualsToken")
      return { value: left?.assignmentFunc!(left.value << right?.value), assignmentFunc: undefined };
    else if (syntax.children[1].kind === "GreaterThanGreaterThanEqualsToken")
      return { value: left?.assignmentFunc!(left.value >> right?.value), assignmentFunc: undefined };
    else if (syntax.children[1].kind === "GreaterThanGreaterThanGreaterThanEqualsToken")
      return { value: left?.assignmentFunc!(left.value >>> right?.value), assignmentFunc: undefined };
    else if (syntax.children[1].kind === "AmpersandEqualsToken")
      return { value: left?.assignmentFunc!(left.value & right?.value), assignmentFunc: undefined };
    else if (syntax.children[1].kind === "BarEqualsToken")
      return { value: left?.assignmentFunc!(left.value | right?.value), assignmentFunc: undefined };
    else if (syntax.children[1].kind === "BarBarEqualsToken")
      return { value: left?.assignmentFunc!(left.value || right?.value), assignmentFunc: undefined };
    else if (syntax.children[1].kind === "AmpersandAmpersandEqualsToken")
      return { value: left?.assignmentFunc!(left.value && right?.value), assignmentFunc: undefined };
    else if (syntax.children[1].kind === "QuestionQuestionEqualsToken")
      return { value: left?.assignmentFunc!(left.value ?? right?.value), assignmentFunc: undefined };
    else if (syntax.children[1].kind === "CaretEqualsToken")
      return { value: left?.assignmentFunc!(left.value ^ right?.value), assignmentFunc: undefined };
    else if (syntax.children[1].kind === "InKeyword")
      return { value: left?.assignmentFunc!(left.value in right?.value), assignmentFunc: undefined };
    else if (syntax.children[1].kind === "InstanceOfKeyword")
      return { value: left?.assignmentFunc!(left.value instanceof right?.value), assignmentFunc: undefined };
    else
      throw new Error();
  } else if (syntax.kind === "ArrowFunction") {
    return {
      value: getFunc(
        syntax.children[3 < syntax.children.length ? 4 : 2] as TSNodeJSONType,
        syntax.children[3 < syntax.children.length ? 1 : 0],
        cloneScope(variables)
      ), assignmentFunc: undefined
    };
  } else if (syntax.kind === "ConditionalExpression") {
    return evalExpression(syntax.children[0] as TSNodeJSONType, variables)?.value
      ? evalExpression(syntax.children[2] as TSNodeJSONType, variables)
      : evalExpression(syntax.children[4] as TSNodeJSONType, variables);
  } else if (syntax.kind === "AsExpression") {
    return evalExpression(syntax.children[0] as TSNodeJSONType, variables);
  } else if (syntax.kind === "NonNullExpression") {
    return evalExpression(syntax.children[0] as TSNodeJSONType, variables);
  } else if (syntax.kind === "JsxSelfClosingElement") {
    return evalJsxSelfClosingElement(syntax as TSNodeJSONType, variables);
  } else if (syntax.kind === "JsxElement") {
    return evalJsxElement(syntax as TSNodeJSONType, variables);
  } else if (syntax.kind === "JsxFragment") {
    return evalJsxFragment(syntax as TSNodeJSONType, variables);
  } else if (syntax.kind === "JsxOpeningElement") {
    return evalJsxOpeningElement(syntax as TSNodeJSONType, variables);
  } else if (syntax.kind === "JsxExpression") {
    return evalExpression(syntax.children[1] as TSNodeJSONType, variables);
  } else if (syntax.kind === "JsxAttributes") {
    return evalJsxAttributes(syntax as TSNodeJSONType, variables);
  } else if (syntax.kind === "JsxAttribute") {
    return evalJsxAttribute(syntax as TSNodeJSONType, variables);
  } else if (syntax.kind === "JsxNamespacedName") {
    const ns = (syntax.children[0] as TSTextNodeJSONType).text;
    const name = (syntax.children[2] as TSTextNodeJSONType).text;
    return { value: `${ns}:${name}`, assignmentFunc: undefined };
  } else if (syntax.kind === "JsxText") {
    return { value: (syntax as TSTextNodeJSONType).text, assignmentFunc: undefined };
  } else
    throw new Error(`Unsupported syntax kind: ${syntax.kind}`);
}

function evalJsxSelfClosingElement(syntax: TSNodeJSONType, variables: { [key: string]: any }[]) {
  const componentName = (syntax.children[1] as TSTextNodeJSONType).text;
  const component = getVariableValue(variables, componentName);
  const attrsNode = syntax.children[2];
  const props = attrsNode.kind === "JsxAttributes"
    ? (evalExpression(attrsNode, variables)?.value ?? {})
    : {};

  if (typeof component === 'function') {
    return { value: component(props), assignmentFunc: undefined };
  }
  return { value: null, assignmentFunc: undefined };
}

function evalJsxElement(syntax: TSNodeJSONType, variables: { [key: string]: any }[]) {
  const openingResult = evalJsxOpeningElement(syntax.children[0] as TSNodeJSONType, variables);
  const props = openingResult.value.props;
  const component = openingResult.value.component;

  const childrenSyntaxList = syntax.children[1] as TSNodeJSONType;
  const children: any[] = [];
  if (childrenSyntaxList.kind === "SyntaxList") {
    for (const child of childrenSyntaxList.children) {
      const result = evalExpression(child as TSNodeJSONType, variables);
      if (result?.value !== undefined && result.value !== null) {
        children.push(result.value);
      }
    }
  }

  if (typeof component === 'function') {
    return { value: component({ ...props, children }), assignmentFunc: undefined };
  }
  return { value: null, assignmentFunc: undefined };
}

function evalJsxOpeningElement(syntax: TSNodeJSONType, variables: { [key: string]: any }[]) {
  const componentName = (syntax.children[1] as TSTextNodeJSONType).text;
  const component = getVariableValue(variables, componentName);
  const attrs = syntax.children[2];
  const props = attrs.kind === "JsxAttributes"
    ? (evalExpression(attrs, variables)?.value ?? {})
    : {};
  return { value: { component, props }, assignmentFunc: undefined };
}

function evalJsxAttributes(syntax: TSNodeJSONType, variables: { [key: string]: any }[]) {
  const props: any = {};
  const syntaxList = syntax.children[0];
  if (syntaxList.kind === "SyntaxList") {
    for (const child of syntaxList.children) {
      if (child.kind === "JsxAttribute") {
        const result = evalJsxAttribute(child as TSNodeJSONType, variables);
        if (result) {
          const nameNode = child.children[0];
          let attrName: string;
          if (nameNode.kind === "JsxNamespacedName") {
            const ns = (nameNode.children[0] as TSTextNodeJSONType).text;
            const name = (nameNode.children[2] as TSTextNodeJSONType).text;
            attrName = `${ns}:${name}`;
          } else {
            attrName = (nameNode as TSTextNodeJSONType).text;
          }
          props[attrName] = result.value;
        }
      } else if (child.kind === "JsxSpreadAttribute") {
        const spreadObj = evalExpression(child.children[2] as TSNodeJSONType, variables)?.value;
        if (spreadObj && typeof spreadObj === 'object') {
          Object.assign(props, spreadObj);
        }
      }
    }
  }
  return { value: props, assignmentFunc: undefined };
}

function evalJsxAttribute(syntax: TSNodeJSONType, variables: { [key: string]: any }[]) {
  if (syntax.children.length <= 1) {
    return { value: true, assignmentFunc: undefined };
  }
  const valueNode = syntax.children[2];
  if (valueNode.kind === "JsxExpression") {
    return evalExpression(valueNode.children[1] as TSNodeJSONType, variables);
  } else if (valueNode.kind === "StringLiteral") {
    return { value: evalStringLiteral(valueNode as TSTextNodeJSONType), assignmentFunc: undefined };
  } else if (valueNode.kind === "JsxElement" || valueNode.kind === "JsxSelfClosingElement" || valueNode.kind === "JsxFragment") {
    return evalExpression(valueNode as TSNodeJSONType, variables);
  }
  return { value: true, assignmentFunc: undefined };
}

function evalJsxFragment(syntax: TSNodeJSONType, variables: { [key: string]: any }[]) {
  // <>children</>
  // children: JsxOpeningFragment, SyntaxList (children), JsxClosingFragment
  const childrenSyntaxList = syntax.children[1] as TSNodeJSONType;
  const children: any[] = [];
  if (childrenSyntaxList.kind === "SyntaxList") {
    for (const child of childrenSyntaxList.children) {
      const result = evalExpression(child as TSNodeJSONType, variables);
      if (result?.value !== undefined && result.value !== null) {
        children.push(result.value);
      }
    }
  }
  return { value: children, assignmentFunc: undefined };
}

export function cloneScope(variables: { [key: string]: any }[]) {
  return [...variables.map(scope => {
    const object: { [key: string]: any } = {};
    Object.keys(scope).forEach(key => object[key] = scope[key]);
    return object;
  })];
}

export function evalBlockOrSyntax(node: TSNodeJSONType, variables: { [key: string]: any }[]): ExportAndReturnValueType {
  if (node.kind === "Block") {
    variables.push({});

    let res = evalSyntaxList(node.children[1], variables, () => { throw new Error("インポート宣言は、モジュールの最上位レベルでのみ使用できます。") });

    variables.pop();
    return res || { exports: {} };
  } else
    return evalSyntax(node, variables, () => { throw new Error("インポート宣言は、モジュールの最上位レベルでのみ使用できます。") });
}

export function getFunc(blockOrSyntax: TSNodeJSONType, parametersSyntaxList: TSNodeJSONType, variables: { [key: string]: any }[]) {
  return (...args: any) => {
    variables.push({});
    for (let n = 0; n < args.length && n * 2 < parametersSyntaxList.children.length; n++) {
      const parameter = parametersSyntaxList.children[n * 2] as TSNodeJSONType;
      if (parameter.children[0].kind === "Identifier") {
        const name = (parameter.children[0] as TSTextNodeJSONType).text;
        let val = args[n];
        variables[variables.length - 1][name] = {
          get: () => val,
          set: (v: any) => val = v,
          initialized: true
        };
      } else if (parameter.children[0].kind === "ObjectBindingPattern")
        evalObjectBindingPattern(parameter.children[0] as TSNodeJSONType, variables, args[n]);
    }

    const res = evalBlockOrSyntax(blockOrSyntax, variables)?.value;

    variables.pop();
    return res;
  };
}

export function evalObjectBindingPattern(objectBindingPattern: TSNodeJSONType, variables: { [key: string]: any }[], object: any, exportProps: { [key: string]: any } = {}, isExport = false) {
  const syntaxList = objectBindingPattern.children[1];
  for (let o = 0; o < syntaxList.children.length; o += 2) {
    const bindingElement = syntaxList.children[o] as TSNodeJSONType;
    if (2 < bindingElement.children.length) {
      const identifier = bindingElement.children[0] as TSTextNodeJSONType;
      if (bindingElement.children[2].kind === "Identifier") {
        const name = (bindingElement.children[2] as TSTextNodeJSONType).text;
        let val = object[identifier.text];
        const variable = declareVariable(variables, name, isExport, exportProps);
        variable.set!(val);
      } else if (bindingElement.children[2].kind === "ObjectBindingPattern")
        evalObjectBindingPattern(bindingElement.children[2] as TSNodeJSONType, variables, object[identifier.text], exportProps, isExport);
    } else {
      const identifier = bindingElement.children[0] as TSTextNodeJSONType;
      const name = identifier.text;
      let val = object[identifier.text];
      const variable = declareVariable(variables, name, isExport, exportProps);
      variable.set!(val);
    }
  }
}

export function addChildCodeTextForLog(nodeJson: TSNodeJSONType, text = "") {
  if (nodeJson.children.length)
    nodeJson.children.forEach(childJson => text += addChildCodeTextForLog(childJson));
  else
    text += (nodeJson as TSTextNodeJSONType).text;

  return text;
}

export function evalStringLiteral(stringLiteral: TSTextNodeJSONType) {
  return stringLiteral.text.substring(1, stringLiteral.text.length - 1);
}

export function getDependentModuleNames(syntaxList: TSNodeJSONType) {
  const modules: string[] = [];

  for (const syntax of syntaxList.children) {
    if (syntax.kind === "ImportDeclaration") {
      if (syntax.children.length >= 4)
        modules.push(evalStringLiteral(syntax.children[3] as TSTextNodeJSONType));
    } else if (syntax.kind === "ExportDeclaration") {
      if (syntax.children[1].kind === "AsteriskToken")
        modules.push(evalStringLiteral(syntax.children[3] as TSTextNodeJSONType));
      else if (syntax.children[1].kind === "NamedExports") {
        if (syntax.children.length >= 4)
          modules.push(evalStringLiteral(syntax.children[3] as TSTextNodeJSONType));
      } else if (syntax.children[1].kind === "NamespaceExport")
        modules.push(evalStringLiteral(syntax.children[3] as TSTextNodeJSONType));
    }
  }

  return modules;
}
