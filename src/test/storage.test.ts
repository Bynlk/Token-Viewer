import './setup';
import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
    initStorage,
    saveDailySnapshot,
    loadDailySnapshot,
    loadHistory,
    loadMonthlyUsage,
    loadRequestLogs,
    cleanupOldRequestLogs,
    loadAccounts,
    saveAccounts,
    addAccount,
    removeAccount,
    getAccount,
    saveTeamSnapshot,
    loadTeamSnapshots,
} from '../storage';
import { createMockContext } from './vscode-mock';
import type { DailySnapshot, ModelUsage } from '../types';

describe('Account Management', () => {
    let tmpDir: string;

    before(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-viewer-acct-'));
        const ctx = createMockContext();
        (ctx.globalStorageUri as any).fsPath = tmpDir;
        initStorage(ctx as any);
    });

    after(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('loadAccounts returns empty array initially', () => {
        const accounts = loadAccounts();
        assert.deepEqual(accounts, []);
    });

    it('addAccount creates and returns a new account', () => {
        const account = addAccount('Test Account', 'session=abc123');
        assert.equal(account.name, 'Test Account');
        assert.equal(account.cookie, 'session=abc123');
        assert.ok(account.id.length > 0);
        assert.ok(account.createdAt > 0);
    });

    it('loadAccounts returns saved accounts', () => {
        const accounts = loadAccounts();
        assert.ok(accounts.length >= 1);
        assert.equal(accounts[accounts.length - 1].name, 'Test Account');
    });

    it('getAccount returns account by id', () => {
        const account = addAccount('Findable', 'cookie=find');
        const found = getAccount(account.id);
        assert.ok(found);
        assert.equal(found!.name, 'Findable');
    });

    it('getAccount returns undefined for unknown id', () => {
        const found = getAccount('nonexistent-id');
        assert.equal(found, undefined);
    });

    it('removeAccount removes and returns true', () => {
        const account = addAccount('Removable', 'cookie=rm');
        assert.ok(removeAccount(account.id));
        assert.equal(getAccount(account.id), undefined);
    });

    it('removeAccount returns false for unknown id', () => {
        assert.ok(!removeAccount('nonexistent-id'));
    });

    it('saveAccounts overwrites existing accounts', () => {
        const accounts = [{ id: 'x', name: 'X', cookie: 'c', createdAt: Date.now() }];
        saveAccounts(accounts);
        const loaded = loadAccounts();
        assert.equal(loaded.length, 1);
        assert.equal(loaded[0].name, 'X');
    });
});

describe('Daily Snapshot Operations', () => {
    let tmpDir: string;

    before(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-viewer-snap-'));
        const ctx = createMockContext();
        (ctx.globalStorageUri as any).fsPath = tmpDir;
        initStorage(ctx as any);
    });

    after(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('saveDailySnapshot creates a file', () => {
        const snapshot: DailySnapshot = {
            date: '2026-06-01',
            credits: 100000,
            totalCredits: 200000,
            models: {
                'mimo-v2.5-pro': { totalToken: 5000, inputHit: 1000, inputMiss: 2000, output: 2000, credits: 500, requests: 5 },
            },
        };
        saveDailySnapshot(snapshot);

        const filePath = path.join(tmpDir, 'data', 'daily', '2026-06-01.json');
        assert.ok(fs.existsSync(filePath));
    });

    it('loadDailySnapshot returns saved snapshot', () => {
        const loaded = loadDailySnapshot('2026-06-01');
        assert.ok(loaded);
        assert.equal(loaded!.date, '2026-06-01');
        assert.equal(loaded!.credits, 100000);
        assert.ok('mimo-v2.5-pro' in loaded!.models);
    });

    it('loadDailySnapshot returns null for non-existent date', () => {
        assert.equal(loadDailySnapshot('1999-01-01'), null);
    });

    it('loadHistory returns snapshots sorted by date', () => {
        // Save multiple days
        saveDailySnapshot({ date: '2026-05-28', credits: 103000, totalCredits: 200000, models: {} });
        saveDailySnapshot({ date: '2026-05-29', credits: 102000, totalCredits: 200000, models: {} });
        saveDailySnapshot({ date: '2026-05-30', credits: 101000, totalCredits: 200000, models: {} });

        const history = loadHistory(10);
        assert.ok(history.length >= 3);
        // Should be sorted ascending by date
        for (let i = 1; i < history.length; i++) {
            assert.ok(history[i].date >= history[i - 1].date);
        }
    });

    it('loadHistory limits results to N days', () => {
        const history = loadHistory(2);
        assert.ok(history.length <= 2);
    });

    it('loadMonthlyUsage aggregates model data', () => {
        const usage = loadMonthlyUsage();
        assert.ok(typeof usage === 'object');
        // Should have mimo-v2.5-pro if the snapshot was saved this month
        if (usage['mimo-v2.5-pro']) {
            assert.ok(usage['mimo-v2.5-pro'].totalToken > 0);
        }
    });
});

describe('Request Log Operations', () => {
    let tmpDir: string;

    before(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-viewer-logs-'));
        const ctx = createMockContext();
        (ctx.globalStorageUri as any).fsPath = tmpDir;
        initStorage(ctx as any);
    });

    after(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('loadRequestLogs returns empty array for non-existent date', () => {
        const logs = loadRequestLogs('1999-01-01');
        assert.deepEqual(logs, []);
    });
});

describe('Team Snapshot Operations', () => {
    let tmpDir: string;

    before(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-viewer-team-'));
    });

    after(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('saveTeamSnapshot creates user directory and file', () => {
        const snapshot: DailySnapshot = {
            date: '2026-06-01',
            credits: 50000,
            totalCredits: 200000,
            models: {},
        };

        saveTeamSnapshot('testuser', tmpDir, snapshot);

        const filePath = path.join(tmpDir, 'testuser', '2026-06-01.json');
        assert.ok(fs.existsSync(filePath));

        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        assert.equal(content.date, '2026-06-01');
        assert.equal(content.credits, 50000);
    });

    it('loadTeamSnapshots reads saved snapshots', () => {
        const result = loadTeamSnapshots(tmpDir);
        assert.ok(typeof result === 'object');
    });

    it('loadTeamSnapshots handles non-existent path', () => {
        const result = loadTeamSnapshots('/nonexistent/path');
        assert.deepEqual(result, {});
    });

    it('loadTeamSnapshots handles empty string', () => {
        const result = loadTeamSnapshots('');
        assert.deepEqual(result, {});
    });

    it('saveTeamSnapshot ignores empty username', () => {
        const before = fs.readdirSync(tmpDir).length;
        saveTeamSnapshot('', tmpDir, { date: '2026-06-01', credits: 0, totalCredits: 0, models: {} });
        const afterCount = fs.readdirSync(tmpDir).length;
        assert.equal(afterCount, before);
    });

    it('saveTeamSnapshot ignores empty sharePath', () => {
        saveTeamSnapshot('user', '', { date: '2026-06-01', credits: 0, totalCredits: 0, models: {} });
    });
});
