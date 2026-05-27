import * as vscode from 'vscode';
import { AppState, XIAOMI_CONFIG, MODEL_RATES, DailySnapshot, ModelUsage, UsageApiItem } from './types';
import { formatCompact, resolveJsonPath, isAuthError, calcCredits, buildUsageUrl, getShanghaiTime } from './utils';
import { httpGet, httpPost } from './http';
import { saveDailySnapshot, loadHistory, cleanupOldRequestLogs, saveTeamSnapshot, getAccount } from './storage';

// ============================================================
// Token Viewer - API 请求与数据处理
// ============================================================

/** 获取配置 */
export function getConfig() {
    const config = vscode.workspace.getConfiguration('tokenViewer');
    return {
        headers: config.get<Record<string, string>>('headers', {}),
        refreshInterval: config.get<number>('refreshInterval', 10),
        alertThreshold: config.get<number>('alertThreshold', 100000000),
        monthlyBudget: config.get<number>('monthlyBudget', 0),
        budgetAlertLevels: config.get<number[]>('budgetAlertLevels', [50, 80, 100]),
        teamSharePath: config.get<string>('teamSharePath', ''),
        username: config.get<string>('username', ''),
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

/** Cookie 过期自动更新流程 */
export async function triggerCookieRefresh(app: AppState, context: vscode.ExtensionContext): Promise<void> {
    if (app.isRefreshingCookie) { return; }
    app.isRefreshingCookie = true;

    try {
        app.outputChannel.appendLine('[Token Viewer] 🔔 Cookie 过期，触发自动更新流程');

        vscode.env.openExternal(vscode.Uri.parse(XIAOMI_CONFIG.loginUrl));

        const action = await vscode.window.showWarningMessage(
            '⚠️ 小米 MiMo 的 Cookie 已过期！\n\n' +
            '已打开登录页面，请在浏览器中登录后，复制新的 Cookie。\n' +
            '然后点击「更新 Cookie」按钮。',
            '更新 Cookie',
            '稍后再说'
        );

        if (action !== '更新 Cookie') {
            app.outputChannel.appendLine('[Token Viewer] 用户选择稍后更新 Cookie');
            app.isRefreshingCookie = false;
            return;
        }

        const newCookie = await vscode.window.showInputBox({
            prompt: '请粘贴新的 Cookie\n\n获取方法：浏览器登录 → F12 → Network → Headers → 复制 Cookie',
            placeHolder: '粘贴新的 Cookie 字符串...',
            validateInput: (value) => {
                if (!value || value.trim() === '') { return 'Cookie 不能为空'; }
                return null;
            },
        });

        if (newCookie === undefined) {
            app.outputChannel.appendLine('[Token Viewer] 用户取消了 Cookie 更新');
            app.isRefreshingCookie = false;
            return;
        }

        const vscodeConfig = vscode.workspace.getConfiguration('tokenViewer');
        await vscodeConfig.update('headers', { 'Cookie': newCookie }, vscode.ConfigurationTarget.Global);

        app.outputChannel.appendLine('[Token Viewer] ✅ Cookie 已更新，正在重新验证...');
        app.cookieErrorCount = 0;

        await fetchTokenCount(app, context);
        vscode.window.showInformationMessage('✅ Cookie 已更新，Credits 数据已刷新！');

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

        // 保存每日快照
        if (todayData) {
            const snapshot: DailySnapshot = {
                date: todayData.date,
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

        // 账号信息
        const activeAccountId = context.globalState.get<string>('tokenViewer.activeAccountId');
        if (activeAccountId) {
            const account = getAccount(activeAccountId);
            if (account) {
                tooltipText = `账号: ${account.name}\n` + tooltipText;
            }
        }

        // 今日用量
        if (todayData) {
            const todayFormatted = formatTodayUsage(todayData.models, totalTokens);
            if (todayFormatted) {
                tooltipText += `\n\n今日用量`;
                tooltipText += todayFormatted;
            }
        }

        // 消耗预测
        const prediction = calculatePrediction(tokenNum);
        if (prediction) {
            tooltipText += `\n\n消耗预测`;
            tooltipText += prediction;
        }

        // 预算信息
        if (config.monthlyBudget > 0 && todayData) {
            const totalCreditsUsed = Object.values(todayData.models).reduce((sum, m) => sum + m.credits, 0);
            const budgetUsedPercent = (totalCreditsUsed / config.monthlyBudget) * 100;
            tooltipText += `\n\n月度预算`;
            tooltipText += `\n已消耗: ${formatCompact(totalCreditsUsed)} / ${formatCompact(config.monthlyBudget)} (${budgetUsedPercent.toFixed(1)}%)`;
        }

        // 消耗比例
        tooltipText += `\n\n消耗比例 (Credits/Token)`;
        for (const [model, rates] of Object.entries(MODEL_RATES)) {
            tooltipText += `\n${model}`;
            tooltipText += `\n缓存命中: ${rates.cacheHit} 输入: ${rates.input} 输出: ${rates.output}`;
        }
        tooltipText += `\n本项目Github:github.com/bynlk/token-viewer`;
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

        // 预算告警
        if (config.monthlyBudget > 0 && todayData) {
            checkBudgetAlerts(app, context, todayData.models, config.monthlyBudget, config.budgetAlertLevels);
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
        const now = getShanghaiTime();
        const body = JSON.stringify({ year: now.year, month: now.month });
        const url = buildUsageUrl(headers['Cookie'] || '');
        outputChannel?.appendLine(`[Token Viewer] 请求今日用量: ${url}`);
        const responseBody = await httpPost(url, postHeaders, body);
        outputChannel?.appendLine(`[Token Viewer] 用量 API 响应: ${responseBody.substring(0, 300)}`);
        const json = JSON.parse(responseBody);

        if (json.code !== 0 || !Array.isArray(json.data)) {
            outputChannel?.appendLine(`[Token Viewer] 用量 API 返回异常: code=${json.code}, message=${json.message}`);
            return null;
        }

        const today = now.dateStr;
        outputChannel?.appendLine(`[Token Viewer] 今日日期(上海时区): ${today}, API 返回 ${json.data.length} 条记录`);
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

function formatTodayUsage(models: Record<string, ModelUsage>, totalCredits?: number): string {
    const lines: string[] = [];
    let allTotal = 0;
    let allCredits = 0;

    for (const [model, e] of Object.entries(models)) {
        allTotal += e.totalToken;
        allCredits += e.credits;
        const avgPerToken = e.totalToken > 0 ? e.credits / e.totalToken : 0;
        lines.push(`\n${model}`);
        lines.push(`  token: ${e.totalToken.toLocaleString('zh-CN')}（${formatCompact(e.totalToken)}）`);
        lines.push(`  credits: ${e.credits.toLocaleString('zh-CN')}（${formatCompact(e.credits)}）`);
        lines.push(`  请求: ${e.requests}次 | 平均 ≈ ${avgPerToken.toFixed(1)} credits/token`);
    }

    if (totalCredits !== undefined && totalCredits > 0) {
        const usedPercent = (allCredits / (totalCredits + allCredits)) * 100;
        lines.push(`\n今日总消耗: ${allCredits.toLocaleString('zh-CN')}（${formatCompact(allCredits)}）`);
        lines.push(`今日 token: ${allTotal.toLocaleString('zh-CN')}（${formatCompact(allTotal)}）`);
        lines.push(`占总量: ${usedPercent.toFixed(1)}%`);
    }

    return lines.length > 0 ? lines.join('\n') : '';
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
    app: AppState,
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
