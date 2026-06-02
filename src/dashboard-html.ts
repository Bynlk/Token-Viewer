// ============================================================
// Token Viewer - Dashboard HTML 模板
// ============================================================

/** Dashboard 页面 CSS */
const DASHBOARD_CSS = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    padding: 20px;
}
.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 15px;
    border-bottom: 1px solid var(--vscode-panel-border);
}
.header h1 { font-size: 1.4em; font-weight: 600; }
.controls { display: flex; gap: 8px; }
.controls button {
    padding: 6px 14px;
    border: 1px solid var(--vscode-button-border);
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
}
.controls button.active, .controls button:hover {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
}
.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
    margin-bottom: 25px;
}
.stat-card {
    background: var(--vscode-sideBar-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    padding: 16px;
}
.stat-card .label { font-size: 12px; opacity: 0.7; margin-bottom: 6px; }
.stat-card .value { font-size: 1.6em; font-weight: 700; }
.stat-card .sub { font-size: 12px; opacity: 0.6; margin-top: 4px; }
.chart-container {
    background: var(--vscode-sideBar-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 20px;
}
.chart-container h3 { font-size: 14px; margin-bottom: 12px; font-weight: 600; }
canvas { max-height: 300px; }
table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}
th, td {
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid var(--vscode-panel-border);
}
th { font-weight: 600; opacity: 0.8; }
.savings-card {
    background: var(--vscode-sideBar-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 20px;
}
.savings-card h3 { font-size: 14px; margin-bottom: 12px; }
.savings-highlight {
    font-size: 1.3em;
    font-weight: 700;
    color: var(--vscode-terminal-ansiGreen);
}
.team-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px;
}
.team-card {
    background: var(--vscode-sideBar-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    padding: 12px;
}
.team-card .name { font-weight: 600; margin-bottom: 6px; }
.team-card .credits { font-size: 1.1em; }
`;

/** Dashboard 页面 JavaScript */
const DASHBOARD_JS = `
const vscode = acquireVsCodeApi();
let charts = {};
const hasChartJs = __HAS_CHARTJS__;

function loadData(days) {
    document.querySelectorAll('.controls button').forEach(b => b.classList.remove('active'));
    if (days === 7) document.getElementById('btn7').classList.add('active');
    else if (days === 30) document.getElementById('btn30').classList.add('active');
    else document.getElementById('btnAll').classList.add('active');
    vscode.postMessage({ type: 'requestData', days: days || 999 });
}

function refresh() {
    vscode.postMessage({ type: 'refresh' });
}

function formatCompact(num) {
    const abs = Math.abs(num);
    if (abs >= 1e12) return (num / 1e12).toFixed(1).replace(/\\.0$/, '') + 'T';
    if (abs >= 1e9) return (num / 1e9).toFixed(1).replace(/\\.0$/, '') + 'B';
    if (abs >= 1e6) return (num / 1e6).toFixed(1).replace(/\\.0$/, '') + 'M';
    if (abs >= 1e4) return (num / 1e3).toFixed(1).replace(/\\.0$/, '') + 'K';
    return num.toLocaleString('zh-CN');
}

function renderStats(data) {
    const latest = data.snapshots[data.snapshots.length - 1];
    if (!latest) { document.getElementById('stats').innerHTML = '<p>暂无数据</p>'; return; }

    let html = '';
    html += '<div class="stat-card"><div class="label">当前剩余</div><div class="value">' + formatCompact(latest.credits) + '</div><div class="sub">' + latest.credits.toLocaleString('zh-CN') + '</div></div>';
    if (latest.totalCredits > 0) {
        const pct = ((latest.credits / latest.totalCredits) * 100).toFixed(1);
        html += '<div class="stat-card"><div class="label">剩余比例</div><div class="value">' + pct + '%</div><div class="sub">总量 ' + formatCompact(latest.totalCredits) + '</div></div>';
    }
    if (data.prediction) {
        html += '<div class="stat-card"><div class="label">预计还能用</div><div class="value">' + data.prediction + '</div></div>';
    }
    if (data.snapshots.length >= 2) {
        const consumption = data.snapshots[0].credits - latest.credits;
        const dailyAvg = consumption / (data.snapshots.length - 1);
        html += '<div class="stat-card"><div class="label">日均消耗</div><div class="value">' + formatCompact(dailyAvg) + '</div></div>';
    }
    document.getElementById('stats').innerHTML = html;
}

function renderCharts(data) {
    Object.values(charts).forEach(c => c.destroy());
    charts = {};
    const container = document.getElementById('charts');
    container.innerHTML = '';

    if (!hasChartJs) {
        container.innerHTML = '<div class="chart-container"><h3>图表不可用</h3><p>Chart.js 未能加载，请检查网络连接后重试。</p></div>';
        return;
    }

    if (data.snapshots.length === 0) return;

    container.innerHTML += '<div class="chart-container"><h3>Credits 余额趋势</h3><canvas id="creditsChart"></canvas></div>';
    const creditsCtx = document.getElementById('creditsChart').getContext('2d');
    charts.credits = new Chart(creditsCtx, {
        type: 'line',
        data: {
            labels: data.snapshots.map(s => s.date),
            datasets: [{
                label: 'Credits',
                data: data.snapshots.map(s => s.credits),
                borderColor: '#4fc3f7',
                backgroundColor: 'rgba(79,195,247,0.1)',
                fill: true,
                tension: 0.3,
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { ticks: { callback: v => formatCompact(v) } } }
        }
    });

    if (data.snapshots.length >= 2) {
        const consumption = [];
        for (let i = 1; i < data.snapshots.length; i++) {
            consumption.push({
                date: data.snapshots[i].date,
                value: data.snapshots[i-1].credits - data.snapshots[i].credits
            });
        }
        container.innerHTML += '<div class="chart-container"><h3>每日 Credits 消耗</h3><canvas id="consumptionChart"></canvas></div>';
        const consCtx = document.getElementById('consumptionChart').getContext('2d');
        charts.consumption = new Chart(consCtx, {
            type: 'bar',
            data: {
                labels: consumption.map(c => c.date),
                datasets: [{
                    label: '消耗',
                    data: consumption.map(c => c.value),
                    backgroundColor: 'rgba(255,138,128,0.7)',
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { ticks: { callback: v => formatCompact(v) } } }
            }
        });
    }

    if (data.today && Object.keys(data.today.models).length > 0) {
        container.innerHTML += '<div class="chart-container"><h3>今日按模型 Token 用量</h3><canvas id="modelChart"></canvas></div>';
        const modelCtx = document.getElementById('modelChart').getContext('2d');
        const models = Object.entries(data.today.models);
        charts.model = new Chart(modelCtx, {
            type: 'doughnut',
            data: {
                labels: models.map(([m]) => m),
                datasets: [{
                    data: models.map(([, u]) => u.totalToken),
                    backgroundColor: ['#4fc3f7', '#ff8a80', '#b388ff', '#80cbc4', '#ffd54f'],
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: { callbacks: { label: ctx => ctx.label + ': ' + formatCompact(ctx.raw) } }
                }
            }
        });

        const hitRateModels = models.map(([m, u]) => {
            const hitTotal = (u.inputHit || 0) + (u.inputMiss || 0);
            return { model: m, rate: hitTotal > 0 ? (u.inputHit || 0) / hitTotal * 100 : 0 };
        });
        container.innerHTML += '<div class="chart-container"><h3>缓存命中率</h3><canvas id="cacheHitChart"></canvas></div>';
        const cacheCtx = document.getElementById('cacheHitChart').getContext('2d');
        charts.cacheHit = new Chart(cacheCtx, {
            type: 'bar',
            data: {
                labels: hitRateModels.map(m => m.model),
                datasets: [{
                    label: '命中率 (%)',
                    data: hitRateModels.map(m => m.rate),
                    backgroundColor: 'rgba(79,195,247,0.7)',
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { min: 0, max: 100, ticks: { callback: v => v + '%' } } }
            }
        });
    }
}

function renderSavings(data) {
    const section = document.getElementById('savings-section');
    if (!data.savings || data.savings.savings <= 0) { section.innerHTML = ''; return; }
    const s = data.savings;
    let html = '<div class="savings-card"><h3>成本对比分析</h3>';
    html += '<p>当前消耗: ' + formatCompact(s.currentCost) + ' credits</p>';
    html += '<p>最优方案: ' + formatCompact(s.cheapestCost) + ' credits</p>';
    html += '<p class="savings-highlight">可节省: ' + formatCompact(s.savings) + ' (' + s.savingsPercent.toFixed(1) + '%)</p>';
    html += '<table><tr><th>模型</th><th>当前</th><th>最优</th><th>Token</th></tr>';
    for (const [model, info] of Object.entries(s.breakdown)) {
        html += '<tr><td>' + model + '</td><td>' + formatCompact(info.current) + '</td><td>' + formatCompact(info.alternative) + '</td><td>' + formatCompact(info.tokens) + '</td></tr>';
    }
    html += '</table></div>';
    section.innerHTML = html;
}

function renderToday(data) {
    const section = document.getElementById('today-section');
    if (!data.today) { section.innerHTML = ''; return; }
    let html = '<div class="chart-container"><h3>今日用量详情</h3>';
    html += '<table><tr><th>模型</th><th>Token</th><th>Credits</th><th>请求</th><th>均值</th><th>缓存命中率</th></tr>';
    for (const [model, usage] of Object.entries(data.today.models)) {
        const avg = usage.totalToken > 0 ? (usage.credits / usage.totalToken).toFixed(2) : '0';
        const hitTotal = (usage.inputHit || 0) + (usage.inputMiss || 0);
        const hitRate = hitTotal > 0 ? ((usage.inputHit || 0) / hitTotal * 100).toFixed(1) + '%' : '-';
        html += '<tr><td>' + model + '</td><td>' + formatCompact(usage.totalToken) + '</td><td>' + formatCompact(usage.credits) + '</td><td>' + usage.requests + '</td><td>' + avg + '</td><td>' + hitRate + '</td></tr>';
    }
    html += '</table></div>';
    section.innerHTML = html;
}

function renderTeam(data) {
    const section = document.getElementById('team-section');
    const members = Object.entries(data.team);
    if (members.length === 0) { section.innerHTML = ''; return; }
    let html = '<div class="chart-container"><h3>团队用量</h3><div class="team-grid">';
    for (const [user, snap] of members) {
        html += '<div class="team-card"><div class="name">' + user + '</div><div class="credits">' + formatCompact(snap.credits) + '</div></div>';
    }
    html += '</div></div>';
    section.innerHTML = html;
}

window.addEventListener('message', event => {
    const msg = event.data;
    if (msg.type === 'data') {
        renderStats(msg.payload);
        renderCharts(msg.payload);
        renderSavings(msg.payload);
        renderToday(msg.payload);
        renderTeam(msg.payload);
    }
});

loadData(7);
`;

/** 生成 Dashboard 完整 HTML */
export function buildDashboardHtml(
    nonce: string,
    hasChartJs: boolean,
    chartJsUri: string | null
): string {
    const js = DASHBOARD_JS.replace('__HAS_CHARTJS__', hasChartJs ? 'true' : 'false');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
    <title>Token Viewer Dashboard</title>
    <style>${DASHBOARD_CSS}</style>
</head>
<body>
    <div class="header">
        <h1>Token Viewer Dashboard</h1>
        <div class="controls">
            <button onclick="loadData(7)" id="btn7" class="active">7天</button>
            <button onclick="loadData(30)" id="btn30">30天</button>
            <button onclick="loadData(0)" id="btnAll">全部</button>
            <button onclick="refresh()">刷新</button>
        </div>
    </div>

    <div id="stats" class="stats-grid"></div>
    <div id="charts"></div>
    <div id="savings-section"></div>
    <div id="today-section"></div>
    <div id="team-section"></div>

    ${chartJsUri ? `<script nonce="${nonce}" src="${chartJsUri}"></script>` : ''}
    <script nonce="${nonce}">${js}</script>
</body>
</html>`;
}
