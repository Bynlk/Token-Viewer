import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { DailySnapshot, RequestLogEntry, AccountProfile } from './types';
import { getShanghaiTime } from './utils';
import { httpGet } from './http';

// ============================================================
// Token Viewer - 本地数据存储
// ============================================================

let storageRoot: string;

/** 初始化存储目录 */
export function initStorage(context: vscode.ExtensionContext): void {
    storageRoot = context.globalStorageUri.fsPath;
    ensureDir(path.join(storageRoot, 'data', 'daily'));
    ensureDir(path.join(storageRoot, 'data', 'requests'));
    ensureDir(path.join(storageRoot, 'data', 'lib'));
}

function ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function getDataDir(...segments: string[]): string {
    return path.join(storageRoot, 'data', ...segments);
}

// ============================================================
// 每日快照
// ============================================================

export function saveDailySnapshot(snapshot: DailySnapshot): void {
    const filePath = getDataDir('daily', `${snapshot.date}.json`);
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf8');
}

export function loadDailySnapshot(date: string): DailySnapshot | null {
    const filePath = getDataDir('daily', `${date}.json`);
    if (!fs.existsSync(filePath)) { return null; }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

export function loadHistory(days: number): DailySnapshot[] {
    const snapshots: DailySnapshot[] = [];
    const sh = getShanghaiTime();
    for (let i = 0; i < days; i++) {
        const d = new Date(sh.now);
        d.setDate(d.getDate() - i);
        const dateStr = formatDateShanghai(d);
        const snap = loadDailySnapshot(dateStr);
        if (snap) { snapshots.push(snap); }
    }
    return snapshots.reverse();
}

// ============================================================
// 请求日志
// ============================================================

export function appendRequestLog(entry: RequestLogEntry): void {
    const dateStr = formatDateShanghai(new Date(entry.timestamp));
    const filePath = getDataDir('requests', `${dateStr}.json`);
    let logs: RequestLogEntry[] = [];
    if (fs.existsSync(filePath)) {
        try {
            logs = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch { logs = []; }
    }
    logs.push(entry);
    fs.writeFileSync(filePath, JSON.stringify(logs), 'utf8');
}

export function loadRequestLogs(date: string): RequestLogEntry[] {
    const filePath = getDataDir('requests', `${date}.json`);
    if (!fs.existsSync(filePath)) { return []; }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return [];
    }
}

export function cleanupOldRequestLogs(keepDays: number): void {
    const dir = getDataDir('requests');
    if (!fs.existsSync(dir)) { return; }
    const sh = getShanghaiTime();
    const cutoff = new Date(sh.now);
    cutoff.setDate(cutoff.getDate() - keepDays);
    const cutoffStr = formatDateShanghai(cutoff);
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (file < cutoffStr && file.endsWith('.json')) {
            try { fs.unlinkSync(path.join(dir, file)); } catch { /* ignore */ }
        }
    }
}

// ============================================================
// 账号管理
// ============================================================

export function loadAccounts(): AccountProfile[] {
    const filePath = getDataDir('accounts.json');
    if (!fs.existsSync(filePath)) { return []; }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return [];
    }
}

export function saveAccounts(accounts: AccountProfile[]): void {
    const filePath = getDataDir('accounts.json');
    fs.writeFileSync(filePath, JSON.stringify(accounts, null, 2), 'utf8');
}

export function addAccount(name: string, cookie: string): AccountProfile {
    const accounts = loadAccounts();
    const profile: AccountProfile = {
        id: generateId(),
        name,
        cookie,
        createdAt: Date.now(),
    };
    accounts.push(profile);
    saveAccounts(accounts);
    return profile;
}

export function removeAccount(id: string): boolean {
    const accounts = loadAccounts();
    const idx = accounts.findIndex(a => a.id === id);
    if (idx === -1) { return false; }
    accounts.splice(idx, 1);
    saveAccounts(accounts);
    return true;
}

export function getAccount(id: string): AccountProfile | undefined {
    return loadAccounts().find(a => a.id === id);
}

// ============================================================
// 团队共享
// ============================================================

export function saveTeamSnapshot(username: string, sharePath: string, snapshot: DailySnapshot): void {
    if (!sharePath || !username) { return; }
    const userDir = path.join(sharePath, username);
    ensureDir(userDir);
    const filePath = path.join(userDir, `${snapshot.date}.json`);
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf8');
}

export function loadTeamSnapshots(sharePath: string): Record<string, DailySnapshot> {
    if (!sharePath || !fs.existsSync(sharePath)) { return {}; }
    const result: Record<string, DailySnapshot> = {};
    const today = getShanghaiTime().dateStr;
    const users = fs.readdirSync(sharePath);
    for (const user of users) {
        const userDir = path.join(sharePath, user);
        if (!fs.statSync(userDir).isDirectory()) { continue; }
        const filePath = path.join(userDir, `${today}.json`);
        if (fs.existsSync(filePath)) {
            try {
                result[user] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            } catch { /* skip */ }
        }
    }
    return result;
}

// ============================================================
// Chart.js 下载管理
// ============================================================

export function getChartJsPath(): string {
    return getDataDir('lib', 'chart.min.js');
}

export function isChartJsDownloaded(): boolean {
    return fs.existsSync(getChartJsPath());
}

export async function downloadChartJs(): Promise<boolean> {
    const targetPath = getChartJsPath();
    if (fs.existsSync(targetPath)) { return true; }

    try {
        const content = await httpGet(
            'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js',
            { 'Accept': '*/*' }
        );
        fs.writeFileSync(targetPath, content, 'utf8');
        return true;
    } catch {
        return false;
    }
}

// ============================================================
// 工具函数
// ============================================================

function formatDateShanghai(d: Date): string {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const year = parts.find(p => p.type === 'year')!.value;
    const month = parts.find(p => p.type === 'month')!.value;
    const day = parts.find(p => p.type === 'day')!.value;
    return `${year}-${month}-${day}`;
}

function generateId(): string {
    return crypto.randomBytes(8).toString('hex');
}
