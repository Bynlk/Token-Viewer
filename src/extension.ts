import * as vscode from 'vscode';
import { AppState, XIAOMI_CONFIG, ModelUsage } from './types';
import { getProxyPort } from './utils';
import { initStorage, loadAccounts, getAccount, addAccount as storageAddAccount, removeAccount as storageRemoveAccount } from './storage';
import { loadAccountsDecrypted, getAccountDecrypted, addAccountEncrypted, migrateCookiesToEncrypted } from './cookie-storage';
import { fetchTokenCount, fetchTodayData } from './api';
import { getConfig, TooltipSection, SECTION_LABELS, TooltipLineKey, LINE_LABELS, LINE_TO_SECTION, ALL_LINE_KEYS, ALL_SECTIONS, sectionToSettingKey } from './config';
import { startProxy, stopProxy, updateProxyStatusBar } from './proxy';
import { captureCookieViaBrowser } from './browser';
import { openDashboard } from './dashboard';
import { formatCompact } from './utils';

// ============================================================
// Token Viewer - 小米 MiMo Credits 监控插件
// ============================================================

let app: AppState;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const outputChannel = vscode.window.createOutputChannel('Token Viewer');
    outputChannel.appendLine('[Token Viewer] 插件已激活（小米 MiMo Credits 监控）');

    // 初始化存储
    initStorage(context);

    // 创建状态栏项
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.text = '$(sync~spin) Credits: 加载中...';
    statusBarItem.tooltip = 'Token Viewer - 点击打开菜单';
    statusBarItem.command = 'tokenViewer.menu';
    statusBarItem.show();

    const proxyStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);

    // 初始化全局状态
    app = {
        statusBarItem,
        proxyStatusBarItem,
        outputChannel,
        refreshTimer: undefined,
        lastTokenCount: context.globalState.get<number>('tokenViewer.lastTokenCount'),
        alertShown: false,
        cookieErrorCount: 0,
        isRefreshingCookie: false,
        isFetching: false,
        configDebounce: undefined,
        lastNotifyTime: context.globalState.get<number>('tokenViewer.lastNotifyTime'),
        lastNotifyToken: context.globalState.get<number>('tokenViewer.lastNotifyToken'),
        lastModelUsage: undefined,
        proxyServer: undefined,
        caMaterialGlobal: undefined,
        activeProxySockets: new Set(),
        domainCertCache: new Map(),
        alertPausedUntil: undefined,
        dashboardPanel: undefined,
    };

    // 注册命令
    context.subscriptions.push(
        statusBarItem,
        proxyStatusBarItem,
        outputChannel,

        vscode.commands.registerCommand('tokenViewer.refresh', () => {
            outputChannel.appendLine('[Token Viewer] 手动触发刷新');
            fetchTokenCount(app, context);
        }),

        vscode.commands.registerCommand('tokenViewer.configure', () => configureCookie(context)),

        vscode.commands.registerCommand('tokenViewer.browserCapture', () => captureCookieViaBrowser(app, context)),

        vscode.commands.registerCommand('tokenViewer.proxyStart', () => startProxy(app, context)),
        vscode.commands.registerCommand('tokenViewer.proxyStop', () => stopProxy(app)),
        vscode.commands.registerCommand('tokenViewer.proxyStatus', () => {
            const status = app.proxyServer ? `运行中 :${getProxyPort()}` : '已停止';
            vscode.window.showInformationMessage(`Token Viewer 代理状态: ${status}`);
        }),

        vscode.commands.registerCommand('tokenViewer.openDashboard', () => openDashboard(app, context)),

        vscode.commands.registerCommand('tokenViewer.addAccount', () => addAccount(context)),
        vscode.commands.registerCommand('tokenViewer.switchAccount', () => switchAccount(context)),
        vscode.commands.registerCommand('tokenViewer.removeAccount', () => removeAccount(context)),

        vscode.commands.registerCommand('tokenViewer.showReport', () => showReport(context)),
        vscode.commands.registerCommand('tokenViewer.recharge', () => {
            vscode.env.openExternal(vscode.Uri.parse(XIAOMI_CONFIG.loginUrl));
        }),
        vscode.commands.registerCommand('tokenViewer.copyUsage', () => copyUsage(context)),
        vscode.commands.registerCommand('tokenViewer.pauseAlerts', () => {
            app.alertPausedUntil = Date.now() + 60 * 60 * 1000;
            vscode.window.showInformationMessage('告警已暂停 1 小时');
        }),

        vscode.commands.registerCommand('tokenViewer.menu', () => showMenu(context)),
        vscode.commands.registerCommand('tokenViewer.openSettings', () => {
            vscode.commands.executeCommand('workbench.action.openSettings', 'tokenViewer');
        }),

        vscode.commands.registerCommand('tokenViewer.toggleSections', () => toggleSections(context)),
        vscode.commands.registerCommand('tokenViewer.selectModels', () => selectModels(context)),

        // 配置变更监听
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('tokenViewer')) {
                if (app.configDebounce) { clearTimeout(app.configDebounce); }
                app.configDebounce = setTimeout(() => {
                    outputChannel.appendLine('[Token Viewer] 配置已变更，重新启动定时器');
                    setupTimer(context);
                    fetchTokenCount(app, context);
                }, 500);
            }
        })
    );

    // 初始化代理状态栏
    updateProxyStatusBar(app);
    proxyStatusBarItem.show();

    // 如果配置中没有 Cookie 但 globalState 中有保存的，自动恢复
    const config = vscode.workspace.getConfiguration('tokenViewer');
    const currentCookie = config.get<Record<string, string>>('headers', {})['Cookie'];
    if (!currentCookie) {
        const savedCookie = context.globalState.get<string>('tokenViewer.savedCookie');
        if (savedCookie) {
            await config.update('headers', { Cookie: savedCookie }, vscode.ConfigurationTarget.Global);
            outputChannel.appendLine('[Token Viewer] 已从本地缓存恢复 Cookie');
        }
    }

    // 迁移明文 cookie 到加密存储
    migrateCookiesToEncrypted(context).then(count => {
        if (count > 0) {
            outputChannel.appendLine(`[Token Viewer] 已加密 ${count} 个 cookie`);
        }
    }).catch(() => { /* 迁移失败不阻塞启动 */ });

    // 首次刷新
    fetchTokenCount(app, context);

    // 启动定时刷新
    setupTimer(context);
}

