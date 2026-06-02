import * as vscode from 'vscode';

// ============================================================
// Token Viewer - 共享类型定义
// ============================================================

/** 小米 MiMo 平台配置 */
export const XIAOMI_CONFIG = {
    apiUrl: 'https://platform.xiaomimimo.com/api/v1/tokenPlan/usage',
    usageApiUrl: 'https://platform.xiaomimimo.com/api/v1/usage/token-plan/list',
    jsonPath: 'data.usage.items[0].limit - data.usage.items[0].used',
    totalPath: 'data.usage.items[0].limit',
    usedPath: 'data.usage.items[0].used',
    loginUrl: 'https://platform.xiaomimimo.com/console/plan-manage',
    headerKey: 'Cookie',
};

/** 模型费率接口 */
export interface ModelRates {
    cacheHit: number;
    input: number;
    output: number;
}

/** 各模型 Credit 消耗比例 */
export const MODEL_RATES: Record<string, ModelRates> = {
    'mimo-v2.5-pro': { cacheHit: 2.5, input: 300, output: 600 },
    'mimo-v2.5':     { cacheHit: 2,   input: 100, output: 200 },
    '_default':      { cacheHit: 1,   input: 100, output: 200 },
};

/** 应用全局状态 */
export interface AppState {
    statusBarItem: vscode.StatusBarItem;
    proxyStatusBarItem: vscode.StatusBarItem;
    outputChannel: vscode.OutputChannel;
    refreshTimer: NodeJS.Timeout | undefined;
    lastTokenCount: number | undefined;
    alertShown: boolean;
    cookieErrorCount: number;
    isRefreshingCookie: boolean;
    isFetching: boolean;
    configDebounce: ReturnType<typeof setTimeout> | undefined;
    lastNotifyTime: number | undefined;
    lastNotifyToken: number | undefined;
    lastModelUsage: Record<string, number> | undefined;
    proxyServer: import('http').Server | undefined;
    caMaterialGlobal: CaMaterial | undefined;
    activeProxySockets: Set<import('net').Socket>;
    domainCertCache: Map<string, CertAndKey>;
    alertPausedUntil: number | undefined;
    dashboardPanel: vscode.WebviewPanel | undefined;
}

/** 证书和密钥 */
export interface CertAndKey {
    certPem: string;
    keyPem: string;
    certDer: Buffer;
}

/** CA 材料（扩展证书信息） */
export interface CaMaterial extends CertAndKey {
    subjectDer: Buffer;
}

/** 每日快照 */
export interface DailySnapshot {
    date: string;
    credits: number;
    totalCredits: number;
    models: Record<string, ModelUsage>;
}

/** 模型用量 */
export interface ModelUsage {
    totalToken: number;
    inputHit: number;
    inputMiss: number;
    output: number;
    credits: number;
    requests: number;
}

/** 请求日志条目 */
export interface RequestLogEntry {
    timestamp: number;
    model: string;
    inputToken: number;
    outputToken: number;
    cacheHit: number;
    estimatedCredits: number;
    duration: number;
}

/** 账号配置 */
export interface AccountProfile {
    id: string;
    name: string;
    cookie: string;
    createdAt: number;
}

/** 用量 API 响应条目 */
export interface UsageApiItem {
    date: string;
    model: string;
    totalToken: number;
    inputHitToken: number;
    inputMissToken: number;
    outputToken: number;
    requestCount: number;
}
