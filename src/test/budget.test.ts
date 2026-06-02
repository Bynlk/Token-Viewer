import './setup';
import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { checkBudgetAlerts, formatBudgetTooltip } from '../budget';
import { createMockContext, window } from './vscode-mock';
import type { ModelUsage } from '../types';

function makeUsage(credits: number): ModelUsage {
    return { totalToken: 1000, inputHit: 0, inputMiss: 0, output: 0, credits, requests: 1 };
}

describe('checkBudgetAlerts', () => {
    beforeEach(() => {
        window._clearWarnings();
    });

    it('triggers alert when usage exceeds level', async () => {
        const ctx = createMockContext();
        const models = { 'mimo-v2.5-pro': makeUsage(60000) };
        // 60000 / 100000 = 60%, should trigger 50% alert
        checkBudgetAlerts(ctx as any, models, 100000, [50, 80, 100]);
        const warnings = window._getWarnings();
        assert.ok(warnings.length > 0);
        assert.ok(warnings[0].includes('50'));
    });

    it('does not trigger alert when usage below all levels', async () => {
        const ctx = createMockContext();
        const models = { 'mimo-v2.5-pro': makeUsage(10000) };
        // 10000 / 100000 = 10%, below all levels
        checkBudgetAlerts(ctx as any, models, 100000, [50, 80, 100]);
        const warnings = window._getWarnings();
        assert.equal(warnings.length, 0);
    });

    it('triggers multiple alerts when crossing multiple levels', async () => {
        const ctx = createMockContext();
        const models = { 'mimo-v2.5-pro': makeUsage(95000) };
        // 95000 / 100000 = 95%, should trigger 50% and 80% but not 100%
        checkBudgetAlerts(ctx as any, models, 100000, [50, 80, 100]);
        const warnings = window._getWarnings();
        assert.equal(warnings.length, 2);
    });

    it('does not re-trigger already triggered levels', async () => {
        const ctx = createMockContext();
        const models = { 'mimo-v2.5-pro': makeUsage(60000) };

        // First call - triggers 50%
        checkBudgetAlerts(ctx as any, models, 100000, [50, 80, 100]);
        const firstCount = window._getWarnings().length;

        // Second call - should not re-trigger 50%
        checkBudgetAlerts(ctx as any, models, 100000, [50, 80, 100]);
        const secondCount = window._getWarnings().length;

        assert.equal(firstCount, 1);
        assert.equal(secondCount, 1); // No new warnings
    });

    it('triggers 100% alert at exact threshold', async () => {
        const ctx = createMockContext();
        const models = { 'mimo-v2.5-pro': makeUsage(100000) };
        checkBudgetAlerts(ctx as any, models, 100000, [50, 80, 100]);
        const warnings = window._getWarnings();
        assert.ok(warnings.some(w => w.includes('100')));
    });

    it('handles empty models', async () => {
        const ctx = createMockContext();
        checkBudgetAlerts(ctx as any, {}, 100000, [50, 80, 100]);
        const warnings = window._getWarnings();
        assert.equal(warnings.length, 0);
    });

    it('aggregates credits from multiple models', async () => {
        const ctx = createMockContext();
        const models = {
            'model-a': makeUsage(30000),
            'model-b': makeUsage(30000),
        };
        // Total: 60000 / 100000 = 60%
        checkBudgetAlerts(ctx as any, models, 100000, [50, 80, 100]);
        const warnings = window._getWarnings();
        assert.ok(warnings.length > 0);
    });
});

describe('formatBudgetTooltip', () => {
    it('formats budget usage with percentage', () => {
        const result = formatBudgetTooltip(50000, 100000);
        assert.ok(result.includes('月度预算'));
        assert.ok(result.includes('50.0%'));
    });

    it('formats 100% budget usage', () => {
        const result = formatBudgetTooltip(100000, 100000);
        assert.ok(result.includes('100.0%'));
    });

    it('formats over-budget usage', () => {
        const result = formatBudgetTooltip(120000, 100000);
        assert.ok(result.includes('120.0%'));
    });

    it('formats small budget usage', () => {
        const result = formatBudgetTooltip(1000, 100000);
        assert.ok(result.includes('1.0%'));
    });

    it('formats zero budget usage', () => {
        const result = formatBudgetTooltip(0, 100000);
        assert.ok(result.includes('0.0%'));
    });
});
