import './setup';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
    formatCompact,
    resolveJsonPath,
    isAuthError,
    calcCredits,
    buildUsageUrl,
    getShanghaiTime,
    getUtcTime,
    bypassSystemProxy,
} from '../utils';

// ============================================================
// Extended utils tests - edge cases and additional coverage
// ============================================================

describe('getShanghaiTime', () => {
    it('returns object with year, month, dateStr, now', () => {
        const result = getShanghaiTime();
        assert.ok(typeof result.year === 'number');
        assert.ok(typeof result.month === 'number');
        assert.ok(typeof result.dateStr === 'string');
        assert.ok(result.now instanceof Date);
    });

    it('year is reasonable (2024-2030)', () => {
        const result = getShanghaiTime();
        assert.ok(result.year >= 2024 && result.year <= 2030);
    });

    it('month is 1-12', () => {
        const result = getShanghaiTime();
        assert.ok(result.month >= 1 && result.month <= 12);
    });

    it('dateStr matches YYYY-MM-DD format', () => {
        const result = getShanghaiTime();
        assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(result.dateStr));
    });
});

describe('getUtcTime', () => {
    it('returns object with year, month, dateStr, now', () => {
        const result = getUtcTime();
        assert.ok(typeof result.year === 'number');
        assert.ok(typeof result.month === 'number');
        assert.ok(typeof result.dateStr === 'string');
        assert.ok(result.now instanceof Date);
    });

    it('dateStr matches YYYY-MM-DD format', () => {
        const result = getUtcTime();
        assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(result.dateStr));
    });
});

describe('bypassSystemProxy', () => {
    it('executes function and returns result', () => {
        const result = bypassSystemProxy(() => 42);
        assert.equal(result, 42);
    });

    it('restores env vars after execution', () => {
        const original = process.env.HTTP_PROXY;
        bypassSystemProxy(() => {});
        // Env should be restored (or still undefined)
        assert.equal(process.env.HTTP_PROXY, original);
    });

    it('clears proxy env vars during execution', () => {
        // Use a key that bypassSystemProxy actually clears
        process.env['HTTPS_PROXY'] = 'http://test-proxy:9999';
        let proxyWasCleared = false;
        bypassSystemProxy(() => {
            proxyWasCleared = !process.env['HTTPS_PROXY'];
        });
        assert.ok(proxyWasCleared, 'HTTPS_PROXY should be cleared during execution');
        // Cleanup
        delete process.env['HTTPS_PROXY'];
    });

    it('returns string result', () => {
        const result = bypassSystemProxy(() => 'hello');
        assert.equal(result, 'hello');
    });

    it('propagates exceptions', () => {
        assert.throws(() => {
            bypassSystemProxy(() => { throw new Error('test error'); });
        }, /test error/);
    });
});

describe('formatCompact - extended edge cases', () => {
    it('handles exactly 10000 (10K)', () => {
        assert.equal(formatCompact(10000), '10K');
    });

    it('handles exactly 1000000 (1M)', () => {
        assert.equal(formatCompact(1000000), '1M');
    });

    it('handles exactly 1000000000 (1B)', () => {
        assert.equal(formatCompact(1000000000), '1B');
    });

    it('handles exactly 1000000000000 (1T)', () => {
        assert.equal(formatCompact(1000000000000), '1T');
    });

    it('handles 9999 (below K threshold)', () => {
        const result = formatCompact(9999);
        assert.ok(!result.includes('K'));
    });

    it('handles 1', () => {
        assert.equal(formatCompact(1), '1');
    });

    it('handles -0', () => {
        const result = formatCompact(-0);
        assert.ok(typeof result === 'string');
    });
});

describe('resolveJsonPath - extended edge cases', () => {
    it('handles deeply nested paths', () => {
        const obj = { a: { b: { c: { d: { e: 42 } } } } };
        assert.equal(resolveJsonPath(obj, 'a.b.c.d.e'), 42);
    });

    it('handles null values in path', () => {
        const obj = { a: null };
        assert.equal(resolveJsonPath(obj, 'a.b'), undefined);
    });

    it('handles undefined values in path', () => {
        const obj = { a: undefined };
        assert.equal(resolveJsonPath(obj, 'a.b'), undefined);
    });

    it('handles array with complex object', () => {
        const obj = { data: { items: [{ name: 'a', value: 10 }, { name: 'b', value: 20 }] } };
        assert.equal(resolveJsonPath(obj, 'data.items[1].value'), 20);
    });

    it('handles subtraction with 3 operands', () => {
        const obj = { a: 100, b: 20, c: 10 };
        assert.equal(resolveJsonPath(obj, 'a - b - c'), 70);
    });

    it('handles whitespace in path', () => {
        const obj = { a: { b: 42 } };
        assert.equal(resolveJsonPath(obj, '  a.b  '), 42);
    });
});

describe('isAuthError - extended keywords', () => {
    it('detects "session expired"', () => {
        assert.ok(isAuthError('session expired'));
    });

    it('detects "cookie expired"', () => {
        assert.ok(isAuthError('cookie expired'));
    });

    it('detects "not authenticated"', () => {
        assert.ok(isAuthError('not authenticated'));
    });

    it('detects "login required"', () => {
        assert.ok(isAuthError('login required'));
    });

    it('is case insensitive', () => {
        assert.ok(isAuthError('UNAUTHORIZED'));
        assert.ok(isAuthError('Token Expired'));
    });

    it('returns false for generic errors', () => {
        assert.ok(!isAuthError('Something went wrong'));
        assert.ok(!isAuthError('File not found'));
    });
});

describe('calcCredits - extended', () => {
    it('handles zero input for all params', () => {
        assert.equal(calcCredits('mimo-v2.5-pro', 0, 0, 0), 0);
    });

    it('uses _default rates for unknown model', () => {
        // _default: cacheHit=1, input=100, output=200
        const result = calcCredits('new-model', 10, 20, 30);
        assert.equal(result, 10 * 1 + 20 * 100 + 30 * 200);
    });

    it('calculates mimo-v2.5-pro correctly', () => {
        // cacheHit=2.5, input=300, output=600
        const result = calcCredits('mimo-v2.5-pro', 1000, 2000, 500);
        assert.equal(result, 1000 * 2.5 + 2000 * 300 + 500 * 600);
    });

    it('calculates mimo-v2.5 correctly', () => {
        // cacheHit=2, input=100, output=200
        const result = calcCredits('mimo-v2.5', 500, 1000, 200);
        assert.equal(result, 500 * 2 + 1000 * 100 + 200 * 200);
    });
});

describe('buildUsageUrl - extended', () => {
    it('preserves base URL path', () => {
        const url = buildUsageUrl('');
        assert.ok(url.includes('/api/v1/usage/token-plan/list'));
    });

    it('handles cookie with multiple values', () => {
        const cookie = 'a=1; api-platform_ph=hello_world; b=2; c=3';
        const url = buildUsageUrl(cookie);
        assert.ok(url.includes('api-platform_ph=hello_world'));
    });

    it('handles special characters in api-platform_ph', () => {
        const cookie = 'api-platform_ph=a%20b%3Dc';
        const url = buildUsageUrl(cookie);
        assert.ok(url.includes('api-platform_ph='));
    });
});
