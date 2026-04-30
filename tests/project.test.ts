import { loadProject, saveProject, ProjectContext } from '../src/project';
import { compileSourceFileToJSON } from '../src/sourcefile/compiler';
import { Project } from 'ts-morph';
import path from 'path';

describe('Project IO', () => {
  it('should load and save a project in-memory', async () => {
    // 1. インメモリ用のファイルシステムを持つダミープロジェクトを作成し、FileSystemを取得する
    const dummyFsProject = new Project({ useInMemoryFileSystem: true });
    const fileSystem = dummyFsProject.getFileSystem();

    // 2. 初期状態のファイル構造をインメモリファイルシステム上に作成
    // Windows環境での絶対パスの問題を回避するため、カレントディレクトリからの絶対パスを使用
    const projectDirPath = path.resolve(path.join(process.cwd(), 'my-project'));
    const tsConfigPath = path.join(projectDirPath, 'tsconfig.json');
    const sourceFilePath = path.join(projectDirPath, 'src', 'index.ts');

    await fileSystem.mkdir(projectDirPath);
    await fileSystem.mkdir(path.dirname(sourceFilePath));

    // tsconfig.json がないと loadProject 内部でエラーになるため必ず作成
    await fileSystem.writeFile(tsConfigPath, JSON.stringify({
      compilerOptions: { strict: true }
    }));
    await fileSystem.writeFile(sourceFilePath, 'export const a = 1;');

    // ProjectContextの作成 (テスト用に上記のインメモリFileSystemを渡す)
    const context: ProjectContext = {
      path,
      projectOptions: { fileSystem }
    };

    // 3. プロジェクトの読み込みテスト
    const projectData = await loadProject(tsConfigPath, context);
    
    // tsconfig.json が正しく読み込まれたか確認
    expect(projectData.tsConfig).toEqual({ compilerOptions: { strict: true } });

    // index.ts が読み込まれたか確認
    const sourceFileKeys = Object.keys(projectData.sourceFiles);
    expect(sourceFileKeys.length).toBeGreaterThan(0);
    const indexKey = sourceFileKeys.find(k => k.includes('index.ts'));
    expect(indexKey).toBeDefined();

    // 4. プロジェクトの変更テスト (新しいファイルを追加する)
    const newTsCode = "export const b = 2;";
    const tempProject = new Project({ useInMemoryFileSystem: true });
    const newSourceFile = tempProject.createSourceFile("src/test.ts", newTsCode);
    
    // ASTのJSON表現を取得して projectData に追加
    projectData.sourceFiles['src/test.ts'] = compileSourceFileToJSON(newSourceFile);

    // 5. プロジェクトの保存テスト
    await saveProject(tsConfigPath, projectData, context);

    // 6. 保存結果の検証
    const savedTestFilePath = path.join(projectDirPath, 'src', 'test.ts');
    
    // 実際にインメモリFileSystem上にファイルが書き込まれたか確認
    expect(await fileSystem.fileExists(savedTestFilePath)).toBe(true);
    
    // 内容が一致するか確認
    const savedContent = await fileSystem.readFile(savedTestFilePath, 'utf8');
    expect(savedContent).toBe(newTsCode);
  });
});
