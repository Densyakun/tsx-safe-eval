import type { TSNodeType, TSTextNodeType } from "./types";

// TODO JSX
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
// TODO import(), インポート属性, import.meta
// TODO 関数宣言の巻き上げ
// TODO constへの再代入の禁止
// TODO デコレーター
// TODO プライベートプロパティ
// TODO Module Fragments
// TODO ジェネリクス
// TODO enum, const enum

export type ModuleType = { default?: any, object?: { [key: string]: any } };

export type ExportAndReturnValueType = { exports: ModuleType, value?: any };

export function evalVariableDeclarationList(variableDeclarationList: TSNodeType, variables: { [key: string]: any }[], isExport = false) {
  const syntaxList = variableDeclarationList.children[1];
  const exportProps: { [key: string]: any } = {};
  for (let n = 0; n < syntaxList.children.length; n += 2) {
    const variableDeclaration = syntaxList.children[n] as TSNodeType;

    // TODO ArrayBindingPattern
    if (variableDeclaration.children[0].kind === "Identifier") {
      const identifier = variableDeclaration.children[0] as TSTextNodeType;

      variables[variables.length - 1][identifier.text] = variableDeclaration.children.length === 1
        || variableDeclaration.children.length < 5 && variableDeclaration.children[1].kind === "ColonToken"
        ? undefined
        : evalExpression(variableDeclaration.children[3 < variableDeclaration.children.length ? 4 : 2], variables)?.value;

      if (isExport)
        exportProps[identifier.text] = variables[variables.length - 1][identifier.text];
    } else if (variableDeclaration.children[0].kind === "ObjectBindingPattern")
      evalObjectBindingPattern(
        variableDeclaration.children[0] as TSNodeType,
        variables,
        evalExpression(variableDeclaration.children[3 < variableDeclaration.children.length ? 4 : 2], variables)?.value,
        exportProps,
        isExport
      );
  }

  return exportProps;
}

