import './setup';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { formatTodayUsage, formatModelRates, formatCacheHitRate } from '../formatter';
import { ModelUsage } from '../types';
import { ALL_LINE_KEYS } from '../config';
import type { TooltipLineKey } from '../config';

/** 创建默认的全开行设置 */
function allLinesOn(): Record<TooltipLineKey, boolean> {
    const lines: any = {};
    for (const key of ALL_LINE_KEYS) { lines[key] = true; }
    return lines;
}

/** 创建测试用的 ModelUsage */
function makeUsage(overrides: Partial<ModelUsage> = {}): ModelUsage {
    return {
        totalToken: 10000,
        inputHit: 3000,
        inputMiss: 5000,
        output: 2000,
        credits: 500,
        requests: 10,
        ...overrides,
    };
}

describe('formatTodayUsage', () => {
    it('formats single model with all lines enabled', () => {
        const models = { 'mimo-v2.5-pro': makeUsage() };
        const result = formatTodayUsage(models, 100000, allLinesOn());
        assert.ok(result.includes('mimo-v2.5-pro'));
        assert.ok(result.includes('token:'));
        assert.ok(result.includes('credits:'));
        assert.ok(result.includes('请求:'));
        assert.ok(result.includes('缓存命中率:'));
    });

    it('formats multiple models', () => {
        const models = {
            'mimo-v2.5-pro': makeUsage({ totalToken: 5000 }),
            'mimo-v2.5': makeUsage({ totalToken: 3000 }),
        };
        const result = formatTodayUsage(models, 100000, allLinesOn());
        assert.ok(result.includes('mimo-v2.5-pro'));
        assert.ok(result.includes('mimo-v2.5'));
    });

    it('includes total summary when totalCredits provided', () => {
        const models = { 'mimo-v2.5-pro': makeUsage({ credits: 1000 }) };
        const result = formatTodayUsage(models, 100000, allLinesOn());
        assert.ok(result.includes('今日总消耗'));
        assert.ok(result.includes('占总量'));
        assert.ok(result.includes('1.0%'));
    });

    it('omits total summary when totalCredits is 0', () => {
        const models = { 'mimo-v2.5-pro': makeUsage() };
        const result = formatTodayUsage(models, 0, allLinesOn());
        assert.ok(!result.includes('今日总消耗'));
    });

    it('omits total summary when totalCredits is undefined', () => {
        const models = { 'mimo-v2.5-pro': makeUsage() };
        const result = formatTodayUsage(models, undefined, allLinesOn());
        assert.ok(!result.includes('今日总消耗'));
    });

    it('respects line settings - hides token line', () => {
        const lines = { ...allLinesOn(), todayToken: false, todayTotal: false };
        const models = { 'mimo-v2.5-pro': makeUsage() };
        const result = formatTodayUsage(models, undefined, lines);
        // Should not have "token:" in the output at all
        assert.ok(!result.includes('token:'));
        // But should still have credits
        assert.ok(result.includes('credits:'));
    });

    it('respects line settings - hides credits line', () => {
        const lines = { ...allLinesOn(), todayCredits: false };
        const models = { 'mimo-v2.5-pro': makeUsage() };
        const result = formatTodayUsage(models, 100000, lines);
        const modelSection = result.split('mimo-v2.5-pro')[1];
        assert.ok(!modelSection.includes('credits:'));
    });

    it('respects line settings - hides requests line', () => {
        const lines = { ...allLinesOn(), todayRequests: false };
        const models = { 'mimo-v2.5-pro': makeUsage() };
        const result = formatTodayUsage(models, 100000, lines);
        const modelSection = result.split('mimo-v2.5-pro')[1];
        assert.ok(!modelSection.includes('请求:'));
    });

    it('respects line settings - hides cache hit rate line', () => {
        const lines = { ...allLinesOn(), todayCacheHitRate: false };
        const models = { 'mimo-v2.5-pro': makeUsage() };
        const result = formatTodayUsage(models, 100000, lines);
        const modelSection = result.split('mimo-v2.5-pro')[1];
        assert.ok(!modelSection.includes('缓存命中率:'));
    });

    it('respects line settings - hides total summary', () => {
        const lines = { ...allLinesOn(), todayTotal: false };
        const models = { 'mimo-v2.5-pro': makeUsage({ credits: 1000 }) };
        const result = formatTodayUsage(models, 100000, lines);
        assert.ok(!result.includes('今日总消耗'));
    });

    it('returns empty string for empty models with no totalCredits', () => {
        const result = formatTodayUsage({}, undefined, allLinesOn());
        assert.equal(result, '');
    });

    it('returns total summary even with empty models when totalCredits provided', () => {
        const result = formatTodayUsage({}, 100000, allLinesOn());
        // With empty models, allCredits=0, but total summary still renders
        assert.ok(result.includes('今日总消耗'));
    });

    it('works without lineSettings (shows all)', () => {
        const models = { 'mimo-v2.5-pro': makeUsage() };
        const result = formatTodayUsage(models, 100000);
        assert.ok(result.includes('token:'));
        assert.ok(result.includes('credits:'));
        assert.ok(result.includes('请求:'));
        assert.ok(result.includes('缓存命中率:'));
        assert.ok(result.includes('今日总消耗'));
    });

    it('calculates hit rate correctly', () => {
        const models = { 'test': makeUsage({ inputHit: 750, inputMiss: 250 }) };
        const result = formatTodayUsage(models, undefined, allLinesOn());
        assert.ok(result.includes('75.0%'));
    });

    it('handles zero hit/miss (0% hit rate)', () => {
        const models = { 'test': makeUsage({ inputHit: 0, inputMiss: 0 }) };
        const result = formatTodayUsage(models, undefined, allLinesOn());
        assert.ok(result.includes('0.0%'));
    });
});

