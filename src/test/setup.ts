// Mock vscode module for testing outside of VS Code environment
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
    if (request === 'vscode') {
        return require.resolve('./vscode-mock');
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
};
