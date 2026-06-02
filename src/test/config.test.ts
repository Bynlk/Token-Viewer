import './setup';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import {
    isLineShown,
    sectionToSettingKey,
    SECTION_LABELS,
    LINE_TO_SECTION,
    LINE_LABELS,
    ALL_LINE_KEYS,
    ALL_SECTIONS,
    getConfig,
} from '../config';
import type { TooltipSection, TooltipLineKey } from '../config';

describe('SECTION_LABELS', () => {
    it('has labels for all 7 sections', () => {
        assert.equal(Object.keys(SECTION_LABELS).length, 7);
        for (const section of ALL_SECTIONS) {
            assert.ok(SECTION_LABELS[section], `Missing label for section: ${section}`);
            assert.ok(SECTION_LABELS[section].length > 0);
        }
    });
});

describe('LINE_TO_SECTION', () => {
    it('maps every line key to a valid section', () => {
        for (const lineKey of ALL_LINE_KEYS) {
            const section = LINE_TO_SECTION[lineKey];
            assert.ok(ALL_SECTIONS.includes(section), `Line ${lineKey} maps to invalid section: ${section}`);
        }
    });

    it('has mappings for all 12 line keys', () => {
        assert.equal(Object.keys(LINE_TO_SECTION).length, 12);
        assert.equal(ALL_LINE_KEYS.length, 12);
    });

    it('maps accountName to account section', () => {
        assert.equal(LINE_TO_SECTION.accountName, 'account');
    });

    it('maps all todayUsage lines to todayUsage section', () => {
        const todayLines: TooltipLineKey[] = ['todayToken', 'todayCredits', 'todayRequests', 'todayCacheHitRate', 'todayTotal'];
        for (const line of todayLines) {
            assert.equal(LINE_TO_SECTION[line], 'todayUsage', `${line} should map to todayUsage`);
        }
    });
});

describe('LINE_LABELS', () => {
    it('has labels for all line keys', () => {
        for (const key of ALL_LINE_KEYS) {
            assert.ok(LINE_LABELS[key], `Missing label for line key: ${key}`);
            assert.ok(LINE_LABELS[key].length > 0);
        }
    });
});

describe('isLineShown', () => {
    const allSectionsOn: TooltipSection[] = [...ALL_SECTIONS];
    const allLinesOn: Record<TooltipLineKey, boolean> = {} as any;
    for (const key of ALL_LINE_KEYS) { allLinesOn[key] = true; }

    it('returns true when section and line are both enabled', () => {
        assert.ok(isLineShown(allSectionsOn, allLinesOn, 'accountName'));
    });

    it('returns false when section is disabled', () => {
        const sections = allSectionsOn.filter(s => s !== 'account');
        assert.ok(!isLineShown(sections, allLinesOn, 'accountName'));
    });

    it('returns false when line is disabled', () => {
        const lines = { ...allLinesOn, accountName: false };
        assert.ok(!isLineShown(allSectionsOn, lines, 'accountName'));
    });

    it('returns false when both section and line are disabled', () => {
        const sections = allSectionsOn.filter(s => s !== 'prediction');
        const lines = { ...allLinesOn, predictionDays: false };
        assert.ok(!isLineShown(sections, lines, 'predictionDays'));
    });

    it('checks each line key against its section', () => {
        // todayToken belongs to todayUsage
        const noToday: TooltipSection[] = allSectionsOn.filter(s => s !== 'todayUsage');
        assert.ok(!isLineShown(noToday, allLinesOn, 'todayToken'));

        // predictionDays belongs to prediction
        const noPrediction: TooltipSection[] = allSectionsOn.filter(s => s !== 'prediction');
        assert.ok(!isLineShown(noPrediction, allLinesOn, 'predictionDays'));

        // budgetUsed belongs to budget
        const noBudget: TooltipSection[] = allSectionsOn.filter(s => s !== 'budget');
        assert.ok(!isLineShown(noBudget, allLinesOn, 'budgetUsed'));

        // ratesCacheHit belongs to modelRates
        const noRates: TooltipSection[] = allSectionsOn.filter(s => s !== 'modelRates');
        assert.ok(!isLineShown(noRates, allLinesOn, 'ratesCacheHit'));

        // githubLink belongs to github
        const noGithub: TooltipSection[] = allSectionsOn.filter(s => s !== 'github');
        assert.ok(!isLineShown(noGithub, allLinesOn, 'githubLink'));
    });
});

describe('sectionToSettingKey', () => {
    it('converts section names to setting keys', () => {
        assert.equal(sectionToSettingKey('account'), 'showAccount');
        assert.equal(sectionToSettingKey('todayUsage'), 'showTodayUsage');
        assert.equal(sectionToSettingKey('prediction'), 'showPrediction');
        assert.equal(sectionToSettingKey('budget'), 'showBudget');
        assert.equal(sectionToSettingKey('modelRates'), 'showModelRates');
        assert.equal(sectionToSettingKey('cacheHitRate'), 'showCacheHitRate');
        assert.equal(sectionToSettingKey('github'), 'showGithub');
    });

    it('produces keys starting with "show"', () => {
        for (const section of ALL_SECTIONS) {
            assert.ok(sectionToSettingKey(section).startsWith('show'));
        }
    });
});

describe('getConfig', () => {
    it('returns config with all expected fields', () => {
        const config = getConfig();
        assert.ok('headers' in config);
        assert.ok('refreshInterval' in config);
        assert.ok('alertThreshold' in config);
        assert.ok('monthlyBudget' in config);
        assert.ok('budgetAlertLevels' in config);
        assert.ok('teamSharePath' in config);
        assert.ok('username' in config);
        assert.ok('tooltipSections' in config);
        assert.ok('tooltipLines' in config);
    });

    it('returns default refreshInterval of 10', () => {
        const config = getConfig();
        assert.equal(config.refreshInterval, 10);
    });

    it('returns default alertThreshold of 100000000', () => {
        const config = getConfig();
        assert.equal(config.alertThreshold, 100000000);
    });

    it('returns default budgetAlertLevels of [50, 80, 100]', () => {
        const config = getConfig();
        assert.deepEqual(config.budgetAlertLevels, [50, 80, 100]);
    });

    it('returns all sections enabled by default', () => {
        const config = getConfig();
        assert.equal(config.tooltipSections.length, ALL_SECTIONS.length);
    });

    it('returns all lines enabled by default', () => {
        const config = getConfig();
        for (const key of ALL_LINE_KEYS) {
            assert.ok(config.tooltipLines[key], `Line ${key} should be enabled by default`);
        }
    });
});
