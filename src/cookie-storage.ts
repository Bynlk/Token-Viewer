import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { AccountProfile } from './types';
import { loadAccounts, saveAccounts } from './storage';

// ============================================================
// Token Viewer - 安全 Cookie 存储
// 使用 VS Code SecretStorage 加密存储 Cookie
// ============================================================

const ENCRYPTION_KEY_NAME = 'tokenViewer.cookieKey';
const ENCRYPTED_MARKER = '__encrypted__:';

/** 获取或创建加密密钥 */
async function getEncryptionKey(context: vscode.ExtensionContext): Promise<string> {
    let key = await context.secrets.get(ENCRYPTION_KEY_NAME);
    if (!key) {
        key = crypto.randomBytes(32).toString('hex');
        await context.secrets.store(ENCRYPTION_KEY_NAME, key);
    }
    return key;
}

/** 简单 XOR 加密（用于 cookie 混淆，非军事级安全） */
function xorEncrypt(text: string, key: string): string {
    const encoded = encodeURIComponent(text);
    let result = '';
    for (let i = 0; i < encoded.length; i++) {
        result += String.fromCharCode(encoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return btoa(result);
}

function xorDecrypt(encrypted: string, key: string): string {
    const decoded = atob(encrypted);
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
        result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return decodeURIComponent(result);
}

/** 加密单个 cookie 值 */
async function encryptCookie(context: vscode.ExtensionContext, cookie: string): Promise<string> {
    if (cookie.startsWith(ENCRYPTED_MARKER)) { return cookie; } // 已加密
    const key = await getEncryptionKey(context);
    return ENCRYPTED_MARKER + xorEncrypt(cookie, key);
}

/** 解密单个 cookie 值 */
async function decryptCookie(context: vscode.ExtensionContext, encrypted: string): Promise<string> {
    if (!encrypted.startsWith(ENCRYPTED_MARKER)) { return encrypted; } // 未加密（向后兼容）
    const key = await getEncryptionKey(context);
    return xorDecrypt(encrypted.slice(ENCRYPTED_MARKER.length), key);
}

/** 加载账号（自动解密 cookie） */
export async function loadAccountsDecrypted(context: vscode.ExtensionContext): Promise<AccountProfile[]> {
    const accounts = loadAccounts();
    const decrypted: AccountProfile[] = [];
    for (const account of accounts) {
        decrypted.push({
            ...account,
            cookie: await decryptCookie(context, account.cookie),
        });
    }
    return decrypted;
}

/** 获取单个账号（解密 cookie） */
export async function getAccountDecrypted(context: vscode.ExtensionContext, id: string): Promise<AccountProfile | undefined> {
    const accounts = await loadAccountsDecrypted(context);
    return accounts.find(a => a.id === id);
}

/** 添加账号（加密 cookie 后存储） */
export async function addAccountEncrypted(context: vscode.ExtensionContext, name: string, cookie: string): Promise<AccountProfile> {
    const accounts = loadAccounts();
    const encryptedCookie = await encryptCookie(context, cookie);
    const profile: AccountProfile = {
        id: generateId(),
        name,
        cookie: encryptedCookie,
        createdAt: Date.now(),
    };
    accounts.push(profile);
    saveAccounts(accounts);
    return { ...profile, cookie }; // 返回明文给调用方
}

/** 迁移现有明文 cookie 到加密存储 */
export async function migrateCookiesToEncrypted(context: vscode.ExtensionContext): Promise<number> {
    const accounts = loadAccounts();
    let migrated = 0;
    for (const account of accounts) {
        if (!account.cookie.startsWith(ENCRYPTED_MARKER)) {
            account.cookie = await encryptCookie(context, account.cookie);
            migrated++;
        }
    }
    if (migrated > 0) {
        saveAccounts(accounts);
    }
    return migrated;
}

function generateId(): string {
    return crypto.randomBytes(8).toString('hex');
}
