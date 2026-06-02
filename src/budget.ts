import * as vscode from 'vscode';
import { ModelUsage } from './types';
import { formatCompact } from './utils';

// ============================================================
// Token Viewer - 预算管理与告警
// ============================================================

/** 检查预算告警并触发通知 */
export function checkBudgetAlerts(
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

/** 格式化预算板块 tooltip */
export function formatBudgetTooltip(
    totalCreditsUsed: number,
    monthlyBudget: number
): string {
    const budgetUsedPercent = (totalCreditsUsed / monthlyBudget) * 100;
    return `\n\n月度预算\n已消耗: ${formatCompact(totalCreditsUsed)} / ${formatCompact(monthlyBudget)} (${budgetUsedPercent.toFixed(1)}%)`;
}
