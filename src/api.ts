import * as vscode from 'vscode';
import { AppState, XIAOMI_CONFIG, MODEL_RATES, DailySnapshot, ModelUsage, UsageApiItem } from './types';
import { formatCompact, resolveJsonPath, isAuthError, calcCredits, buildUsageUrl, getShanghaiTime, getUtcTime } from './utils';
import { httpGet, httpPost } from './http';
import { saveDailySnapshot, loadHistory, cleanupOldRequestLogs, saveTeamSnapshot, getAccount, loadMonthlyUsage } from './storage';

// ============================================================
// Token Viewer - API 请求与数据处理
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

/** 检查行是否应该显示（板块开关 + 行开关都必须开启） */
function isLineShown(sections: TooltipSection[], lines: Record<TooltipLineKey, boolean>, lineKey: TooltipLineKey): boolean {
    return sections.includes(LINE_TO_SECTION[lineKey]) && lines[lineKey];
}

/** 获取配置 */
export function getConfig() {
    const config = vscode.workspace.getConfiguration('tokenViewer');
    const sections = (['account', 'todayUsage', 'prediction', 'budget', 'modelRates', 'cacheHitRate', 'github'] as TooltipSection[])
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

/** 错误处理 */
function handleFetchError(app: AppState, message: string, detail?: string): void {
    if (app.lastTokenCount !== undefined) {
        const compact = formatCompact(app.lastTokenCount);
        const formatted = app.lastTokenCount.toLocaleString('zh-CN');
        app.statusBarItem.text = `$(warning) ${compact} ⚠`;
        app.statusBarItem.tooltip = `Token Viewer - 请求失败\n${message}\n保留上次的值: ${formatted}`;
    } else {
        app.statusBarItem.text = '$(error) Credits: Error';
        app.statusBarItem.tooltip = `Token Viewer - 请求失败\n${message}`;
    }

    app.outputChannel.appendLine(`[Token Viewer] 错误: ${message}`);
    if (detail) {
        app.outputChannel.appendLine(`[Token Viewer] 详情: ${detail}`);
    }
    app.outputChannel.appendLine('');
}

/** Cookie 过期自动更新流程 — 通过浏览器自动获取 Cookie */
export async function triggerCookieRefresh(app: AppState, context: vscode.ExtensionContext): Promise<void> {
    if (app.isRefreshingCookie) { return; }
    app.isRefreshingCookie = true;

    try {
        app.outputChannel.appendLine('[Token Viewer] 🔔 Cookie 过期，启动浏览器自动获取');

        const { captureCookieViaBrowser } = require('./browser');
        await captureCookieViaBrowser(app, context);

    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        app.outputChannel.appendLine(`[Token Viewer] Cookie 更新流程出错: ${msg}`);
        vscode.window.showErrorMessage(`Cookie 更新失败: ${msg}`);
    } finally {
        app.isRefreshingCookie = false;
    }
}

// ============================================================
// 主获取函数
// ============================================================

export async function fetchTokenCount(app: AppState, context: vscode.ExtensionContext): Promise<void> {
    if (app.isFetching) { return; }
    app.isFetching = true;

    const config = getConfig();

    if (!config.headers['Cookie']) {
        app.statusBarItem.text = '$(warning) Credits: 未配置';
        app.statusBarItem.tooltip = '请点击状态栏 → Token Viewer: 配置 Cookie';
        app.outputChannel.appendLine('[Token Viewer] 警告：未配置 Cookie，请运行 Token Viewer: 配置 Cookie');
        app.isFetching = false;
        return;
    }

    try {
        const headers: Record<string, string> = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            ...config.headers,
        };

        app.outputChannel.appendLine(`[Token Viewer] 正在请求: ${XIAOMI_CONFIG.apiUrl}`);

        const responseBody = await httpGet(XIAOMI_CONFIG.apiUrl, headers);

        let jsonData: any;
        try {
            jsonData = JSON.parse(responseBody);
        } catch (parseError) {
            const errorMsg = `JSON 解析失败: ${parseError instanceof Error ? parseError.message : String(parseError)}`;
            handleFetchError(app, errorMsg, `响应内容: ${responseBody.substring(0, 500)}`);
            return;
        }

        const tokenCount = resolveJsonPath(jsonData, XIAOMI_CONFIG.jsonPath);

        if (tokenCount === undefined || tokenCount === null) {
            handleFetchError(
                app,
                `无法按路径 "${XIAOMI_CONFIG.jsonPath}" 解析 Token 数量`,
                `JSON 结构: ${JSON.stringify(jsonData).substring(0, 500)}`
            );
            return;
        }

        const tokenNum = Number(tokenCount);
        if (isNaN(tokenNum)) {
            handleFetchError(
                app,
                `路径 "${XIAOMI_CONFIG.jsonPath}" 的值不是有效数字: ${tokenCount}`,
                `JSON 结构: ${JSON.stringify(jsonData).substring(0, 500)}`
            );
            return;
        }

        let percentage: number | undefined;
        let totalTokens: number | undefined;
        const totalVal = resolveJsonPath(jsonData, XIAOMI_CONFIG.totalPath);
        const usedVal = resolveJsonPath(jsonData, XIAOMI_CONFIG.usedPath);
        if (totalVal !== undefined && totalVal !== null) {
            totalTokens = Number(totalVal);
            if (!isNaN(totalTokens) && totalTokens > 0) {
                if (usedVal !== undefined && usedVal !== null) {
                    const usedNum = Number(usedVal);
                    if (!isNaN(usedNum)) {
                        percentage = ((totalTokens - usedNum) / totalTokens) * 100;
                    }
                } else {
                    percentage = (tokenNum / totalTokens) * 100;
                }
            }
        }

        // 成功
        app.cookieErrorCount = 0;
        app.lastTokenCount = tokenNum;
        context.globalState.update('tokenViewer.lastTokenCount', tokenNum);

        // 半小时用量提醒
        const nowMs = Date.now();
        const NOTIFY_INTERVAL = 30 * 60 * 1000;
        if (app.lastNotifyTime !== undefined && (nowMs - app.lastNotifyTime) >= NOTIFY_INTERVAL) {
            const elapsed = Math.round((nowMs - app.lastNotifyTime) / 60000);
            reportModelUsage(app, headers, tokenNum, elapsed).catch(err => {
                app.outputChannel.appendLine(`[Token Viewer] 模型用量报告失败: ${err instanceof Error ? err.message : String(err)}`);
            });
            app.lastNotifyTime = nowMs;
            app.lastNotifyToken = tokenNum;
            context.globalState.update('tokenViewer.lastNotifyTime', nowMs);
            context.globalState.update('tokenViewer.lastNotifyToken', tokenNum);
        } else if (app.lastNotifyTime === undefined) {
            app.lastNotifyTime = nowMs;
            app.lastNotifyToken = tokenNum;
            context.globalState.update('tokenViewer.lastNotifyTime', nowMs);
            context.globalState.update('tokenViewer.lastNotifyToken', tokenNum);
        }

        // 获取今日用量数据（用于显示和存储）
        const todayData = await fetchTodayData(headers, app.outputChannel);

        // 追踪已知模型列表
        if (todayData) {
            const currentModels = Object.keys(todayData.models);
            const knownModels = context.globalState.get<string[]>('tokenViewer.knownModels', []);
            const merged = [...new Set([...knownModels, ...currentModels])];
            if (merged.length !== knownModels.length || !merged.every(m => knownModels.includes(m))) {
                context.globalState.update('tokenViewer.knownModels', merged);
            }
        }

        // 按用户选择的模型筛选
        const selectedModels = context.globalState.get<string[]>('tokenViewer.selectedModels', []);
        let filteredTodayData = todayData;
        if (todayData && selectedModels.length > 0) {
            const filtered: Record<string, ModelUsage> = {};
            for (const [model, usage] of Object.entries(todayData.models)) {
                if (selectedModels.includes(model)) {
                    filtered[model] = usage;
                }
            }
            filteredTodayData = { ...todayData, models: filtered };
        }

        // 保存每日快照（用上海日期命名，与 loadHistory 一致）
        if (todayData) {
            const snapshot: DailySnapshot = {
                date: getShanghaiTime().dateStr,
                credits: tokenNum,
                totalCredits: totalTokens || 0,
                models: todayData.models,
            };
            saveDailySnapshot(snapshot);

            // 团队共享
            if (config.teamSharePath && config.username) {
                saveTeamSnapshot(config.username, config.teamSharePath, snapshot);
            }

            // 清理旧日志
            cleanupOldRequestLogs(7);
        }

        // 格式化显示
        const compact = formatCompact(tokenNum);
        const fullFormatted = tokenNum.toLocaleString('zh-CN');
        const percentStr = percentage !== undefined ? ` (${percentage.toFixed(1)}%)` : '';
        app.statusBarItem.text = `$(robot) ${compact}${percentStr}`;
        const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        let tooltipText = `Token Viewer - 小米 MiMo Credits\n当前剩余: ${fullFormatted}（${compact}）`;
        if (percentage !== undefined) {
            tooltipText += `\n剩余百分比: ${percentage.toFixed(1)}%`;
        }
        if (totalTokens !== undefined) {
            tooltipText += `\n总量: ${totalTokens.toLocaleString('zh-CN')}（${formatCompact(totalTokens)}）`;
        }

        // 按用户选择的板块和行生成 tooltip
        const sections = config.tooltipSections;
        const lines = config.tooltipLines;

        // 账号信息
        if (isLineShown(sections, lines, 'accountName')) {
            const activeAccountId = context.globalState.get<string>('tokenViewer.activeAccountId');
            if (activeAccountId) {
                const account = getAccount(activeAccountId);
                if (account) {
                    tooltipText = `账号: ${account.name}\n` + tooltipText;
                }
            }
        }

        // 今日用量
        if (sections.includes('todayUsage') && filteredTodayData) {
            const todayFormatted = formatTodayUsage(filteredTodayData.models, totalTokens, lines);
            if (todayFormatted) {
                tooltipText += `\n\n今日用量`;
                tooltipText += todayFormatted;
            }
        }

        // 消耗预测
        if (isLineShown(sections, lines, 'predictionDays')) {
            const prediction = calculatePrediction(tokenNum);
            if (prediction) {
                tooltipText += `\n\n消耗预测`;
                tooltipText += prediction;
            }
        }

        // 预算信息和告警（按当月累计计算，只加载一次）
        if (config.monthlyBudget > 0) {
            const monthlyModels = loadMonthlyUsage();
            const totalCreditsUsed = Object.values(monthlyModels).reduce((sum, m) => sum + m.credits, 0);

            // Tooltip 显示
            if (isLineShown(sections, lines, 'budgetUsed')) {
                const budgetUsedPercent = (totalCreditsUsed / config.monthlyBudget) * 100;
                tooltipText += `\n\n月度预算`;
                tooltipText += `\n已消耗: ${formatCompact(totalCreditsUsed)} / ${formatCompact(config.monthlyBudget)} (${budgetUsedPercent.toFixed(1)}%)`;
            }

            // 预算告警
            checkBudgetAlerts(context, monthlyModels, config.monthlyBudget, config.budgetAlertLevels);
        }

        // 消耗比例
        if (sections.includes('modelRates')) {
            const hasAnyRate = lines.ratesCacheHit || lines.ratesInput || lines.ratesOutput;
            if (hasAnyRate) {
                tooltipText += `\n\n消耗比例 (Credits/Token)`;
                for (const [model, rates] of Object.entries(MODEL_RATES)) {
                    tooltipText += `\n${model}`;
                    const parts: string[] = [];
                    if (lines.ratesCacheHit) { parts.push(`缓存命中: ${rates.cacheHit}`); }
                    if (lines.ratesInput) { parts.push(`输入: ${rates.input}`); }
                    if (lines.ratesOutput) { parts.push(`输出: ${rates.output}`); }
                    tooltipText += `\n${parts.join(' | ')}`;
                }
            }
        }

        // 缓存命中率
        if (sections.includes('cacheHitRate') && filteredTodayData) {
            const models = filteredTodayData.models;
            const modelEntries = Object.entries(models);
            if (modelEntries.length > 0) {
                tooltipText += `\n\n缓存命中率`;
                let totalHit = 0;
                let totalMiss = 0;
                for (const [model, e] of modelEntries) {
                    const hitTotal = e.inputHit + e.inputMiss;
                    const hitRate = hitTotal > 0 ? (e.inputHit / hitTotal * 100) : 0;
                    tooltipText += `\n  ${model}: ${hitRate.toFixed(1)}%`;
                    totalHit += e.inputHit;
                    totalMiss += e.inputMiss;
                }
                const overallTotal = totalHit + totalMiss;
                if (overallTotal > 0) {
                    tooltipText += `\n  总计: ${(totalHit / overallTotal * 100).toFixed(1)}%`;
                }
            }
        }

        // GitHub 链接
        if (isLineShown(sections, lines, 'githubLink')) {
            tooltipText += `\n本项目地址:github.com/bynlk/token-viewer`;
        }

        tooltipText += `\n\n最后更新: ${now}\n点击刷新`;
        app.statusBarItem.tooltip = tooltipText;

        // 告警
        if (app.alertPausedUntil && Date.now() < app.alertPausedUntil) {
            app.statusBarItem.backgroundColor = undefined;
        } else if (tokenNum <= config.alertThreshold) {
            app.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            if (!app.alertShown) {
                app.alertShown = true;
                vscode.window.showWarningMessage(
                    `⚠️ Credits 不足！当前剩余: ${fullFormatted}${percentStr}，阈值: ${config.alertThreshold.toLocaleString('zh-CN')}`
                );
            }
        } else {
            app.statusBarItem.backgroundColor = undefined;
            app.alertShown = false;
        }


        // 通知 Dashboard 刷新
        if (app.dashboardPanel) {
            app.dashboardPanel.webview.postMessage({ type: 'refresh' });
        }

        app.outputChannel.appendLine(`[Token Viewer] ✅ Credits: ${fullFormatted}${percentStr}`);

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (isAuthError(errorMsg)) {
            app.cookieErrorCount++;
            app.outputChannel.appendLine(`[Token Viewer] 🔔 认证错误 (第 ${app.cookieErrorCount} 次): ${errorMsg}`);

            if (app.cookieErrorCount >= 2 && !app.isRefreshingCookie) {
                await triggerCookieRefresh(app, context);
            } else {
                handleFetchError(app, errorMsg, 'Cookie 可能已过期，连续失败 2 次后将自动打开登录页面');
            }
        } else {
            handleFetchError(app, errorMsg, undefined);
        }
    } finally {
        app.isFetching = false;
    }
}