describe('formatModelRates', () => {
    it('formats all rates when all enabled', () => {
        const result = formatModelRates({ ratesCacheHit: true, ratesInput: true, ratesOutput: true });
        assert.ok(result.includes('消耗比例'));
        assert.ok(result.includes('mimo-v2.5-pro'));
        assert.ok(result.includes('mimo-v2.5'));
        assert.ok(result.includes('缓存命中'));
        assert.ok(result.includes('输入'));
        assert.ok(result.includes('输出'));
    });

    it('excludes _default from output', () => {
        const result = formatModelRates({ ratesCacheHit: true, ratesInput: true, ratesOutput: true });
        assert.ok(!result.includes('_default'));
    });

    it('hides cache hit rate when disabled', () => {
        const result = formatModelRates({ ratesCacheHit: false, ratesInput: true, ratesOutput: true });
        assert.ok(!result.includes('缓存命中'));
        assert.ok(result.includes('输入'));
    });

    it('hides input rate when disabled', () => {
        const result = formatModelRates({ ratesCacheHit: true, ratesInput: false, ratesOutput: true });
        assert.ok(result.includes('缓存命中'));
        assert.ok(!result.includes('输入'));
    });

    it('hides output rate when disabled', () => {
        const result = formatModelRates({ ratesCacheHit: true, ratesInput: true, ratesOutput: false });
        assert.ok(result.includes('输入'));
        assert.ok(!result.includes('输出'));
    });

    it('returns empty string when all disabled', () => {
        const result = formatModelRates({ ratesCacheHit: false, ratesInput: false, ratesOutput: false });
        assert.equal(result, '');
    });
});

describe('formatCacheHitRate', () => {
    it('formats hit rate for single model', () => {
        const models = { 'mimo-v2.5-pro': makeUsage({ inputHit: 800, inputMiss: 200 }) };
        const result = formatCacheHitRate(models);
        assert.ok(result.includes('缓存命中率'));
        assert.ok(result.includes('mimo-v2.5-pro'));
        assert.ok(result.includes('80.0%'));
        assert.ok(result.includes('总计'));
    });

    it('formats hit rate for multiple models', () => {
        const models = {
            'mimo-v2.5-pro': makeUsage({ inputHit: 900, inputMiss: 100 }),
            'mimo-v2.5': makeUsage({ inputHit: 500, inputMiss: 500 }),
        };
        const result = formatCacheHitRate(models);
        assert.ok(result.includes('90.0%'));
        assert.ok(result.includes('50.0%'));
    });

    it('calculates overall total correctly', () => {
        const models = {
            'model-a': makeUsage({ inputHit: 900, inputMiss: 100 }),  // 90%
            'model-b': makeUsage({ inputHit: 100, inputMiss: 900 }),  // 10%
        };
        const result = formatCacheHitRate(models);
        // Overall: 1000/2000 = 50%
        assert.ok(result.includes('50.0%'));
    });

    it('returns empty string for empty models', () => {
        const result = formatCacheHitRate({});
        assert.equal(result, '');
    });

    it('handles zero hit and miss', () => {
        const models = { 'test': makeUsage({ inputHit: 0, inputMiss: 0 }) };
        const result = formatCacheHitRate(models);
        assert.ok(result.includes('0.0%'));
    });
});
