// Mock vscode module for testing outside of VS Code environment

const configStore: Record<string, any> = {};
const globalStateStore: Record<string, any> = {};
const secretsStore: Record<string, string> = {};
const warnings: string[] = [];

export const workspace = {
    getConfiguration: (_section?: string) => ({
        get: <T>(key: string, defaultValue?: T): T => {
            const fullKey = _section ? `${_section}.${key}` : key;
            return (configStore[fullKey] ?? defaultValue) as T;
        },
        update: async (key: string, value: any) => {
            const fullKey = _section ? `${_section}.${key}` : key;
            configStore[fullKey] = value;
        },
    }),
    // Helper for tests to set config values
    _setConfig: (key: string, value: any) => { configStore[key] = value; },
    _clearConfig: () => { for (const key of Object.keys(configStore)) delete configStore[key]; },
};

export enum StatusBarAlignment {
    Left = 1,
    Right = 2,
}

export class ThemeColor {
    constructor(public id: string) {}
}

export const window = {
    showWarningMessage: (msg: string) => { warnings.push(msg); },
    showInformationMessage: (_msg: string) => {},
    showErrorMessage: (_msg: string) => {},
    _getWarnings: () => [...warnings],
    _clearWarnings: () => { warnings.length = 0; },
};

export class OutputChannel {
    appendLine(_msg: string) {}
}

// Helper to create a mock ExtensionContext
export function createMockContext() {
    // Each context gets its own isolated globalState store
    const localState: Record<string, any> = {};
    return {
        globalState: {
            get: <T>(key: string, defaultValue?: T): T => {
                return (localState[key] ?? defaultValue) as T;
            },
            update: async (key: string, value: any) => {
                localState[key] = value;
            },
        },
        secrets: {
            get: async (key: string): Promise<string | undefined> => secretsStore[key],
            store: async (key: string, value: string) => { secretsStore[key] = value; },
            delete: async (key: string) => { delete secretsStore[key]; },
        },
        globalStorageUri: { fsPath: '/tmp/test-storage' },
        subscriptions: [],
    };
}
