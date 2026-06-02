import './setup';
import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildDashboardHtml } from '../dashboard-html';

describe('buildDashboardHtml', () => {
    it('returns valid HTML document', () => {
        const html = buildDashboardHtml('test-nonce', false, null);
        assert.ok(html.startsWith('<!DOCTYPE html>'));
        assert.ok(html.includes('<html'));
        assert.ok(html.includes('</html>'));
    });

    it('includes CSP header with nonce', () => {
        const nonce = 'abc123';
        const html = buildDashboardHtml(nonce, false, null);
        assert.ok(html.includes(`script-src 'nonce-${nonce}'`));
        assert.ok(html.includes(`nonce="${nonce}"`));
    });

    it('includes dashboard title', () => {
        const html = buildDashboardHtml('test', false, null);
        assert.ok(html.includes('Token Viewer Dashboard'));
    });

    it('includes time range buttons', () => {
        const html = buildDashboardHtml('test', false, null);
        assert.ok(html.includes('7天'));
        assert.ok(html.includes('30天'));
        assert.ok(html.includes('全部'));
        assert.ok(html.includes('刷新'));
    });

    it('includes chart container divs', () => {
        const html = buildDashboardHtml('test', false, null);
        assert.ok(html.includes('id="stats"'));
        assert.ok(html.includes('id="charts"'));
        assert.ok(html.includes('id="savings-section"'));
        assert.ok(html.includes('id="today-section"'));
        assert.ok(html.includes('id="team-section"'));
    });

    it('includes Chart.js script when uri provided', () => {
        const chartJsUri = 'https://example.com/chart.min.js';
        const html = buildDashboardHtml('test', true, chartJsUri);
        assert.ok(html.includes(chartJsUri));
        assert.ok(html.includes('src="https://example.com/chart.min.js"'));
    });

    it('omits Chart.js script when uri is null', () => {
        const html = buildDashboardHtml('test', true, null);
        assert.ok(!html.includes('chart.min.js'));
    });

    it('sets hasChartJs to true in JS when flag is true', () => {
        const html = buildDashboardHtml('test', true, 'https://example.com/chart.js');
        assert.ok(html.includes('const hasChartJs = true'));
    });

    it('sets hasChartJs to false in JS when flag is false', () => {
        const html = buildDashboardHtml('test', false, null);
        assert.ok(html.includes('const hasChartJs = false'));
    });

    it('includes CSS styles', () => {
        const html = buildDashboardHtml('test', false, null);
        assert.ok(html.includes('<style>'));
        assert.ok(html.includes('</style>'));
        assert.ok(html.includes('font-family'));
    });

    it('includes JavaScript functions', () => {
        const html = buildDashboardHtml('test', false, null);
        assert.ok(html.includes('function loadData'));
        assert.ok(html.includes('function refresh'));
        assert.ok(html.includes('function formatCompact'));
        assert.ok(html.includes('function renderStats'));
        assert.ok(html.includes('function renderCharts'));
        assert.ok(html.includes('function renderSavings'));
        assert.ok(html.includes('function renderToday'));
        assert.ok(html.includes('function renderTeam'));
    });

    it('includes VS Code API acquisition', () => {
        const html = buildDashboardHtml('test', false, null);
        assert.ok(html.includes('acquireVsCodeApi'));
    });

    it('includes message event listener', () => {
        const html = buildDashboardHtml('test', false, null);
        assert.ok(html.includes("window.addEventListener('message'"));
    });

    it('initial load calls loadData(7)', () => {
        const html = buildDashboardHtml('test', false, null);
        assert.ok(html.includes('loadData(7)'));
    });

    it('uses different nonces correctly', () => {
        const html1 = buildDashboardHtml('nonce-aaa', false, null);
        const html2 = buildDashboardHtml('nonce-bbb', false, null);
        assert.ok(html1.includes('nonce-aaa'));
        assert.ok(!html1.includes('nonce-bbb'));
        assert.ok(html2.includes('nonce-bbb'));
        assert.ok(!html2.includes('nonce-aaa'));
    });
});
