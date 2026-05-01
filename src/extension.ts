import * as vscode from 'vscode';

// ============================================================
// Token Viewer - VSCode 状态栏 Token 监控插件
// ============================================================

/** 配置项接口定义 */
interface TokenViewerConfig {
    apiUrl: string;
    headers: Record<string, string>;
    jsonPath: string;
    refreshInterval: number;
    alertThreshold: number;
}

/** 全局状态 */
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
let refreshTimer: NodeJS.Timeout | undefined;
let lastTokenCount: number | undefined;
let alertShown: boolean = false;

// ============================================================
// 激活函数 - 插件入口
// ============================================================
export function activate(context: vscode.ExtensionContext): void {
    // 创建输出通道，用于记录详细日志
    outputChannel = vscode.window.createOutputChannel('Token Viewer');
    outputChannel.appendLine('[Token Viewer] 插件已激活');

    // 创建状态栏项（右侧，优先级 100）
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.text = '$(sync~spin) Token: 加载中...';
    statusBarItem.tooltip = 'Token Viewer - 点击刷新';
    statusBarItem.command = 'tokenViewer.refresh';
    statusBarItem.show();

    // 注册刷新命令
    const refreshCommand = vscode.commands.registerCommand(
        'tokenViewer.refresh',
        () => {
            outputChannel.appendLine('[Token Viewer] 手动触发刷新');
            fetchTokenCount(context);
        }
    );

    // 注册交互式配置命令
    const configureCommand = vscode.commands.registerCommand(
        'tokenViewer.configure',
        () => configureSettings(context)
    );

    // 监听配置变更，自动重新启动定时器
    const configChangeListener = vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('tokenViewer')) {
            outputChannel.appendLine('[Token Viewer] 配置已变更，重新启动定时器');
            setupTimer(context);
            // 立即刷新一次
            fetchTokenCount(context);
        }
    });

    // 注册到订阅列表
    context.subscriptions.push(statusBarItem, outputChannel, refreshCommand, configureCommand, configChangeListener);

    // 首次加载：从 globalState 恢复上次的 Token 数量
    lastTokenCount = context.globalState.get<number>('tokenViewer.lastTokenCount');

    // 执行首次刷新
    fetchTokenCount(context);

    // 启动定时刷新
    setupTimer(context);
}

// ============================================================
// 停用函数
// ============================================================
export function deactivate(): void {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = undefined;
    }
}

// ============================================================
// 已知平台配置注册表
// ============================================================
interface PlatformProfile {
    label: string;           // 显示名称
    description: string;     // 简短描述
    apiUrl: string;          // API 地址
    jsonPath: string;        // JSON 解析路径
    headerHint: string;      // 请求头提示（告诉用户需要什么）
    headerKey: string;       // 请求头的键名（如 "Cookie"、"Authorization"）
}

