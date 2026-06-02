import './setup';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { calculateDashboardPrediction } from '../prediction';
import { DailySnapshot } from '../types';

/** 创建测试用的 DailySnapshot */
function makeSnapshot(date: string, credits: number): DailySnapshot {
    return { date, credits, totalCredits: 200000, models: {} };
}

describe('calculateDashboardPrediction', () => {
    it('returns null for empty snapshots', () => {
        assert.equal(calculateDashboardPrediction([]), null);
    });

    it('returns null for single snapshot', () => {
        const snapshots = [makeSnapshot('2026-06-01', 100000)];
        assert.equal(calculateDashboardPrediction(snapshots), null);
    });

    it('calculates days remaining from consumption trend', () => {
        const snapshots = [
            makeSnapshot('2026-05-25', 110000),
            makeSnapshot('2026-05-26', 109000),
            makeSnapshot('2026-05-27', 108000),
            makeSnapshot('2026-05-28', 107000),
            makeSnapshot('2026-05-29', 106000),
            makeSnapshot('2026-05-30', 105000),
            makeSnapshot('2026-05-31', 104000),
        ];
        const result = calculateDashboardPrediction(snapshots);
        assert.ok(result !== null);
        // Daily consumption = 1000, remaining = 104000/1000 = 104 days
        assert.ok(result!.includes('104天'));
    });

    it('returns > 1 year for very long predictions', () => {
        const snapshots = [
            makeSnapshot('2026-05-25', 100100),
            makeSnapshot('2026-05-26', 100000),
        ];
        const result = calculateDashboardPrediction(snapshots);
        // Daily consumption = 100, remaining = 100000/100 = 1000 days > 365
        assert.ok(result !== null);
        assert.ok(result!.includes('> 1年'));
    });

    it('returns null when consumption is zero', () => {
        const snapshots = [
            makeSnapshot('2026-05-25', 100000),
            makeSnapshot('2026-05-26', 100000),
            makeSnapshot('2026-05-27', 100000),
        ];
        assert.equal(calculateDashboardPrediction(snapshots), null);
    });

    it('returns null when credits are increasing', () => {
        const snapshots = [
            makeSnapshot('2026-05-25', 100000),
            makeSnapshot('2026-05-26', 101000),
            makeSnapshot('2026-05-27', 102000),
        ];
        assert.equal(calculateDashboardPrediction(snapshots), null);
    });

    it('returns null when last credits are zero', () => {
        const snapshots = [
            makeSnapshot('2026-05-25', 1000),
            makeSnapshot('2026-05-26', 0),
        ];
        assert.equal(calculateDashboardPrediction(snapshots), null);
    });

    it('includes hours in prediction', () => {
        // 1.5 days of consumption per day, 100 credits remaining = 66.67 days
        const snapshots = [
            makeSnapshot('2026-05-25', 103000),
            makeSnapshot('2026-05-26', 100000),
        ];
        const result = calculateDashboardPrediction(snapshots);
        assert.ok(result !== null);
        // dailyConsumption = 3000, remaining = 100000/3000 = 33.33 days
        assert.ok(result!.includes('天'));
        assert.ok(result!.includes('小时'));
    });
});
