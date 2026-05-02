import { Project } from 'ts-morph';
import { compileSourceFileToJSON } from '../src/sourcefile/compiler';
import { ModuleType } from '../src/sourcefile/eval';
import { getNewVariables, evalModule } from '../src/interpreter';
import { TSSourceFilesJSONType } from '../src/sourcefile/types';

describe('Circular Imports', () => {
    let project: Project;
    let modules: { [name: string]: ModuleType };

    beforeEach(() => {
        project = new Project({ useInMemoryFileSystem: true });
        modules = {};
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    function getModule(name: string, logs: string[] = []): ModuleType {
        // Normalize entry point path
        const filePath = name.startsWith('/') ? name.substring(1) : name;

        if (modules[filePath]) return modules[filePath];

        // Prepare sourceFilesJSON from project
        const sourceFilesJSON: TSSourceFilesJSONType = {};
        project.getSourceFiles().forEach(sf => {
            const path = sf.getFilePath().replace(/\\/g, '/');
            const key = path.startsWith('/') ? path.substring(1) : path;
            sourceFilesJSON[key] = compileSourceFileToJSON(sf);
        });

        // Create custom variables for this evaluation session
        const customVariables = getNewVariables();
        customVariables[0].console = {
            log: (...args: any[]) => logs.push(args.join(' '))
        };
        customVariables[0].setTimeout = setTimeout;

        evalModule(sourceFilesJSON, modules, filePath, customVariables);

        return modules[filePath];
    }

    test('Case 1: Both A and B use each other asynchronously (Should succeed)', () => {
        const logs: string[] = [];
        project.createSourceFile('a1.ts', `
            import { b } from "./b1";
            setTimeout(() => {
                console.log(b); // Should be 1
            }, 10);
            export const a = 2;
        `);
        project.createSourceFile('b1.ts', `
            import { a } from "./a1";
            setTimeout(() => {
                console.log(a); // Should be 2
            }, 10);
            export const b = 1;
        `);

        getModule('a1.ts', logs);

        jest.runAllTimers();

        expect(logs).toContain('1');
        expect(logs).toContain('2');
    });

    test('Case 2: Sync usage of "a" in "b" (Should throw ReferenceError)', () => {
        project.createSourceFile('a2.ts', `
            import { b } from "./b2";
            export const a = 2;
        `);
        project.createSourceFile('b2.ts', `
            import { a } from "./a2";
            console.log(a); // Should throw ReferenceError
            export const b = 1;
        `);

        expect(() => getModule('a2.ts')).toThrow(ReferenceError);
    });

    test('Case 3: B sync, A async usage (Should succeed)', () => {
        const logs: string[] = [];
        project.createSourceFile('a3.ts', `
            import { b } from "./b3";
            console.log(b); // Should be 1
            export const a = 2;
        `);
        project.createSourceFile('b3.ts', `
            import { a } from "./a3";
            setTimeout(() => {
                console.log(a); // Should be 2
            }, 10);
            export const b = 1;
        `);

        getModule('a3.ts', logs);

        expect(logs).toContain('1');

        jest.runAllTimers();
        expect(logs).toContain('2');
    });
});