/** 内置支持的平台列表 */
const PLATFORM_PROFILES: PlatformProfile[] = [
    {
        label: '$(globe) 小米 MiMo',
        description: 'platform.xiaomimimo.com',
        apiUrl: 'https://platform.xiaomimimo.com/api/v1/tokenPlan/usage',
        jsonPath: 'data.usage.items[0].limit - data.usage.items[0].used',
        headerHint: '请从浏览器复制完整的 Cookie 字符串',
        headerKey: 'Cookie',
    },
    {
        label: '$(globe) OpenAI',
        description: 'api.openai.com',
        apiUrl: 'https://api.openai.com/dashboard/billing/credit_grants',
        jsonPath: 'total_granted - total_used',
        headerHint: '请从浏览器复制 Cookie，或输入 API Key（Bearer sk-xxx）',
        headerKey: 'Authorization',
    },
    {
        label: '$(globe) DeepSeek',
        description: 'api.deepseek.com',
        apiUrl: 'https://api.deepseek.com/user/balance',
        jsonPath: 'balance_infos[0].total_balance',
        headerHint: '请输入 API Key（Bearer sk-xxx）',
        headerKey: 'Authorization',
    },
    {
        label: '$(globe) 通义千问',
        description: 'dashscope.aliyuncs.com',
        apiUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
        jsonPath: '',
        headerHint: '请输入 API Key（Bearer sk-xxx）',
        headerKey: 'Authorization',
    },
    {
        label: '$(globe) Claude (Anthropic)',
        description: 'console.anthropic.com',
        apiUrl: '',
        jsonPath: '',
        headerHint: '请从浏览器复制 Cookie 或输入 API Key',
        headerKey: 'Cookie',
    },
    {
        label: '$(globe) 豆包 (字节跳动)',
        description: 'www.doubao.com',
        apiUrl: '',
        jsonPath: '',
        headerHint: '请从浏览器复制完整的 Cookie 字符串',
        headerKey: 'Cookie',
    },
    {
        label: '$(globe) Kimi (月之暗面)',
        description: 'kimi.moonshot.cn',
        apiUrl: '',
        jsonPath: '',
        headerHint: '请从浏览器复制完整的 Cookie 字符串',
        headerKey: 'Cookie',
    },
    {
        label: '$(globe) 智谱 AI',
        description: 'open.bigmodel.cn',
        apiUrl: 'https://open.bigmodel.cn/api/paas/v4/user/status',
        jsonPath: 'data.total_quota - data.used_quota',
        headerHint: '请输入 API Key（Bearer xxx）',
        headerKey: 'Authorization',
    },
    {
        label: '$(globe) 零一万物',
        description: 'api.lingyiwanwu.com',
        apiUrl: 'https://api.lingyiwanwu.com/v1/dashboard/billing/subscription',
        jsonPath: 'data.total_granted - data.used_granted',
        headerHint: '请输入 API Key（Bearer xxx）',
        headerKey: 'Authorization',
    },
    {
        label: '$(edit) 自定义平台',
        description: '手动输入 API 地址和 JSON 路径',
        apiUrl: '',
        jsonPath: '',
        headerHint: '请输入请求头（JSON 格式，如 {"Cookie": "xxx"}）',
        headerKey: '',
    },
];

// ============================================================
// URL 自动识别 - 根据 URL 匹配已知平台
// ============================================================
function detectPlatformFromUrl(url: string): PlatformProfile | undefined {
    const lowerUrl = url.toLowerCase();
    for (const profile of PLATFORM_PROFILES) {
        if (profile.apiUrl) {
            try {
                const hostname = new URL(profile.apiUrl).hostname;
                if (lowerUrl.includes(hostname)) {
                    return profile;
                }
            } catch {
                // 跳过无效 URL
            }
        }
    }
    return undefined;
}