export function deactivate(): void {
    if (app) {
        if (app.refreshTimer) {
            clearInterval(app.refreshTimer);
            app.refreshTimer = undefined;
        }
        if (app.configDebounce) {
            clearTimeout(app.configDebounce);
            app.configDebounce = undefined;
        }
        stopProxy(app);
    }
}

// ============================================================
// 内部工具函数
// ============================================================

function setupTimer(context: vscode.ExtensionContext): void {
    if (app.refreshTimer) {
        clearInterval(app.refreshTimer);
        app.refreshTimer = undefined;
    }

    const config = getConfig();
    const intervalMs = config.refreshInterval * 1000;

    if (intervalMs > 0) {
        app.refreshTimer = setInterval(() => {
            fetchTokenCount(app, context);
        }, intervalMs);
        app.outputChannel.appendLine(`[Token Viewer] 定时器已启动，间隔 ${config.refreshInterval} 秒`);
    }
}

async function configureCookie(context: vscode.ExtensionContext): Promise<void> {
    const config = vscode.workspace.getConfiguration('tokenViewer');
    const currentHeaders = config.get<Record<string, string>>('headers', {});
    const currentCookie = currentHeaders['Cookie'] || '';

    const cookieValue = await vscode.window.showInputBox({
        prompt: '请粘贴小米 MiMo 的 Cookie\n\n' +
            '获取方法：\n' +
            '1. 浏览器打开 https://platform.xiaomimimo.com/console/plan-manage\n' +
            '2. 登录后按 F12 → Network → 找到请求 → Headers → 复制 Cookie 的值',
        placeHolder: '粘贴完整的 Cookie 字符串...',
        value: currentCookie,
        validateInput: (value) => {
            if (!value || value.trim() === '') { return 'Cookie 不能为空'; }
            return null;
        },
    });

    if (cookieValue === undefined) {
        vscode.window.showInformationMessage('Token Viewer 配置已取消');
        return;
    }

    const headers: Record<string, string> = { 'Cookie': cookieValue };
    await config.update('headers', headers, vscode.ConfigurationTarget.Global);
    await context.globalState.update('tokenViewer.savedCookie', cookieValue);

    app.outputChannel.appendLine('[Token Viewer] ✅ Cookie 已更新');
    vscode.window.showInformationMessage('✅ Cookie 已保存，正在刷新...');
    fetchTokenCount(app, context);
}

