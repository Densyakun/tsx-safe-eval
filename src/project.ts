import { TSSourceFilesJSONType, TSSourceFileJSONType } from './sourcefile/types';
import { TSConfig, TSProjectType } from './types';
import { Project, ProjectOptions } from 'ts-morph';
import { generateTextFromJSON, compileSourceFileToJSON } from './sourcefile/compiler';
import normalizePath from "normalize-path";
import stripJsonComments from 'strip-json-comments';

export interface ProjectContext {
  projectOptions?: ProjectOptions;
  path: {
    resolve: (...paths: string[]) => string;
    join: (...paths: string[]) => string;
    dirname: (p: string) => string;
    relative: (from: string, to: string) => string;
  };
}

export async function loadDirectory(projectDirPath: string, context: ProjectContext): Promise<TSProjectType> {
  const tsConfigAbsoluteFilePath = context.path.resolve(context.path.join(projectDirPath, 'tsconfig.json'));

  return await loadProject(tsConfigAbsoluteFilePath, context);
}

export async function loadProject(tsConfigAbsoluteFilePath: string, context: ProjectContext): Promise<TSProjectType> {
  const project = new Project({
    tsConfigFilePath: tsConfigAbsoluteFilePath,
    skipFileDependencyResolution: true,
    ...context.projectOptions,
  });

  const projectDirPath = normalizePath(context.path.dirname(tsConfigAbsoluteFilePath));

  const sourceFiles: {
    [relativeFilePath: string]: TSSourceFileJSONType;
  } = {};

  project.getSourceFiles().forEach(sourceFile => {
    return sourceFiles[normalizePath(context.path.relative(projectDirPath, sourceFile.getFilePath()))] = compileSourceFileToJSON(sourceFile);
  });

  const referencedProjects: {
    [tsConfigFilePath: string]: TSProjectType;
  } = {};

  const fs = project.getFileSystem();

  try {
    const tsConfigFileText = stripJsonComments(await fs.readFile(tsConfigAbsoluteFilePath, 'utf8'));
    const tsConfig: TSConfig = JSON.parse(tsConfigFileText);
    if (tsConfig.references)
      for (const { path: referencedTsConfigFilePath } of tsConfig.references) {
        const normalizedPathOfReferencedTsConfigFile = normalizePath(referencedTsConfigFilePath);
        referencedProjects[normalizedPathOfReferencedTsConfigFile] = await loadProject(context.path.join(projectDirPath, normalizedPathOfReferencedTsConfigFile), context);
      }

    return {
      sourceFiles,
      tsConfig,
      referencedProjects,
    };
  } catch (e) {
    console.error(e);
    console.error(tsConfigAbsoluteFilePath);

    return {
      sourceFiles: {},
      tsConfig: {},
      referencedProjects: {},
    };
  }
}

export async function saveDirectory(projectPath: string, project: TSProjectType, context: ProjectContext) {
  const tsConfigAbsoluteFilePath = context.path.resolve(context.path.join(projectPath, 'tsconfig.json'));

  return await saveProject(tsConfigAbsoluteFilePath, project, context);
}

export async function saveProject(tsConfigAbsoluteFilePath: string, project: TSProjectType, context: ProjectContext) {
  const projectDirPath = context.path.dirname(tsConfigAbsoluteFilePath);

  // 再読み込みして古いソースファイルを用意する
  let oldSourceFiles: TSSourceFilesJSONType = {};
  try {
    oldSourceFiles = getSourceFilesByTSProject(await loadProject(tsConfigAbsoluteFilePath, context));
  } catch (_) { }

  return await saveDirectoryWithPerFiles(projectDirPath, getSourceFilesByTSProject(project), oldSourceFiles, context);
}

export function getSourceFilesByTSProject(project: TSProjectType) {
  const sourceFiles: TSSourceFilesJSONType = { ...project.sourceFiles };
  Object.assign(sourceFiles, ...Object.values(project.referencedProjects).map(referencedProject =>
    getSourceFilesByTSProject(referencedProject)
  ));

  return sourceFiles;
}

export async function saveDirectoryWithPerFiles(projectDirPath: string, newSourceFiles: TSSourceFilesJSONType, oldSourceFiles: TSSourceFilesJSONType, context: ProjectContext) {
  const newFilePaths = Object.keys(newSourceFiles);
  const oldFilePaths = Object.keys(oldSourceFiles);

  const dummyProject = new Project(context.projectOptions);
  const fs = dummyProject.getFileSystem();

  return await Promise.allSettled([
    ...oldFilePaths.map(relativeFilePath =>
      !newFilePaths.includes(relativeFilePath) && fs.delete(context.path.join(projectDirPath, relativeFilePath))
    ),
    ...newFilePaths.map(async relativeFilePath => {
      const filePath = context.path.join(projectDirPath, relativeFilePath);
      const oldSourceFile = oldSourceFiles[relativeFilePath] as TSSourceFileJSONType | undefined;
      const oldFullText = oldSourceFile && generateTextFromJSON(oldSourceFile.syntaxList.children, undefined, undefined, oldSourceFile.commentRangesAtEndOfFile, oldSourceFile.whitespaces);
      const newSourceFile = newSourceFiles[relativeFilePath];
      const fullText = generateTextFromJSON(newSourceFile.syntaxList.children, undefined, undefined, newSourceFile.commentRangesAtEndOfFile, newSourceFile.whitespaces);
      let shouldWrite = false;

      if (oldSourceFile) {
        // ファイルに変更がある場合のみ書き込む
        if (oldFullText !== fullText) {
          shouldWrite = true;
        }
      } else {
        // 意図せずファイルが存在する場合、上書きを禁止する
        if (!(await fs.fileExists(filePath))) {
          shouldWrite = true;
        }
      }

      if (shouldWrite) {
        await fs.mkdir(context.path.dirname(filePath));
        await fs.writeFile(filePath, fullText);
      }
    })
  ]);
}
