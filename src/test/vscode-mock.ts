// Minimal vscode mock for testing purposes
export const workspace = {
    getConfiguration: () => ({
        get: (_key: string, defaultValue?: any) => defaultValue,
    }),
};

export enum StatusBarAlignment {
    Left = 1,
    Right = 2,
}

export class ThemeColor {
    constructor(public id: string) {}
}