// ============================================================
// 多账号管理
// ============================================================

async function addAccount(context: vscode.ExtensionContext): Promise<void> {
    const name = await vscode.window.showInputBox({
        prompt: '输入账号别名',
        placeHolder: '例如：个人账号、公司账号...',
    });
    if (!name) { return; }

    const cookie = await vscode.window.showInputBox({
        prompt: '粘贴该账号的 Cookie',
        placeHolder: 'Cookie 字符串...',
    });
    if (!cookie) { return; }

    const profile = await addAccountEncrypted(context, name, cookie);
    vscode.window.showInformationMessage(`✅ 账号 "${name}" 已添加`);

    // 询问是否切换到新账号
    const action = await vscode.window.showInformationMessage('是否切换到新添加的账号？', '切换', '稍后');
    if (action === '切换') {
        await context.globalState.update('tokenViewer.activeAccountId', profile.id);
        const config = vscode.workspace.getConfiguration('tokenViewer');
        await config.update('headers', { Cookie: cookie }, vscode.ConfigurationTarget.Global);
        fetchTokenCount(app, context);
    }
}

async function switchAccount(context: vscode.ExtensionContext): Promise<void> {
    const accounts = await loadAccountsDecrypted(context);
    if (accounts.length === 0) {
        vscode.window.showInformationMessage('暂无保存的账号，请先添加账号');
        return;
    }

    const activeId = context.globalState.get<string>('tokenViewer.activeAccountId');
    const items = accounts.map(a => ({
        label: a.name,
        description: a.id === activeId ? '(当前)' : '',
        id: a.id,
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: '选择要切换的账号',
    });

    if (!selected) { return; }

    const account = accounts.find(a => a.id === selected.id);
    if (!account) { return; }

    await context.globalState.update('tokenViewer.activeAccountId', account.id);
    const config = vscode.workspace.getConfiguration('tokenViewer');
    await config.update('headers', { Cookie: account.cookie }, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`已切换到 "${account.name}"`);
    fetchTokenCount(app, context);
}

async function removeAccount(context: vscode.ExtensionContext): Promise<void> {
    const accounts = loadAccounts();
    if (accounts.length === 0) {
        vscode.window.showInformationMessage('暂无保存的账号');
        return;
    }

    const items = accounts.map(a => ({
        label: a.name,
        id: a.id,
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: '选择要删除的账号',
    });

    if (!selected) { return; }

    storageRemoveAccount(selected.id);
    vscode.window.showInformationMessage(`账号 "${selected.label}" 已删除`);

    // 如果删除的是当前账号，清空激活状态并刷新
    const activeId = context.globalState.get<string>('tokenViewer.activeAccountId');
    if (activeId === selected.id) {
        await context.globalState.update('tokenViewer.activeAccountId', undefined);
        fetchTokenCount(app, context);
    }
}

// ============================================================
// 快捷操作
// ============================================================

async function showReport(context: vscode.ExtensionContext): Promise<void> {
    const headers = getConfig().headers;
    if (!headers['Cookie']) {
        vscode.window.showWarningMessage('请先配置 Cookie');
        return;
    }

    try {
        const data = await fetchTodayData(headers, app.outputChannel);
        if (!data || Object.keys(data.models).length === 0) {
            vscode.window.showInformationMessage('暂无今日用量数据');
            return;
        }

        const items: vscode.QuickPickItem[] = [];
        let allCredits = 0;
        let allTokens = 0;

        for (const [model, usage] of Object.entries(data.models)) {
            allCredits += usage.credits;
            allTokens += usage.totalToken;
            const avg = usage.totalToken > 0 ? (usage.credits / usage.totalToken).toFixed(2) : '0';
            items.push({
                label: `${model}`,
                description: `Token: ${formatCompact(usage.totalToken)} | Credits: ${formatCompact(usage.credits)}`,
                detail: `  请求: ${usage.requests}次 | 均值: ${avg} credits/token`,
            });
        }

        items.unshift({
            label: '📊 今日汇总',
            description: `Token: ${formatCompact(allTokens)} | Credits: ${formatCompact(allCredits)}`,
            detail: `  共 ${Object.keys(data.models).length} 个模型`,
        });

        vscode.window.showQuickPick(items, {
            placeHolder: `今日用量报告 (${data.date})`,
            canPickMany: false,
        });
    } catch (err) {
        vscode.window.showErrorMessage('获取用量报告失败');
    }
}

async function copyUsage(_context: vscode.ExtensionContext): Promise<void> {
    const headers = getConfig().headers;
    if (!headers['Cookie']) {
        vscode.window.showWarningMessage('请先配置 Cookie');
        return;
    }

    try {
        const data = await fetchTodayData(headers, app.outputChannel);
        if (!data) {
            vscode.window.showWarningMessage('暂无今日用量数据');
            return;
        }

        let text = `Token Viewer 用量报告 - ${data.date}\n`;
        text += '═'.repeat(40) + '\n';
        for (const [model, usage] of Object.entries(data.models)) {
            text += `\n${model}\n`;
            text += `  Token: ${usage.totalToken.toLocaleString('zh-CN')}\n`;
            text += `  Credits: ${usage.credits.toLocaleString('zh-CN')}\n`;
            text += `  请求: ${usage.requests}次\n`;
        }

        await vscode.env.clipboard.writeText(text);
        vscode.window.showInformationMessage('✅ 用量报告已复制到剪贴板');
    } catch (err) {
        vscode.window.showErrorMessage('获取用量数据失败');
    }
}

// ============================================================
// 状态栏菜单
// ============================================================

async function showMenu(context: vscode.ExtensionContext): Promise<void> {
    const activeId = context.globalState.get<string>('tokenViewer.activeAccountId');
    const activeAccount = activeId ? await getAccountDecrypted(context, activeId) : undefined;
    const accountName = activeAccount?.name || '默认';

    interface MenuItem extends vscode.QuickPickItem {
        command: () => void | Promise<void>;
    }

    const items: MenuItem[] = [
        { label: '$(refresh) 刷新 Credits', description: '立即获取最新数据', command: () => fetchTokenCount(app, context) },
        { label: '$(graph) 打开用量面板', description: 'Dashboard 趋势图', command: () => openDashboard(app, context) },
        { label: '$(person-add) 添加账号', description: '保存新的 Cookie', command: () => addAccount(context) },
        { label: '$(person) 切换账号', description: `当前: ${accountName}`, command: () => switchAccount(context) },
        { label: '$(trash) 删除账号', description: '移除已保存的账号', command: () => removeAccount(context) },
        { label: '$(report) 查看今日报告', description: '详细用量数据', command: () => showReport(context) },
        { label: '$(clippy) 复制用量摘要', description: '复制到剪贴板', command: () => copyUsage(context) },
        { label: '$(bell-slash) 暂停告警', description: '暂停 1 小时', command: () => { app.alertPausedUntil = Date.now() + 60 * 60 * 1000; vscode.window.showInformationMessage('告警已暂停 1 小时'); } },
        { label: '$(browser) 浏览器获取 Cookie', description: '自动登录采集', command: () => captureCookieViaBrowser(app, context) },
        { label: '$(key) 配置 Cookie', description: '手动粘贴', command: () => configureCookie(context) },
        { label: '$(settings) 设置', description: '打开 VS Code 设置', command: () => vscode.commands.executeCommand('workbench.action.openSettings', 'tokenViewer') },
        { label: '$(list-selection) 选择显示板块', description: '自定义 Tooltip 内容', command: () => toggleSections(context) },
        { label: '$(symbol-class) 选择显示模型', description: '筛选显示的模型', command: () => selectModels(context) },
        { label: '$(link-external) 打开充值页面', description: 'platform.xiaomimimo.com', command: () => vscode.env.openExternal(vscode.Uri.parse(XIAOMI_CONFIG.loginUrl)) },
    ];

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Token Viewer 操作',
    });

    if (!selected) { return; }
    await selected.command();
}