// ============================================================
// 交互式配置向导 - 输入 URL 自动识别平台，只需粘贴 Cookie
// ============================================================
async function configureSettings(context: vscode.ExtensionContext): Promise<void> {
    const config = vscode.workspace.getConfiguration('tokenViewer');

    // ---- 第 1 步：输入 API 地址（自动识别平台） ----
    const currentApiUrl = config.get<string>('apiUrl', '');
    const apiUrl = await vscode.window.showInputBox({
        prompt: '【第 1 步 / 共 2 步】请输入 API 地址\n\n' +
            '支持自动识别以下平台：小米MiMo、OpenAI、DeepSeek、智谱AI、零一万物等\n' +
            '输入 URL 后会自动填充 JSON 解析路径\n\n' +
            '获取方法：浏览器登录平台 → F12 → Network → 找到请求 → 复制 Request URL',
        placeHolder: 'https://platform.xiaomimimo.com/api/v1/tokenPlan/usage',
        value: currentApiUrl,
        validateInput: (value) => {
            if (!value || value.trim() === '') { return 'API 地址不能为空'; }
            if (!value.startsWith('http://') && !value.startsWith('https://')) { return '必须以 http:// 或 https:// 开头'; }
            return null;
        },
    });
    if (apiUrl === undefined) { vscode.window.showInformationMessage('Token Viewer 配置已取消'); return; }

    // ---- 自动识别平台 ----
    const detectedProfile = detectPlatformFromUrl(apiUrl);
    let jsonPath = config.get<string>('jsonPath', '');
    let headerKey = 'Cookie';
    let headerHint = '请粘贴 Cookie 或 API Key';

    if (detectedProfile) {
        // 自动填充已识别平台的配置
        jsonPath = detectedProfile.jsonPath;
        headerKey = detectedProfile.headerKey;
        headerHint = detectedProfile.headerHint;
        vscode.window.showInformationMessage(`🔍 已识别平台: ${detectedProfile.description}，JSON 路径已自动填充`);
    } else {
        // 未识别的平台，需要手动输入 JSON 路径
        const customPath = await vscode.window.showInputBox({
            prompt: '未识别此平台，请手动输入 JSON 解析路径\n\n' +
                '支持：简单路径(data.remaining)、数组索引(data.items[0].limit)、减法(data.items[0].limit - data.items[0].used)',
            placeHolder: 'data.remaining',
            value: jsonPath,
            validateInput: (value) => {
                if (!value || value.trim() === '') { return '解析路径不能为空'; }
                if (/[^\w.\[\] \-]/.test(value)) { return '路径包含非法字符'; }
                return null;
            },
        });
        if (customPath === undefined) { vscode.window.showInformationMessage('Token Viewer 配置已取消'); return; }
        jsonPath = customPath;
    }

    // ---- 第 2 步：粘贴 Cookie / API Key ----
    const currentHeaders = config.get<Record<string, string>>('headers', {});
    const currentHeaderValue = currentHeaders[headerKey] || '';

    const headerValue = await vscode.window.showInputBox({
        prompt: `【第 2 步 / 共 2 步】${headerHint}\n\n` +
            `获取方法：浏览器登录平台 → F12 → Network → 找到请求 → Headers → 复制 ${headerKey} 的值`,
        placeHolder: headerKey === 'Cookie' ? '粘贴完整的 Cookie 字符串...' : 'Bearer sk-xxxxx',
        value: currentHeaderValue,
        password: headerKey === 'Authorization',
        validateInput: (value) => {
            if (!value || value.trim() === '') { return `${headerKey} 不能为空`; }
            return null;
        },
    });
    if (headerValue === undefined) { vscode.window.showInformationMessage('Token Viewer 配置已取消'); return; }

    // 构建请求头
    const headers: Record<string, string> = {};
    headers[headerKey] = headerValue;

    // ---- 保存配置 ----
    try {
        await config.update('apiUrl', apiUrl, vscode.ConfigurationTarget.Global);
        await config.update('headers', headers, vscode.ConfigurationTarget.Global);
        await config.update('jsonPath', jsonPath, vscode.ConfigurationTarget.Global);

        const platformName = detectedProfile ? detectedProfile.description : '自定义平台';
        outputChannel.appendLine('[Token Viewer] 配置已通过向导更新:');
        outputChannel.appendLine(`  平台: ${platformName}`);
        outputChannel.appendLine(`  API 地址: ${apiUrl}`);
        outputChannel.appendLine(`  请求头: { "${headerKey}": "***" }`);
        outputChannel.appendLine(`  JSON 路径: ${jsonPath}`);

        vscode.window.showInformationMessage(
            `✅ Token Viewer 配置完成！\n平台: ${platformName}\n正在刷新...`
        );

        // 立即刷新一次以验证配置
        fetchTokenCount(context);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Token Viewer 配置保存失败: ${msg}`);
        outputChannel.appendLine(`[Token Viewer] 配置保存失败: ${msg}`);
    }
}

// ============================================================
// 读取用户配置
// ============================================================
function getConfig(): TokenViewerConfig {
    const config = vscode.workspace.getConfiguration('tokenViewer');
    return {
        apiUrl: config.get<string>('apiUrl', ''),
        headers: config.get<Record<string, string>>('headers', {}),
        jsonPath: config.get<string>('jsonPath', ''),
        refreshInterval: config.get<number>('refreshInterval', 60),
        alertThreshold: config.get<number>('alertThreshold', 100),
    };
}

// ============================================================
// 设置定时刷新
// ============================================================
function setupTimer(context: vscode.ExtensionContext): void {
    // 清除旧的定时器
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = undefined;
    }

    const config = getConfig();
    const intervalMs = config.refreshInterval * 1000;

    if (intervalMs > 0) {
        refreshTimer = setInterval(() => {
            fetchTokenCount(context);
        }, intervalMs);
        outputChannel.appendLine(`[Token Viewer] 定时器已启动，间隔 ${config.refreshInterval} 秒`);
    }
}

// ============================================================
// 获取 Token 数量（核心请求逻辑）
// ============================================================
async function fetchTokenCount(context: vscode.ExtensionContext): Promise<void> {
    const config = getConfig();

    // 检查 API 地址是否配置
    if (!config.apiUrl) {
        statusBarItem.text = '$(warning) Token: 未配置';
        statusBarItem.tooltip = '请在设置中配置 tokenViewer.apiUrl';
        outputChannel.appendLine('[Token Viewer] 警告：未配置 API 地址，请在设置中填写 tokenViewer.apiUrl');
        return;
    }

    try {
        // 构建请求头
        const headers: Record<string, string> = {
            'Accept': 'application/json',
            ...config.headers,
        };

        outputChannel.appendLine(`[Token Viewer] 正在请求: ${config.apiUrl}`);

        // 使用 Node.js 内置的 https/http 模块发起请求
        const responseBody = await httpGet(config.apiUrl, headers);

        // 解析 JSON 响应
        let jsonData: any;
        try {
            jsonData = JSON.parse(responseBody);
        } catch (parseError) {
            const errorMsg = `JSON 解析失败: ${parseError instanceof Error ? parseError.message : String(parseError)}`;
            handleFetchError(errorMsg, `响应内容: ${responseBody.substring(0, 500)}`);
            return;
        }

        // 按用户指定的路径提取 Token 数量
        const tokenCount = resolveJsonPath(jsonData, config.jsonPath);

        if (tokenCount === undefined || tokenCount === null) {
            handleFetchError(
                `无法按路径 "${config.jsonPath}" 解析 Token 数量`,
                `JSON 结构: ${JSON.stringify(jsonData).substring(0, 500)}`
            );
            return;
        }

        // 转为数字类型
        const tokenNum = Number(tokenCount);
        if (isNaN(tokenNum)) {
            handleFetchError(
                `路径 "${config.jsonPath}" 的值不是有效数字: ${tokenCount}`,
                `JSON 结构: ${JSON.stringify(jsonData).substring(0, 500)}`
            );
            return;
        }

        // 成功获取 Token 数量
        lastTokenCount = tokenNum;

        // 持久化存储
        context.globalState.update('tokenViewer.lastTokenCount', tokenNum);

        // 更新状态栏
        statusBarItem.text = `$(robot) Token: ${tokenNum}`;
        const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        statusBarItem.tooltip = `Token Viewer\n当前数量: ${tokenNum}\n最后更新: ${now}\n点击刷新`;

        // 根据阈值设置颜色
        if (tokenNum <= config.alertThreshold) {
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');

            // 仅在首次低于阈值时弹出警告
            if (!alertShown) {
                alertShown = true;
                vscode.window.showWarningMessage(
                    `⚠️ Token 数量不足！当前剩余: ${tokenNum}，阈值: ${config.alertThreshold}`
                );
            }
        } else {
            statusBarItem.backgroundColor = undefined;
            alertShown = false;
        }

        outputChannel.appendLine(`[Token Viewer] 成功获取 Token 数量: ${tokenNum}`);

    } catch (error) {
        handleFetchError(
            error instanceof Error ? error.message : String(error),
            undefined
        );
    }
}

// ============================================================
// 错误处理
// ============================================================
function handleFetchError(message: string, detail?: string): void {
    // 状态栏显示错误，保留上次的值
    if (lastTokenCount !== undefined) {
        statusBarItem.text = `$(warning) Token: ${lastTokenCount} ⚠`;
        statusBarItem.tooltip = `Token Viewer - 请求失败\n${message}\n保留上次的值: ${lastTokenCount}`;
    } else {
        statusBarItem.text = '$(error) Token: Error';
        statusBarItem.tooltip = `Token Viewer - 请求失败\n${message}`;
    }

    // 输出详细错误日志到输出通道
    outputChannel.appendLine(`[Token Viewer] 错误: ${message}`);
    if (detail) {
        outputChannel.appendLine(`[Token Viewer] 详情: ${detail}`);
    }
    outputChannel.appendLine('');
}

// ============================================================
// JSON 路径解析（支持点号分隔、数组索引、减法表达式）
//
// 支持的格式：
//   - 简单路径：data.remaining
//   - 数组索引：data.usage.items[0].limit
//   - 减法表达式：data.usage.items[0].limit - data.usage.items[0].used
// ============================================================
function resolveJsonPath(obj: any, path: string): any {
    if (!path) {
        return obj;
    }

    // 检查是否包含减法表达式（支持多个减号）
    // 例如: "data.usage.items[0].limit - data.usage.items[0].used"
    const trimmedPath = path.trim();

    // 尝试按减号分割，但要排除负数数字中的减号
    // 策略：按 " - " (空格-减号-空格) 分割
    if (trimmedPath.includes(' - ')) {
        const parts = trimmedPath.split(' - ');
        if (parts.length >= 2) {
            // 计算所有部分的值并相减
            let result: number | undefined;
            for (const part of parts) {
                const value = resolveSinglePath(obj, part.trim());
                const num = Number(value);
                if (isNaN(num)) {
                    return undefined;
                }
                if (result === undefined) {
                    result = num;
                } else {
                    result -= num;
                }
            }
            return result;
        }
    }

    // 单一路径（无减法）
    return resolveSinglePath(obj, trimmedPath);
}

/**
 * 解析单个 JSON 路径（支持数组索引）
 * 例如: data.usage.items[0].limit
 */
function resolveSinglePath(obj: any, path: string): any {
    if (!path) {
        return obj;
    }

    // 使用正则将路径拆分为段，支持 "field" 和 "field[index]" 两种格式
    // 例如: "data.usage.items[0].limit" → ["data", "usage", "items[0]", "limit"]
    const segments = path.split('.').filter(s => s.length > 0);
    let current = obj;

    for (const segment of segments) {
        if (current === null || current === undefined) {
            return undefined;
        }

        // 检查是否包含数组索引，如 "items[0]"
        const arrayMatch = segment.match(/^([^\[]+)\[(\d+)\]$/);
        if (arrayMatch) {
            const fieldName = arrayMatch[1];
            const index = parseInt(arrayMatch[2], 10);
            current = current[fieldName];
            if (!Array.isArray(current)) {
                return undefined;
            }
            current = current[index];
        } else {
            current = current[segment];
        }
    }

    return current;
}

// ============================================================
// HTTP GET 请求（使用 Node.js 内置模块，无需额外依赖）
// ============================================================
function httpGet(url: string, headers: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
        // 根据 URL 协议选择 http 或 https
        const isHttps = url.startsWith('https');
        const httpModule = isHttps ? require('https') : require('http');

        const urlObj = new URL(url);

        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: headers,
            timeout: 15000, // 15 秒超时
        };

        const req = httpModule.request(options, (res: any) => {
            let data = '';

            res.on('data', (chunk: string) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(data);
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}\n响应: ${data.substring(0, 500)}`));
                }
            });
        });

        req.on('error', (error: Error) => {
            reject(new Error(`网络请求失败: ${error.message}`));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('请求超时（15 秒）'));
        });

        req.end();
    });
}