export function evalSyntax(syntax: TSTextNodeType | TSNodeType, variables: { [key: string]: any }[], modules: { [key: string]: ModuleType } = {}): ExportAndReturnValueType {
  if (syntax.kind === "VariableStatement") {
    let isExport = syntax.children[0].kind === "SyntaxList";

    const exportProps = evalVariableDeclarationList(syntax.children[isExport ? 1 : 0] as TSNodeType, variables, isExport);

    // TODO リテラルの値を正しく共有する
    return { exports: { object: exportProps } };
  } else if (syntax.kind === "ExpressionStatement") {
    evalExpression(syntax.children[0] as TSNodeType, variables);
  } else if (syntax.kind === "IfStatement") {
    if (evalExpression(syntax.children[2] as TSNodeType, variables)?.value) {
      const res = evalBlockOrSyntax(syntax.children[4] as TSNodeType, variables);
      if (Object.keys(res).includes("value")) return res;
    } else if (syntax.children.length === 7)
      return evalBlockOrSyntax(syntax.children[6] as TSNodeType, variables);
  } else if (syntax.kind === "ForStatement") {
    variables.push({});

    if (syntax.children[2].kind === "VariableDeclarationList")
      evalVariableDeclarationList(syntax.children[2] as TSNodeType, variables);
    else
      evalSyntax(syntax.children[2] as TSNodeType, variables, modules);

    let res;
    while (evalExpression(syntax.children[4] as TSNodeType, variables)?.value) {
      res = evalBlockOrSyntax(syntax.children[8] as TSNodeType, variables);

      if (Object.keys(res).includes("value")) break;

      evalExpression(syntax.children[6] as TSNodeType, variables);
    }

    variables.pop();

    if (res && Object.keys(res).includes("value")) return res;
  } else if (syntax.kind === "ForOfStatement") {
    const variableDeclarationList = syntax.children[2] as TSNodeType;

    const syntaxList = variableDeclarationList.children[1];

    const variableDeclaration = syntaxList.children[0] as TSNodeType;

    const identifier = variableDeclaration.children[0] as TSTextNodeType;

    const iterable = evalExpression(syntax.children[4] as TSNodeType, variables)?.value;

    let res;
    for (let value of iterable) {
      variables.push({ [identifier.text]: value });

      res = evalBlockOrSyntax(syntax.children[6] as TSNodeType, variables);

      variables.pop();

      if (Object.keys(res).includes("value")) break;
    }

    if (res && Object.keys(res).includes("value")) return res;
  } else if (syntax.kind === "ReturnStatement") {
    return {
      exports: {},
      value: syntax.children.length < 3 && syntax.children[1].kind === "SemicolonToken" || syntax.children.length === 1
        ? undefined
        : evalExpression(syntax.children[1] as TSNodeType, variables)?.value
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
    const identifier = syntax.children[1 + n] as TSTextNodeType;

    variables[variables.length - 1][identifier.text] = getFunc(
      syntax.children[(6 < syntax.children.length ? 7 : 5) + n] as TSNodeType,
      syntax.children[3 + n],
      cloneScope(variables)
    );

    return {
      exports: isExport
        ? isExport === 2
          ? { default: variables[variables.length - 1][identifier.text] }
          : { object: { [identifier.text]: variables[variables.length - 1][identifier.text] } }
        : {}
    };
  } else if (syntax.kind === "ImportDeclaration") {
    if (syntax.children.length < 4) return { exports: {} };

    const moduleName = evalStringLiteral(syntax.children[3] as TSTextNodeType);

    const module = modules[moduleName];

    const importClause = syntax.children[1] as TSNodeType;
    if (importClause.children[0].kind === "TypeKeyword") return { exports: {} };

    if (!module) throw new Error(`Module '${moduleName}' is undefined`);

    let n = 0;
    if (importClause.children[0].kind === "Identifier") {
      variables[0][(importClause.children[0] as TSTextNodeType).text] = module.default;
      if (importClause.children.length < 2) return { exports: {} };
      n += 2;
    }
    if (importClause.children[n].kind === "NamespaceImport") {
      const namespaceImport = importClause.children[n] as TSNodeType;
      variables[0][(namespaceImport.children[2] as TSTextNodeType).text] = module.object;
    } else if (importClause.children[n].kind === "NamedImports") {
      const namedImports = importClause.children[n] as TSNodeType;
      const syntaxList = namedImports.children[1];

      for (let n = 0; n < syntaxList.children.length; n += 2) {
        const importSpecifier = syntaxList.children[n];
        const identifier = importSpecifier.children[0] as TSTextNodeType;
        const identifierText = identifier.kind === "StringLiteral" ? evalStringLiteral(identifier) : identifier.text;
        if (importSpecifier.children.length == 1)
          variables[0][identifierText] = module.object![identifierText];
        else if (importSpecifier.children.length == 3) {
          const identifier1 = importSpecifier.children[2] as TSTextNodeType;

          if (identifierText === "default")
            variables[0][identifier1.text] = module.default;
          else {
            variables[0][identifier1.text] = module.object![identifierText];
          }
        }
      }
    }
  } else if (syntax.kind === "ExportAssignment") {
    // TODO リテラルの値を正しく共有する
    return { exports: { default: evalExpression(syntax.children[2] as TSNodeType, variables)?.value } };
  } else if (syntax.kind === "ExportDeclaration") {
    const exports: ModuleType = { object: {} };

    if (syntax.children[1].kind === "AsteriskToken") {
      const moduleName = evalStringLiteral(syntax.children[3] as TSTextNodeType);
      const module = modules[moduleName];

      // TODO リテラルの値を正しく共有する
      if (module.default)
        exports.default = module.default;
      if (module.object)
        exports.object = module.object;
    } else if (syntax.children[1].kind === "NamedExports") {
      const syntaxList = syntax.children[1].children[1];

      if (syntax.children.length < 4) {
        for (let n = 0; n < syntaxList.children.length; n += 2) {
          const exportSpecifier = syntaxList.children[n];
          const identifier = exportSpecifier.children[0] as TSTextNodeType;
          if (exportSpecifier.children.length < 2) {
            // TODO リテラルの値を正しく共有する
            if (identifier.text === "default")
              exports.default = getVariableValue(variables, identifier.text);
            else
              exports.object![identifier.text] = getVariableValue(variables, identifier.text);
          } else {
            const identifier1 = exportSpecifier.children[2] as TSTextNodeType;
            const identifier1Text = identifier1.kind === "StringLiteral" ? evalStringLiteral(identifier1) : identifier1.text;

            // TODO リテラルの値を正しく共有する
            if (identifier1Text === "default")
              exports.default = getVariableValue(variables, identifier.text);
            else
              exports.object![identifier1Text] = getVariableValue(variables, identifier.text);
          }
        }
      } else {
        const moduleName = evalStringLiteral(syntax.children[3] as TSTextNodeType);
        const module = modules[moduleName];

        for (let n = 0; n < syntaxList.children.length; n += 2) {
          const exportSpecifier = syntaxList.children[n];
          if (exportSpecifier.children.length < 2) {
            const identifier = exportSpecifier.children[0] as TSTextNodeType;

            // TODO リテラルの値を正しく共有する
            if (identifier.text === "default")
              exports.default = module.default;
            else {
              exports.object![identifier.text] = module.object![identifier.text];
            }
          } else {
            const identifier = exportSpecifier.children[0] as TSTextNodeType;
            const identifier1 = exportSpecifier.children[2] as TSTextNodeType;

            // TODO リテラルの値を正しく共有する
            if (identifier.text === "default")
              if (identifier1.text === "default")
                exports.default = module.default;
              else
                exports.object![identifier1.text] = module.default;
            else if (identifier1.text === "default") {
              exports.default = module.object![identifier.text];
            } else {
              exports.object![identifier1.text] = module.object![identifier.text];
            }
          }
        }
      }
    } else if (syntax.children[1].kind === "NamespaceExport") {
      const moduleName = evalStringLiteral(syntax.children[3] as TSTextNodeType);
      const module = modules[moduleName];

      // TODO module.defaultの扱いは正しいか？
      // TODO リテラルの値を正しく共有する
      const namespaceExport = syntax.children[1] as TSNodeType;
      exports.object![(namespaceExport.children[2] as TSTextNodeType).text] = module.default
        ? { default: module.default, ...module.object }
        : { ...module.object };
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

export function evalSyntaxList(syntaxList: TSNodeType, variables: { [key: string]: any }[], modules?: { [key: string]: ModuleType }): ExportAndReturnValueType | undefined {
  let exports: ModuleType = {};

  for (const child of syntaxList.children) {
    const res = evalSyntax(child as TSNodeType, variables, modules);

    // TODO リテラルの値を正しく共有する
    if (res.exports.default)
      exports.default = res.exports.default;
    if (res.exports.object)
      exports.object = exports.object
        ? { ...exports.object, ...res.exports.object }
        : res.exports.object;

    if (Object.keys(res).includes("value")) return res;
  }

  return { exports };
}

export function getVariableValue(variables: { [key: string]: any }[], key: string) {
  for (let n = variables.length - 1; n >= 0; n--)
    if (Object.keys(variables[n]).includes(key))
      return variables[n][key];
}

export function assignVariable(variables: { [key: string]: any }[], key: string, value: any) {
  for (let n = variables.length - 1; n >= 0; n--)
    if (Object.keys(variables[n]).includes(key))
      return variables[n][key] = value;
}

export function evalExpression(syntax: TSTextNodeType | TSNodeType, variables: { [key: string]: any }[]): { value: any, assignmentFunc: ((value: any) => any) | undefined } | undefined {
  if (syntax.kind === "NumericLiteral") {
    return { value: Number((syntax as TSTextNodeType).text), assignmentFunc: undefined };
  } else if (syntax.kind === "StringLiteral") {
    return { value: evalStringLiteral(syntax as TSTextNodeType), assignmentFunc: undefined };
  } else if (syntax.kind === "Identifier") {
    return { value: getVariableValue(variables, (syntax as TSTextNodeType).text), assignmentFunc: (value: any) => assignVariable(variables, (syntax as TSTextNodeType).text, value) };
  } else if (syntax.kind === "ComputedPropertyName") {
    return evalExpression(syntax.children[1] as TSNodeType, variables);
  } else if (syntax.kind === "ArrayLiteralExpression") {
    const syntaxList = syntax.children[1];

    const list: any[] = [];
    for (let n = 0; n < syntaxList.children.length; n += 2) {
      if (syntaxList.children[n].kind === "SpreadElement")
        list.push(...evalExpression(syntaxList.children[n].children[1] as TSNodeType, variables)?.value);
      else
        list.push(evalExpression(syntaxList.children[n] as TSNodeType, variables)?.value);
    }

    return { value: list, assignmentFunc: undefined };
  } else if (syntax.kind === "ObjectLiteralExpression") {
    const syntaxList = syntax.children[1];

    // TODO スプレッド構文
    const object: any = {};
    for (let n = 0; n < syntaxList.children.length; n += 2) {
      if (syntaxList.children[n].kind === "PropertyAssignment") {
        const identifierOrComputedPropertyName = syntaxList.children[n].children[0] as TSNodeType;
        object[
          identifierOrComputedPropertyName.kind === "Identifier"
            ? (identifierOrComputedPropertyName as TSTextNodeType).text
            : evalExpression(identifierOrComputedPropertyName, variables)?.value
        ] = evalExpression(syntaxList.children[n].children[2] as TSNodeType, variables)?.value;
      } else if (syntaxList.children[n].kind === "ShorthandPropertyAssignment") {
        const identifier = syntaxList.children[n].children[0] as TSTextNodeType;
        object[identifier.text] = evalExpression(identifier, variables)?.value;
      }
    }

    return { value: object, assignmentFunc: undefined };
  } else if (syntax.kind === "PropertyAccessExpression") {
    const object = evalExpression(syntax.children[0] as TSNodeType, variables)?.value;
    if (object === undefined)
      if (syntax.children[1].kind === "DotToken")
        throw new Error(`${addChildCodeTextForLog(syntax.children[0])} is undefined`);
      else
        return {
          value: undefined,
          assignmentFunc: undefined
        };

    const newValue = object[(syntax.children[2] as TSTextNodeType).text];
    return {
      value:
        typeof newValue === "function"
          ? newValue.bind(object)
          : newValue,
      assignmentFunc: (value: any) => object[(syntax.children[2] as TSTextNodeType).text] = value
    };
  } else if (syntax.kind === "ElementAccessExpression") {
    const expression = evalExpression(syntax.children[0] as TSNodeType, variables);
    const expression1 = evalExpression(syntax.children[2] as TSNodeType, variables);

    return { value: expression!.value[expression1!.value], assignmentFunc: (value: any) => expression!.value[expression1!.value] = value };
  } else if (syntax.kind === "CallExpression") {
    const func = evalExpression(syntax.children[0] as TSNodeType, variables)?.value;

    const syntaxList = syntax.children[2];

    const args: any[] = [];
    for (let n = 0; n < syntaxList.children.length; n += 2) {
      if (syntaxList.children[n].kind === "SpreadElement") {
        args.push(...evalExpression(syntaxList.children[n].children[1] as TSNodeType, variables)?.value);
      } else
        args.push(evalExpression(syntaxList.children[n] as TSNodeType, variables)?.value);
    }

    if (typeof func !== "function")
      throw new Error(`TypeError: ${addChildCodeTextForLog(syntax.children[0])} is not a function`);

    return { value: func(...args), assignmentFunc: undefined };
  } else if (syntax.kind === "ParenthesizedExpression") {
    return evalExpression(syntax.children[1] as TSNodeType, variables);
  } else if (syntax.kind === "PrefixUnaryExpression") {
    if (syntax.children[0].kind === "PlusToken")
      return { value: +evalExpression(syntax.children[1] as TSNodeType, variables)?.value, assignmentFunc: undefined };
    else if (syntax.children[0].kind === "MinusToken")
      return { value: -evalExpression(syntax.children[1] as TSNodeType, variables)?.value, assignmentFunc: undefined };
    else if (syntax.children[0].kind === "PlusPlusToken") {
      const right = evalExpression(syntax.children[1] as TSNodeType, variables);
      return { value: right?.assignmentFunc!(++right.value), assignmentFunc: undefined };
    } else if (syntax.children[0].kind === "MinusMinusToken") {
      const right = evalExpression(syntax.children[1] as TSNodeType, variables);
      return { value: right?.assignmentFunc!(--right.value), assignmentFunc: undefined };
    } else if (syntax.children[0].kind === "ExclamationToken")
      return { value: !evalExpression(syntax.children[1] as TSNodeType, variables)?.value, assignmentFunc: undefined };
    else if (syntax.children[0].kind === "TildeToken")
      return { value: ~evalExpression(syntax.children[1] as TSNodeType, variables)?.value, assignmentFunc: undefined };
    else
      throw new Error();
  } else if (syntax.kind === "PostfixUnaryExpression") {
    if (syntax.children[1].kind === "PlusPlusToken") {
      const left = evalExpression(syntax.children[0] as TSNodeType, variables);
      const value = left?.value;
      left?.assignmentFunc!(++left.value);
      return { value, assignmentFunc: undefined };
    } else if (syntax.children[1].kind === "MinusMinusToken") {
      const left = evalExpression(syntax.children[0] as TSNodeType, variables);
      const value = left?.value;
      left?.assignmentFunc!(--left.value);
      return { value, assignmentFunc: undefined };
    } else
      throw new Error();
  } else if (syntax.kind === "BinaryExpression") {
    const left = evalExpression(syntax.children[0] as TSNodeType, variables);
    const right = evalExpression(syntax.children[2] as TSNodeType, variables);

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
        syntax.children[3 < syntax.children.length ? 4 : 2] as TSNodeType,
        syntax.children[3 < syntax.children.length ? 1 : 0],
        cloneScope(variables)
      ), assignmentFunc: undefined
    };
  } else if (syntax.kind === "ConditionalExpression") {
    return evalExpression(syntax.children[0] as TSNodeType, variables)?.value
      ? evalExpression(syntax.children[2] as TSNodeType, variables)
      : evalExpression(syntax.children[4] as TSNodeType, variables);
  } else if (syntax.kind === "AsExpression") {
    return evalExpression(syntax.children[0] as TSNodeType, variables);
  } else if (syntax.kind === "NonNullExpression") {
    return evalExpression(syntax.children[0] as TSNodeType, variables);
  }/* else if (syntax.kind === "VariableDeclarationList") {
    // TODO
  }*/ else
    throw new Error(syntax.kind);
}

export function cloneScope(variables: { [key: string]: any }[]) {
  return [...variables.map(scope => {
    const object: { [key: string]: any } = {};
    Object.keys(scope).forEach(key => object[key] = scope[key]);
    return object;
  })];
}

export function evalBlockOrSyntax(node: TSNodeType, variables: { [key: string]: any }[]): ExportAndReturnValueType {
  if (node.kind === "Block") {
    variables.push({});

    let res = evalSyntaxList(node.children[1], variables);

    variables.pop();
    return res || { exports: {} };
  } else
    return evalSyntax(node, variables);
}

export function getFunc(blockOrSyntax: TSNodeType, parametersSyntaxList: TSNodeType, variables: { [key: string]: any }[]) {
  return (...args: any) => {
    variables.push({});
    for (let n = 0; n < args.length && n * 2 < parametersSyntaxList.children.length; n++) {
      const parameter = parametersSyntaxList.children[n * 2] as TSNodeType;
      if (parameter.children[0].kind === "Identifier")
        variables[variables.length - 1][(parameter.children[0] as TSTextNodeType).text] = args[n];
      else if (parameter.children[0].kind === "ObjectBindingPattern")
        evalObjectBindingPattern(parameter.children[0] as TSNodeType, variables, args[n]);
    }

    const res = evalBlockOrSyntax(blockOrSyntax, variables)?.value;

    variables.pop();
    return res;
  };
}

export function evalObjectBindingPattern(objectBindingPattern: TSNodeType, variables: { [key: string]: any }[], object: any, exportProps: { [key: string]: any } = {}, isExport = false) {
  const syntaxList = objectBindingPattern.children[1];
  for (let o = 0; o < syntaxList.children.length; o += 2) {
    const bindingElement = syntaxList.children[o] as TSNodeType;
    if (2 < bindingElement.children.length) {
      const identifier = bindingElement.children[0] as TSTextNodeType;
      if (bindingElement.children[2].kind === "Identifier") {
        variables[variables.length - 1][(bindingElement.children[2] as TSTextNodeType).text] = object[identifier.text];

        if (isExport)
          exportProps[identifier.text] = variables[variables.length - 1][(bindingElement.children[2] as TSTextNodeType).text];
      } else if (bindingElement.children[2].kind === "ObjectBindingPattern")
        evalObjectBindingPattern(bindingElement.children[2] as TSNodeType, variables, object[identifier.text], exportProps, isExport);
    } else {
      const identifier = bindingElement.children[0] as TSTextNodeType;
      variables[variables.length - 1][identifier.text] = object[identifier.text];

      if (isExport)
        exportProps[identifier.text] = variables[variables.length - 1][identifier.text];
    }
  }
}

export function addChildCodeTextForLog(nodeJson: TSNodeType, text = "") {
  if (nodeJson.children.length)
    nodeJson.children.forEach(childJson => text += addChildCodeTextForLog(childJson));
  else
    text += (nodeJson as TSTextNodeType).text;

  return text;
}

export function evalStringLiteral(stringLiteral: TSTextNodeType) {
  return stringLiteral.text.substring(1, stringLiteral.text.length - 1);
}

export function getDependentModuleNames(syntaxList: TSNodeType) {
  const modules: string[] = [];

  for (const syntax of syntaxList.children) {
    if (syntax.kind === "ImportDeclaration") {
      if (syntax.children.length >= 4)
        modules.push(evalStringLiteral(syntax.children[3] as TSTextNodeType));
    } else if (syntax.kind === "ExportDeclaration") {
      if (syntax.children[1].kind === "AsteriskToken")
        modules.push(evalStringLiteral(syntax.children[3] as TSTextNodeType));
      else if (syntax.children[1].kind === "NamedExports") {
        if (syntax.children.length >= 4)
          modules.push(evalStringLiteral(syntax.children[3] as TSTextNodeType));
      } else if (syntax.children[1].kind === "NamespaceExport")
        modules.push(evalStringLiteral(syntax.children[3] as TSTextNodeType));
    }
  }

  return modules;
}