// ============================================================
// 板块选择
// ============================================================

async function toggleSections(context: vscode.ExtensionContext): Promise<void> {
    const config = vscode.workspace.getConfiguration('tokenViewer');

    interface SectionItem extends vscode.QuickPickItem {
        sectionKey?: TooltipSection;
        lineKey?: TooltipLineKey;
        uniqueKey: string;
    }

    const items: SectionItem[] = [];

    for (const section of ALL_SECTIONS) {
        const sectionEnabled = config.get<boolean>(sectionToSettingKey(section), true);

        // 板块标题行
        items.push({
            label: `$(folder) ${SECTION_LABELS[section]}`,
            description: section,
            picked: sectionEnabled,
            sectionKey: section,
            uniqueKey: `s:${section}`,
        });

        // 该板块下的细分行
        const sectionLines = ALL_LINE_KEYS.filter(k => LINE_TO_SECTION[k] === section);
        for (const lineKey of sectionLines) {
            const lineEnabled = config.get<boolean>(`line.${lineKey}`, true);
            items.push({
                label: `    ${LINE_LABELS[lineKey]}`,
                description: lineKey,
                picked: sectionEnabled && lineEnabled,
                lineKey,
                uniqueKey: `l:${lineKey}`,
            });
        }
    }

    const picker = vscode.window.createQuickPick<SectionItem>();
    picker.items = items;
    picker.canSelectMany = true;
    picker.placeholder = '勾选要显示的板块和行（板块关闭时子行自动隐藏）';
    picker.selectedItems = items.filter(i => i.picked);

    picker.onDidAccept(async () => {
        const selectedKeys = new Set(picker.selectedItems.map(i => i.uniqueKey));

        // 更新板块开关
        for (const section of ALL_SECTIONS) {
            const enabled = selectedKeys.has(`s:${section}`);
            await config.update(sectionToSettingKey(section), enabled, vscode.ConfigurationTarget.Global);
        }

        // 更新行开关
        for (const lineKey of ALL_LINE_KEYS) {
            const enabled = selectedKeys.has(`l:${lineKey}`);
            await config.update(`line.${lineKey}`, enabled, vscode.ConfigurationTarget.Global);
        }

        picker.dispose();
        vscode.window.showInformationMessage('已更新显示板块');
        fetchTokenCount(app, context);
    });

    picker.show();
}