// ============================================================
// 今日用量数据获取（结构化）
// ============================================================

interface TodayData {
    date: string;
    models: Record<string, ModelUsage>;
}

export async function fetchTodayData(headers: Record<string, string>, outputChannel?: vscode.OutputChannel): Promise<TodayData | null> {
    try {
        const postHeaders: Record<string, string> = {
            ...headers,
            'origin': 'https://platform.xiaomimimo.com',
            'referer': 'https://platform.xiaomimimo.com/console/plan-manage',
            'x-timezone': 'Asia/Shanghai',
        };
        // API 返回的日期为 UTC 时间，用 UTC 日期请求和筛选
        const utc = getUtcTime();
        const body = JSON.stringify({ year: utc.year, month: utc.month });
        const url = buildUsageUrl(headers['Cookie'] || '');
        outputChannel?.appendLine(`[Token Viewer] 请求今日用量: ${url}`);
        const responseBody = await httpPost(url, postHeaders, body);
        outputChannel?.appendLine(`[Token Viewer] 用量 API 响应: ${responseBody.substring(0, 300)}`);
        const json = JSON.parse(responseBody);

        if (json.code !== 0 || !Array.isArray(json.data)) {
            const errMsg = json.message || '未知错误';
            outputChannel?.appendLine(`[Token Viewer] 用量 API 返回异常: code=${json.code}, message=${errMsg}`);
            if (json.code === 401 || json.code === 403) {
                throw new Error(`认证失败: ${errMsg}`);
            }
            return null;
        }

        const today = utc.dateStr;
        outputChannel?.appendLine(`[Token Viewer] 今日日期(UTC): ${today}, API 返回 ${json.data.length} 条记录`);
        const models: Record<string, ModelUsage> = {};

        for (const item of json.data as UsageApiItem[]) {
            if (item.date !== today) { continue; }
            const model = item.model;
            if (!models[model]) {
                models[model] = { totalToken: 0, inputHit: 0, inputMiss: 0, output: 0, credits: 0, requests: 0 };
            }
            models[model].totalToken += item.totalToken || 0;
            models[model].inputHit += item.inputHitToken || 0;
            models[model].inputMiss += item.inputMissToken || 0;
            models[model].output += item.outputToken || 0;
            models[model].requests += item.requestCount || 0;
        }

        // 计算每个模型的 credits
        for (const [model, usage] of Object.entries(models)) {
            usage.credits = calcCredits(model, usage.inputHit, usage.inputMiss, usage.output);
        }

        return { date: today, models };
    } catch (err) {
        outputChannel?.appendLine(`[Token Viewer] 今日用量获取失败: ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
}

// ============================================================
// Tooltip 格式化
// ============================================================

function formatTodayUsage(models: Record<string, ModelUsage>, totalCredits?: number, lineSettings?: Record<TooltipLineKey, boolean>): string {
    const output: string[] = [];
    let allTotal = 0;
    let allCredits = 0;

    for (const [model, e] of Object.entries(models)) {
        allTotal += e.totalToken;
        allCredits += e.credits;
        output.push(`\n${model}`);
        if (!lineSettings || lineSettings.todayToken) {
            output.push(`  token: ${e.totalToken.toLocaleString('zh-CN')}（${formatCompact(e.totalToken)}）`);
        }
        if (!lineSettings || lineSettings.todayCredits) {
            output.push(`  credits: ${e.credits.toLocaleString('zh-CN')}（${formatCompact(e.credits)}）`);
        }
        if (!lineSettings || lineSettings.todayRequests) {
            const avgPerToken = e.totalToken > 0 ? e.credits / e.totalToken : 0;
            output.push(`  请求: ${e.requests}次 | 均值 ≈ ${avgPerToken.toFixed(1)} credits/token`);
        }
        if (!lineSettings || lineSettings.todayCacheHitRate) {
            const hitTotal = e.inputHit + e.inputMiss;
            const hitRate = hitTotal > 0 ? (e.inputHit / hitTotal * 100) : 0;
            output.push(`  缓存命中率: ${hitRate.toFixed(1)}%`);
        }
    }

    if ((!lineSettings || lineSettings.todayTotal) && totalCredits !== undefined && totalCredits > 0) {
        const usedPercent = (allCredits / totalCredits) * 100;
        output.push(`\n今日总消耗: ${allCredits.toLocaleString('zh-CN')}（${formatCompact(allCredits)}）`);
        output.push(`今日 token: ${allTotal.toLocaleString('zh-CN')}（${formatCompact(allTotal)}）`);
        output.push(`占总量: ${usedPercent.toFixed(1)}%`);
    }

    return output.length > 0 ? output.join('\n') : '';
}

// ============================================================
// 按模型用量报告（30分钟通知）
// ============================================================

async function reportModelUsage(
    app: AppState,
    headers: Record<string, string>,
    currentCredits: number,
    elapsedMin: number
): Promise<void> {
    const data = await fetchTodayData(headers);
    if (!data) { return; }

    const todayEntries: Record<string, { total: number; requests: number }> = {};
    for (const [model, usage] of Object.entries(data.models)) {
        todayEntries[model] = {
            total: usage.inputHit + usage.inputMiss + usage.output,
            requests: usage.requests,
        };
    }

    // 计算差值
    const lines: string[] = [];
    if (app.lastModelUsage) {
        for (const [model, entry] of Object.entries(todayEntries)) {
            const prev = app.lastModelUsage[model] || 0;
            const delta = entry.total - prev;
            if (delta > 0) {
                lines.push(`  ${model}: ${formatCompact(delta)} (${entry.requests}次)`);
            }
        }
    }

    // 更新快照
    const newSnapshot: Record<string, number> = {};
    for (const [model, entry] of Object.entries(todayEntries)) {
        newSnapshot[model] = entry.total;
    }
    app.lastModelUsage = newSnapshot;

    // 发送通知
    if (lines.length > 0) {
        const currentCompact = formatCompact(currentCredits);
        vscode.window.showInformationMessage(
            `🤖 ${elapsedMin}分钟用量报告\n${lines.join('\n')}\n💰 Credits 剩余: ${currentCompact}`
        );
    } else {
        const currentCompact = formatCompact(currentCredits);
        const summary = Object.entries(todayEntries)
            .map(([m, e]) => `  ${m}: ${formatCompact(e.total)}`)
            .join('\n');
        if (summary) {
            vscode.window.showInformationMessage(
                `🤖 今日累计用量\n${summary}\n💰 Credits 剩余: ${currentCompact}`
            );
        }
    }
}

// ============================================================
// 消耗预测
// ============================================================

function calculatePrediction(currentCredits: number): string | null {
    const history = loadHistory(7);
    if (history.length < 2) { return null; }

    const first = history[0];
    const last = history[history.length - 1];
    const daysDiff = history.length - 1;
    if (daysDiff <= 0) { return null; }

    const dailyConsumption = (first.credits - last.credits) / daysDiff;
    if (dailyConsumption <= 0) { return null; }

    const daysRemaining = currentCredits / dailyConsumption;
    const hoursRemaining = Math.round((daysRemaining % 1) * 24);
    const fullDays = Math.floor(daysRemaining);

    if (fullDays > 365) {
        return `\n预计还能用: > 1年`;
    }
    return `\n预计还能用: ${fullDays}天${hoursRemaining}小时（基于近${history.length}天数据）`;
}

// ============================================================
// 预算告警
// ============================================================

function checkBudgetAlerts(
    context: vscode.ExtensionContext,
    models: Record<string, ModelUsage>,
    budget: number,
    levels: number[]
): void {
    const totalUsed = Object.values(models).reduce((sum, m) => sum + m.credits, 0);
    const percent = (totalUsed / budget) * 100;

    const triggeredKey = 'tokenViewer.budgetAlertsTriggered';
    const triggered = context.globalState.get<number[]>(triggeredKey, []);

    for (const level of levels) {
        if (percent >= level && !triggered.includes(level)) {
            triggered.push(level);
            context.globalState.update(triggeredKey, triggered);
            vscode.window.showWarningMessage(
                `⚠️ 月度预算已用 ${percent.toFixed(1)}%（${level}% 告警）\n已消耗: ${formatCompact(totalUsed)} / ${formatCompact(budget)}`
            );
        }
    }
}
