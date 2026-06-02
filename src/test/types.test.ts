import './setup';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { MODEL_RATES, XIAOMI_CONFIG } from '../types';

describe('MODEL_RATES', () => {
    it('defines mimo-v2.5-pro rates', () => {
        const rates = MODEL_RATES['mimo-v2.5-pro'];
        assert.ok(rates);
        assert.equal(rates.cacheHit, 2.5);
        assert.equal(rates.input, 300);
        assert.equal(rates.output, 600);
    });

    it('defines mimo-v2.5 rates', () => {
        const rates = MODEL_RATES['mimo-v2.5'];
        assert.ok(rates);
        assert.equal(rates.cacheHit, 2);
        assert.equal(rates.input, 100);
        assert.equal(rates.output, 200);
    });

    it('defines _default fallback rates', () => {
        const rates = MODEL_RATES['_default'];
        assert.ok(rates);
        assert.equal(rates.cacheHit, 1);
        assert.equal(rates.input, 100);
        assert.equal(rates.output, 200);
    });

    it('has cacheHit < input for all models (cache is cheaper)', () => {
        for (const [model, rates] of Object.entries(MODEL_RATES)) {
            assert.ok(
                rates.cacheHit < rates.input,
                `${model}: cacheHit (${rates.cacheHit}) should be < input (${rates.input})`
            );
        }
    });

    it('has output > input for all models (output is more expensive)', () => {
        for (const [model, rates] of Object.entries(MODEL_RATES)) {
            assert.ok(
                rates.output > rates.input,
                `${model}: output (${rates.output}) should be > input (${rates.input})`
            );
        }
    });

    it('all rates are positive numbers', () => {
        for (const [model, rates] of Object.entries(MODEL_RATES)) {
            assert.ok(rates.cacheHit > 0, `${model}: cacheHit should be positive`);
            assert.ok(rates.input > 0, `${model}: input should be positive`);
            assert.ok(rates.output > 0, `${model}: output should be positive`);
        }
    });

    it('has exactly 3 entries (2 models + _default)', () => {
        assert.equal(Object.keys(MODEL_RATES).length, 3);
    });
});

describe('XIAOMI_CONFIG', () => {
    it('has apiUrl', () => {
        assert.ok(XIAOMI_CONFIG.apiUrl.includes('xiaomimimo.com'));
        assert.ok(XIAOMI_CONFIG.apiUrl.includes('tokenPlan'));
    });

    it('has usageApiUrl', () => {
        assert.ok(XIAOMI_CONFIG.usageApiUrl.includes('xiaomimimo.com'));
        assert.ok(XIAOMI_CONFIG.usageApiUrl.includes('usage'));
    });

    it('has jsonPath with subtraction expression', () => {
        assert.ok(XIAOMI_CONFIG.jsonPath.includes(' - '));
        assert.ok(XIAOMI_CONFIG.jsonPath.includes('limit'));
        assert.ok(XIAOMI_CONFIG.jsonPath.includes('used'));
    });

    it('has totalPath and usedPath', () => {
        assert.ok(XIAOMI_CONFIG.totalPath.includes('limit'));
        assert.ok(XIAOMI_CONFIG.usedPath.includes('used'));
    });

    it('has loginUrl', () => {
        assert.ok(XIAOMI_CONFIG.loginUrl.includes('xiaomimimo.com'));
    });

    it('has headerKey as Cookie', () => {
        assert.equal(XIAOMI_CONFIG.headerKey, 'Cookie');
    });
});