// ============================================================
// 模型筛选
// ============================================================

async function selectModels(context: vscode.ExtensionContext): Promise<void> {
    // 获取已知模型列表（从 globalState 或 MODEL_RATES 中）
    const knownModels = context.globalState.get<string[]>('tokenViewer.knownModels', []);
    const selectedModels = context.globalState.get<string[]>('tokenViewer.selectedModels', []);

    if (knownModels.length === 0) {
        vscode.window.showInformationMessage('暂无已知模型数据，请先等待数据加载');
        return;
    }

    const items: vscode.QuickPickItem[] = knownModels.map(model => ({
        label: model,
        description: selectedModels.length === 0 || selectedModels.includes(model) ? '显示' : '隐藏',
        picked: selectedModels.length === 0 || selectedModels.includes(model),
    }));

    const picker = vscode.window.createQuickPick();
    picker.items = items;
    picker.canSelectMany = true;
    picker.placeholder = '选择要显示的模型（取消勾选则隐藏）';
    picker.selectedItems = items.filter(i => i.picked);

    picker.onDidAccept(async () => {
        const selected = picker.selectedItems.map(i => i.label);
        await context.globalState.update('tokenViewer.selectedModels', selected);
        picker.dispose();
        vscode.window.showInformationMessage(`已选择显示 ${selected.length} 个模型`);
        fetchTokenCount(app, context);
    });

    picker.show();
}
