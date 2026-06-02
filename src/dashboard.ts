import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AppState, MODEL_RATES, DailySnapshot, ModelUsage } from './types';
import { formatCompact, calcCredits, getShanghaiTime } from './utils';
import { loadHistory, loadRequestLogs, loadTeamSnapshots, getChartJsPath, isChartJsDownloaded, downloadChartJs } from './storage';
import { fetchTodayData } from './api';
import { getConfig } from './config';
import { calculateDashboardPrediction } from './prediction';
import { buildDashboardHtml } from './dashboard-html';

// ============================================================
// Token Viewer - Webview Dashboard
// ============================================================

export async function openDashboard(app: AppState, context: vscode.ExtensionContext): Promise<void> {
    if (app.dashboardPanel) {
        app.dashboardPanel.reveal(vscode.ViewColumn.One);
        return;
    }

    // 确保 Chart.js 已下载
    if (!isChartJsDownloaded()) {
        app.outputChannel.appendLine('[Token Viewer] 正在下载 Chart.js...');
        const downloaded = await downloadChartJs();
        if (!downloaded) {
            vscode.window.showWarningMessage('Chart.js 下载失败，图表功能将不可用。请检查网络连接。');
        }
    }

    app.dashboardPanel = vscode.window.createWebviewPanel(
        'tokenViewerDashboard',
        'Token Viewer Dashboard',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                context.globalStorageUri,
                vscode.Uri.file(path.join(context.extensionPath, 'src', 'panel')),
            ],
        }
    );

    app.dashboardPanel.webview.html = getDashboardHtml(app, context);

    app.dashboardPanel.webview.onDidReceiveMessage(
        async (message) => {
            switch (message.type) {
                case 'refresh':
                    app.dashboardPanel!.webview.html = getDashboardHtml(app, context);
                    break;
                case 'requestData':
                    const data = await getDashboardData(message.days || 7, app.lastTokenCount);
                    app.dashboardPanel!.webview.postMessage({ type: 'data', payload: data });
                    break;
                case 'requestLogs':
                    const logs = loadRequestLogs(message.date || getShanghaiTime().dateStr);
                    app.dashboardPanel!.webview.postMessage({ type: 'logs', payload: logs });
                    break;
            }
        },
        undefined,
        context.subscriptions
    );

    app.dashboardPanel.onDidDispose(() => {
        app.dashboardPanel = undefined;
    }, null, context.subscriptions);
}

// ============================================================
// 数据聚合
// ============================================================

interface DashboardData {
    snapshots: DailySnapshot[];
    today: TodayData | null;
    team: Record<string, DailySnapshot>;
    prediction: string | null;
    savings: SavingsResult | null;
    config: ReturnType<typeof getConfig>;
}

interface TodayData {
    date: string;
    models: Record<string, ModelUsage>;
}

interface SavingsResult {
    currentCost: number;
    cheapestCost: number;
    savings: number;
    savingsPercent: number;
    breakdown: Record<string, { current: number; alternative: number; tokens: number }>;
}

async function getDashboardData(days: number, lastTokenCount?: number): Promise<DashboardData> {
    const snapshots = loadHistory(days);
    const config = getConfig();
    let today = null;
    try {
        const headers = { ...config.headers, 'Accept': 'application/json', 'Content-Type': 'application/json' };
        today = await fetchTodayData(headers);
    } catch { /* ignore */ }

    // 如果今日数据获取失败，从最新快照中恢复
    if (!today && snapshots.length > 0) {
        const latest = snapshots[snapshots.length - 1];
        if (latest.models && Object.keys(latest.models).length > 0) {
            today = { date: latest.date, models: latest.models };
        }
    }

    // 如果仍然没有快照，用 lastTokenCount 构造最小数据
    if (snapshots.length === 0 && lastTokenCount !== undefined) {
        const todayStr = getShanghaiTime().dateStr;
        snapshots.push({ date: todayStr, credits: lastTokenCount, totalCredits: 0, models: {} });
    }

    const team = config.teamSharePath ? loadTeamSnapshots(config.teamSharePath) : {};

    // 消耗预测
    const prediction = calculateDashboardPrediction(snapshots);

    // 成本对比
    let savings = null;
    if (today) {
        savings = calculateSavings(today.models);
    }

    return { snapshots, today, team, prediction, savings, config };
}

// ============================================================
// 成本对比分析
// ============================================================

export function calculateSavings(models: Record<string, ModelUsage>): SavingsResult {
    let currentCost = 0;
    let cheapestCost = 0;
    const breakdown: Record<string, { current: number; alternative: number; tokens: number }> = {};

    // 找到最低费率（排除 _default fallback）
    const realRates = Object.entries(MODEL_RATES).filter(([k]) => k !== '_default');
    const cheapestRates = realRates.reduce((min, [, r]) => ({
        cacheHit: Math.min(min.cacheHit, r.cacheHit),
        input: Math.min(min.input, r.input),
        output: Math.min(min.output, r.output),
    }), { cacheHit: Infinity, input: Infinity, output: Infinity });

    for (const [model, usage] of Object.entries(models)) {
        const current = calcCredits(model, usage.inputHit, usage.inputMiss, usage.output);
        const alternative = usage.inputHit * cheapestRates.cacheHit + usage.inputMiss * cheapestRates.input + usage.output * cheapestRates.output;
        currentCost += current;
        cheapestCost += alternative;
        breakdown[model] = {
            current,
            alternative,
            tokens: usage.totalToken,
        };
    }

    const savings = currentCost - cheapestCost;
    const savingsPercent = currentCost > 0 ? (savings / currentCost) * 100 : 0;

    return { currentCost, cheapestCost, savings, savingsPercent, breakdown };
}

// ============================================================
// HTML 生成
// ============================================================

function getDashboardHtml(app: AppState, context: vscode.ExtensionContext): string {
    const chartJsPath = getChartJsPath();
    const hasChartJs = fs.existsSync(chartJsPath);
    const chartJsUri = hasChartJs
        ? app.dashboardPanel!.webview.asWebviewUri(vscode.Uri.file(chartJsPath)).toString()
        : null;
    const nonce = getNonce();

    return buildDashboardHtml(nonce, hasChartJs, chartJsUri);
}

function getNonce(): string {
    let text = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}
