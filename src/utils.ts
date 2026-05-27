import * as vscode from 'vscode';
import { MODEL_RATES } from './types';

// ============================================================
// Token Viewer - 工具函数
// ============================================================

/** 获取代理端口配置 */
export function getProxyPort(): number {
    return vscode.workspace.getConfiguration('tokenViewer').get<number>('proxyPort', 9527);
}

/** 获取 Asia/Shanghai 时区的当前时间信息 */
export function getShanghaiTime(): { year: number; month: number; dateStr: string; now: Date } {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const year = parseInt(parts.find(p => p.type === 'year')!.value);
    const month = parseInt(parts.find(p => p.type === 'month')!.value);
    const day = parts.find(p => p.type === 'day')!.value;
    return { year, month, dateStr: `${year}-${String(month).padStart(2, '0')}-${day}`, now };
}

/** 数字缩写格式化 */
export function formatCompact(num: number): string {
    const abs = Math.abs(num);
    if (abs >= 1e12) { return (num / 1e12).toFixed(1).replace(/\.0$/, '') + 'T'; }
    if (abs >= 1e9) { return (num / 1e9).toFixed(1).replace(/\.0$/, '') + 'B'; }
    if (abs >= 1e6) { return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'; }
    if (abs >= 1e4) { return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'; }
    return num.toLocaleString('zh-CN');
}

/** JSON 路径解析（支持减法表达式） */
export function resolveJsonPath(obj: any, path: string): any {
    if (!path) { return obj; }

    const trimmedPath = path.trim();

    if (trimmedPath.includes(' - ')) {
        const parts = trimmedPath.split(' - ');
        if (parts.length >= 2) {
            let result: number | undefined;
            for (const part of parts) {
                const value = resolveSinglePath(obj, part.trim());
                const num = Number(value);
                if (isNaN(num)) { return undefined; }
                result = result === undefined ? num : result - num;
            }
            return result;
        }
    }

    return resolveSinglePath(obj, trimmedPath);
}

function resolveSinglePath(obj: any, path: string): any {
    if (!path) { return obj; }

    const segments = path.split('.').filter(s => s.length > 0);
    let current = obj;

    for (const segment of segments) {
        if (current === null || current === undefined) { return undefined; }

        const arrayMatch = segment.match(/^([^\[]+)\[(\d+)\]$/);
        if (arrayMatch) {
            const fieldName = arrayMatch[1];
            const index = parseInt(arrayMatch[2], 10);
            current = current[fieldName];
            if (!Array.isArray(current)) { return undefined; }
            current = current[index];
        } else {
            current = current[segment];
        }
    }

    return current;
}

/** 认证错误检测 */
export function isAuthError(message: string): boolean {
    const lowerMsg = message.toLowerCase();
    if (lowerMsg.includes('http 401') || lowerMsg.includes('http 403')) {
        return true;
    }
    const authKeywords = [
        'unauthorized', 'forbidden', 'token expired', 'session expired',
        'cookie expired', 'login required', 'access denied', 'not authenticated',
        '未登录', '登录已过期', '认证失败', '请重新登录',
    ];
    return authKeywords.some(keyword => lowerMsg.includes(keyword));
}

/** 系统代理绕过 */
export function bypassSystemProxy<T>(fn: () => T): T {
    const saved: Record<string, string | undefined> = {};
    const keys = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy'];
    for (const key of keys) {
        saved[key] = process.env[key];
        delete process.env[key];
    }
    try {
        return fn();
    } finally {
        for (const key of keys) {
            if (saved[key] !== undefined) { process.env[key] = saved[key]; }
            else { delete process.env[key]; }
        }
    }
}

/** 构建用量 API URL（从 Cookie 提取 api-platform_ph 拼入查询参数） */
export function buildUsageUrl(cookie: string): string {
    const match = cookie.match(/api-platform_ph="?([^";]+)/);
    const base = 'https://platform.xiaomimimo.com/api/v1/usage/token-plan/list';
    if (match) {
        return `${base}?api-platform_ph=${encodeURIComponent(match[1])}`;
    }
    return base;
}

/** 根据模型和 token 分类计算 credits 消耗 */
export function calcCredits(model: string, inputHit: number, inputMiss: number, output: number): number {
    const rates = MODEL_RATES[model];
    if (!rates) { return 0; }
    return inputHit * rates.cacheHit + inputMiss * rates.input + output * rates.output;
}
