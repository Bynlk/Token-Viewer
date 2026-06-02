import * as vscode from 'vscode';

// ============================================================
// Token Viewer - 配置管理
// ============================================================

/** 可选的 tooltip 板块 */
export type TooltipSection = 'account' | 'todayUsage' | 'prediction' | 'budget' | 'modelRates' | 'cacheHitRate' | 'github';

/** 板块显示名称映射 */
export const SECTION_LABELS: Record<TooltipSection, string> = {
    account: '账号信息',
    todayUsage: '今日用量',
    prediction: '消耗预测',
    budget: '月度预算',
    modelRates: '消耗比例',
    cacheHitRate: '缓存命中率',
    github: 'GitHub 链接',
};

/** 细分行的配置键 */
export type TooltipLineKey =
    | 'accountName'
    | 'todayToken' | 'todayCredits' | 'todayRequests' | 'todayCacheHitRate' | 'todayTotal'
    | 'predictionDays'
    | 'budgetUsed'
    | 'ratesCacheHit' | 'ratesInput' | 'ratesOutput'
    | 'githubLink';

/** 行所属的板块 */
export const LINE_TO_SECTION: Record<TooltipLineKey, TooltipSection> = {
    accountName: 'account',
    todayToken: 'todayUsage',
    todayCredits: 'todayUsage',
    todayRequests: 'todayUsage',
    todayCacheHitRate: 'todayUsage',
    todayTotal: 'todayUsage',
    predictionDays: 'prediction',
    budgetUsed: 'budget',
    ratesCacheHit: 'modelRates',
    ratesInput: 'modelRates',
    ratesOutput: 'modelRates',
    githubLink: 'github',
};

/** 行显示名称映射 */
export const LINE_LABELS: Record<TooltipLineKey, string> = {
    accountName: '账号名称',
    todayToken: 'Token 用量',
    todayCredits: 'Credits 消耗',
    todayRequests: '请求次数/均值',
    todayCacheHitRate: '缓存命中率',
    todayTotal: '今日汇总',
    predictionDays: '预计剩余天数',
    budgetUsed: '预算消耗百分比',
    ratesCacheHit: '缓存命中费率',
    ratesInput: '输入费率',
    ratesOutput: '输出费率',
    githubLink: 'GitHub 链接',
};

/** 所有细分行键 */
export const ALL_LINE_KEYS: TooltipLineKey[] = [
    'accountName',
    'todayToken', 'todayCredits', 'todayRequests', 'todayCacheHitRate', 'todayTotal',
    'predictionDays',
    'budgetUsed',
    'ratesCacheHit', 'ratesInput', 'ratesOutput',
    'githubLink',
];

/** 所有板块列表 */
export const ALL_SECTIONS: TooltipSection[] = ['account', 'todayUsage', 'prediction', 'budget', 'modelRates', 'cacheHitRate', 'github'];

/** 检查行是否应该显示（板块开关 + 行开关都必须开启） */
export function isLineShown(sections: TooltipSection[], lines: Record<TooltipLineKey, boolean>, lineKey: TooltipLineKey): boolean {
    return sections.includes(LINE_TO_SECTION[lineKey]) && lines[lineKey];
}

/** 获取完整配置 */
export function getConfig() {
    const config = vscode.workspace.getConfiguration('tokenViewer');
    const sections = ALL_SECTIONS
        .filter(key => config.get<boolean>(`show${key.charAt(0).toUpperCase() + key.slice(1)}`, true));

    // 读取行级配置
    const lines: Record<TooltipLineKey, boolean> = {} as any;
    for (const key of ALL_LINE_KEYS) {
        lines[key] = config.get<boolean>(`line.${key}`, true);
    }

    return {
        headers: config.get<Record<string, string>>('headers', {}),
        refreshInterval: config.get<number>('refreshInterval', 10),
        alertThreshold: config.get<number>('alertThreshold', 100000000),
        monthlyBudget: config.get<number>('monthlyBudget', 0),
        budgetAlertLevels: config.get<number[]>('budgetAlertLevels', [50, 80, 100]),
        teamSharePath: config.get<string>('teamSharePath', ''),
        username: config.get<string>('username', ''),
        tooltipSections: sections,
        tooltipLines: lines,
    };
}

/** 板块设置键转换 */
export function sectionToSettingKey(section: TooltipSection): string {
    return `show${section.charAt(0).toUpperCase()}${section.slice(1)}`;
}
