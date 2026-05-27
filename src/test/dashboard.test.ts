import './setup';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { calculateSavings } from '../dashboard';
import { ModelUsage } from '../types';

describe('calculateSavings', () => {
    it('calculates savings when using expensive model', () => {
        const models: Record<string, ModelUsage> = {
            'mimo-v2.5-pro': {
                totalToken: 1000,
                inputHit: 100,
                inputMiss: 200,
                output: 300,
                credits: 0,
                requests: 10,
            },
        };
        const result = calculateSavings(models);
        assert.ok(result.currentCost > 0);
        assert.ok(result.cheapestCost >= 0);
        assert.ok(result.savings >= 0);
        assert.ok(result.savingsPercent >= 0);
        assert.ok(result.breakdown['mimo-v2.5-pro']);
    });

    it('returns zero savings when using cheapest model', () => {
        const models: Record<string, ModelUsage> = {
            'mimo-v2.5': {
                totalToken: 1000,
                inputHit: 100,
                inputMiss: 200,
                output: 300,
                credits: 0,
                requests: 10,
            },
        };
        const result = calculateSavings(models);
        // mimo-v2.5 has the cheapest rates, so savings should be 0
        assert.equal(result.savings, 0);
        assert.equal(result.savingsPercent, 0);
    });

    it('handles empty models', () => {
        const result = calculateSavings({});
        assert.equal(result.currentCost, 0);
        assert.equal(result.cheapestCost, 0);
        assert.equal(result.savings, 0);
    });

    it('calculates breakdown per model', () => {
        const models: Record<string, ModelUsage> = {
            'mimo-v2.5-pro': {
                totalToken: 500,
                inputHit: 50,
                inputMiss: 100,
                output: 150,
                credits: 0,
                requests: 5,
            },
            'mimo-v2.5': {
                totalToken: 300,
                inputHit: 30,
                inputMiss: 60,
                output: 90,
                credits: 0,
                requests: 3,
            },
        };
        const result = calculateSavings(models);
        assert.ok(result.breakdown['mimo-v2.5-pro']);
        assert.ok(result.breakdown['mimo-v2.5']);
        assert.ok(result.breakdown['mimo-v2.5-pro'].current > 0);
        assert.ok(result.breakdown['mimo-v2.5'].current > 0);
    });
});
