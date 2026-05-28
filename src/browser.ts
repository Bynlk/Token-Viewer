import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { AppState, XIAOMI_CONFIG } from './types';
import { fetchTokenCount } from './api';

// ============================================================
// Token Viewer - 浏览器 Cookie 采集 & 自动启动
// ============================================================

export function findBrowserPath(): string | undefined {
    const candidates = [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) { return p; }
    }
    return undefined;
}

export async function captureCookieViaBrowser(app: AppState, context: vscode.ExtensionContext): Promise<void> {
    let puppeteer: any;
    try {
        puppeteer = require('puppeteer-core');
    } catch {
        vscode.window.showErrorMessage('请先安装 puppeteer-core：npm install puppeteer-core');
        return;
    }

    const chromePath = findBrowserPath();

    if (!chromePath) {
        vscode.window.showErrorMessage('未找到 Chrome 或 Edge 浏览器');
        return;
    }

    let browser: any;
    try {
        vscode.window.showInformationMessage('正在启动浏览器，请在浏览器中登录小米账号...');

        const userDataDir = path.join(context.globalStorageUri.fsPath, 'browser-profile');
        if (!fs.existsSync(userDataDir)) { fs.mkdirSync(userDataDir, { recursive: true }); }

        browser = await puppeteer.launch({
            executablePath: chromePath,
            headless: false,
            defaultViewport: null,
            userDataDir,
            args: ['--no-first-run', '--no-default-browser-check'],
        });

        const page = await browser.newPage();
        await page.goto(XIAOMI_CONFIG.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        app.outputChannel.appendLine('[Token Viewer] 等待用户点击"我已登录"按钮...');

        const clicked = await vscode.window.showInformationMessage(
            '请在浏览器中完成登录，登录成功后点击下方按钮',
            { modal: false },
            '我已登录'
        );

        if (clicked !== '我已登录') {
            throw new Error('用户取消了登录确认');
        }

        if (!browser || !browser.connected) {
            throw new Error('浏览器已关闭，请重新运行命令');
        }

        app.outputChannel.appendLine('[Token Viewer] 用户确认登录，正在提取 Cookie...');

        // 等待页面 Cookie 更新
        await new Promise(r => setTimeout(r, 1500));

        let cookies: any[];
        try {
            cookies = await browser.cookies();
        } catch {
            const pages = await browser.pages();
            cookies = [];
            for (const p of pages) {
                try {
                    const c = await p.cookies();
                    cookies.push(...c);
                } catch { /* skip */ }
            }
        }
        const cookieStr = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');

        if (!cookieStr) {
            throw new Error('未获取到有效 Cookie');
        }

        const vscodeConfig = vscode.workspace.getConfiguration('tokenViewer');
        await vscodeConfig.update('headers', { Cookie: cookieStr }, vscode.ConfigurationTarget.Global);
        await context.globalState.update('tokenViewer.savedCookie', cookieStr);

        app.outputChannel.appendLine('[Token Viewer] ✅ Cookie 已通过浏览器自动获取并保存');
        vscode.window.showInformationMessage('✅ Cookie 已自动获取并保存！');

        await browser.close();
        browser = null;

        app.cookieErrorCount = 0;
        await fetchTokenCount(app, context);

    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        app.outputChannel.appendLine(`[Token Viewer] 浏览器获取 Cookie 失败: ${msg}`);
        vscode.window.showErrorMessage(`获取 Cookie 失败: ${msg}`);
        if (browser) {
            try { await browser.close(); } catch { /* ignore */ }
        }
    }
}

export function openBrowserWithProxy(app: AppState, port: number): void {
    const browserPath = findBrowserPath();
    if (!browserPath) {
        app.outputChannel.appendLine('[Token Viewer] 未找到浏览器，跳过自动打开');
        return;
    }

    const child = spawn(browserPath, [
        `--proxy-server=http://127.0.0.1:${port}`,
        '--no-first-run',
        '--no-default-browser-check',
        `--ignore-certificate-errors-spki-list=${getCaSpkiFingerprint(app)}`,
        XIAOMI_CONFIG.loginUrl,
    ], { detached: true, stdio: 'ignore' });
    child.unref();
    app.outputChannel.appendLine(`[Token Viewer] 已打开浏览器（代理 :${port}）`);
}

/** 获取 CA 证书的 SPKI 指纹，用于精确忽略证书错误 */
function getCaSpkiFingerprint(app: AppState): string {
    try {
        const crypto = require('crypto');
        if (app.caMaterialGlobal) {
            const hash = crypto.createHash('sha256');
            // 从 CA 证书 DER 中提取 SPKI 并计算指纹
            const cert = new crypto.X509Certificate(app.caMaterialGlobal.certPem);
            const spki = cert.publicKey.export({ type: 'spki', format: 'der' });
            return crypto.createHash('sha256').update(spki).digest('base64');
        }
    } catch { /* ignore */ }
    return '';
}
