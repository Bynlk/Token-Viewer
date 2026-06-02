import { DailySnapshot } from './types';
import { formatCompact } from './utils';
import { loadHistory } from './storage';

// ============================================================
// Token Viewer - 消耗预测
// ============================================================

/** 计算消耗预测（基于 7 天历史数据） */
export function calculatePrediction(currentCredits: number): string | null {
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

/** 计算 Dashboard 用的消耗预测文本 */
export function calculateDashboardPrediction(snapshots: DailySnapshot[]): string | null {
    if (snapshots.length < 2) { return null; }

    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    const daysDiff = snapshots.length - 1;
    if (daysDiff <= 0) { return null; }

    const dailyConsumption = (first.credits - last.credits) / daysDiff;
    if (dailyConsumption <= 0 || last.credits <= 0) { return null; }

    const daysRemaining = last.credits / dailyConsumption;
    if (daysRemaining > 365) {
        return '> 1年';
    }
    const fullDays = Math.floor(daysRemaining);
    const hours = Math.round((daysRemaining % 1) * 24);
    return `${fullDays}天${hours}小时`;
}
