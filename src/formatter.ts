import { MODEL_RATES, ModelUsage } from './types';
import { formatCompact } from './utils';
import { TooltipLineKey } from './config';

// ============================================================
// Token Viewer - Tooltip 格式化
// ============================================================

/** 格式化今日用量到 tooltip 字符串 */
export function formatTodayUsage(
    models: Record<string, ModelUsage>,
    totalCredits?: number,
    lineSettings?: Record<TooltipLineKey, boolean>
): string {
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

/** 格式化消耗比例板块 */
export function formatModelRates(
    lineSettings: { ratesCacheHit: boolean; ratesInput: boolean; ratesOutput: boolean }
): string {
    const hasAnyRate = lineSettings.ratesCacheHit || lineSettings.ratesInput || lineSettings.ratesOutput;
    if (!hasAnyRate) { return ''; }

    let text = `\n\n消耗比例 (Credits/Token)`;
    for (const [model, rates] of Object.entries(MODEL_RATES)) {
        if (model === '_default') { continue; }
        text += `\n${model}`;
        const parts: string[] = [];
        if (lineSettings.ratesCacheHit) { parts.push(`缓存命中: ${rates.cacheHit}`); }
        if (lineSettings.ratesInput) { parts.push(`输入: ${rates.input}`); }
        if (lineSettings.ratesOutput) { parts.push(`输出: ${rates.output}`); }
        text += `\n${parts.join(' | ')}`;
    }
    return text;
}

/** 格式化缓存命中率板块 */
export function formatCacheHitRate(models: Record<string, ModelUsage>): string {
    const modelEntries = Object.entries(models);
    if (modelEntries.length === 0) { return ''; }

    let text = `\n\n缓存命中率`;
    let totalHit = 0;
    let totalMiss = 0;
    for (const [model, e] of modelEntries) {
        const hitTotal = e.inputHit + e.inputMiss;
        const hitRate = hitTotal > 0 ? (e.inputHit / hitTotal * 100) : 0;
        text += `\n  ${model}: ${hitRate.toFixed(1)}%`;
        totalHit += e.inputHit;
        totalMiss += e.inputMiss;
    }
    const overallTotal = totalHit + totalMiss;
    if (overallTotal > 0) {
        text += `\n  总计: ${(totalHit / overallTotal * 100).toFixed(1)}%`;
    }
    return text;
}
