import './setup';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { formatCompact, resolveJsonPath, isAuthError, calcCredits, buildUsageUrl } from '../utils';

describe('formatCompact', () => {
    it('formats trillions', () => {
        assert.equal(formatCompact(1.5e12), '1.5T');
        assert.equal(formatCompact(2e12), '2T');
    });

    it('formats billions', () => {
        assert.equal(formatCompact(1.5e9), '1.5B');
        assert.equal(formatCompact(3e9), '3B');
    });

    it('formats millions', () => {
        assert.equal(formatCompact(1.2e6), '1.2M');
        assert.equal(formatCompact(5e6), '5M');
    });

    it('formats thousands', () => {
        assert.equal(formatCompact(1.5e4), '15K');
        assert.equal(formatCompact(2e4), '20K');
    });

    it('formats small numbers with locale', () => {
        const result = formatCompact(9999);
        assert.ok(result.includes('9') && result.includes('999'));
    });

    it('handles zero', () => {
        assert.equal(formatCompact(0), '0');
    });

    it('handles negative numbers', () => {
        assert.equal(formatCompact(-1.5e9), '-1.5B');
    });
});

describe('resolveJsonPath', () => {
    it('resolves simple path', () => {
        const obj = { a: { b: 42 } };
        assert.equal(resolveJsonPath(obj, 'a.b'), 42);
    });

    it('resolves array index', () => {
        const obj = { items: [10, 20, 30] };
        assert.equal(resolveJsonPath(obj, 'items[1]'), 20);
    });

    it('resolves subtraction expression', () => {
        const obj = { data: { limit: 100, used: 30 } };
        assert.equal(resolveJsonPath(obj, 'data.limit - data.used'), 70);
    });

    it('returns undefined for missing path', () => {
        const obj = { a: 1 };
        assert.equal(resolveJsonPath(obj, 'b.c'), undefined);
    });

    it('returns obj for empty path', () => {
        const obj = { a: 1 };
        assert.deepEqual(resolveJsonPath(obj, ''), obj);
    });

    it('returns undefined for non-numeric subtraction', () => {
        const obj = { a: 'hello', b: 'world' };
        assert.equal(resolveJsonPath(obj, 'a - b'), undefined);
    });
});

describe('isAuthError', () => {
    it('detects HTTP 401', () => {
        assert.ok(isAuthError('HTTP 401 Unauthorized'));
    });

    it('detects HTTP 403', () => {
        assert.ok(isAuthError('HTTP 403 Forbidden'));
    });

    it('detects Chinese auth keywords', () => {
        assert.ok(isAuthError('登录已过期'));
        assert.ok(isAuthError('请重新登录'));
        assert.ok(isAuthError('认证失败'));
    });

    it('detects English auth keywords', () => {
        assert.ok(isAuthError('token expired'));
        assert.ok(isAuthError('access denied'));
    });

    it('returns false for non-auth errors', () => {
        assert.ok(!isAuthError('Network timeout'));
        assert.ok(!isAuthError('JSON parse error'));
    });
});

describe('calcCredits', () => {
    it('calculates credits for mimo-v2.5-pro', () => {
        // cacheHit=2.5, input=300, output=600
        const result = calcCredits('mimo-v2.5-pro', 100, 200, 300);
        assert.equal(result, 100 * 2.5 + 200 * 300 + 300 * 600);
    });

    it('calculates credits for mimo-v2.5', () => {
        // cacheHit=2, input=100, output=200
        const result = calcCredits('mimo-v2.5', 100, 200, 300);
        assert.equal(result, 100 * 2 + 200 * 100 + 300 * 200);
    });

    it('uses fallback rates for unknown model', () => {
        // _default: cacheHit=1, input=100, output=200
        const result = calcCredits('unknown-model', 100, 200, 300);
        assert.equal(result, 100 * 1 + 200 * 100 + 300 * 200);
    });

    it('handles zero values', () => {
        assert.equal(calcCredits('mimo-v2.5-pro', 0, 0, 0), 0);
    });
});

describe('buildUsageUrl', () => {
    it('builds URL with api-platform_ph from cookie', () => {
        const cookie = 'session=abc; api-platform_ph=xyz123; other=value';
        const url = buildUsageUrl(cookie);
        assert.ok(url.includes('api-platform_ph=xyz123'));
    });

    it('builds base URL without api-platform_ph', () => {
        const cookie = 'session=abc; other=value';
        const url = buildUsageUrl(cookie);
        assert.equal(url, 'https://platform.xiaomimimo.com/api/v1/usage/token-plan/list');
    });

    it('handles empty cookie', () => {
        const url = buildUsageUrl('');
        assert.equal(url, 'https://platform.xiaomimimo.com/api/v1/usage/token-plan/list');
    });

    it('handles quoted api-platform_ph value', () => {
        const cookie = 'api-platform_ph="quoted_value"';
        const url = buildUsageUrl(cookie);
        assert.ok(url.includes('api-platform_ph=quoted_value'));
    });
});

describe('today usage percentage formula', () => {
    it('calculates todayCredits / totalCredits * 100', () => {
        const allCredits = 5000;
        const totalCredits = 100000;
        const usedPercent = (allCredits / totalCredits) * 100;
        assert.equal(usedPercent, 5.0);
    });
});
