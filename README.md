<p align="center">
  <img src="https://img.shields.io/badge/VSCode-Extension-blue?style=for-the-badge&logo=visual-studio-code" alt="VSCode Extension">
  <img src="https://img.shields.io/badge/TypeScript-5.3-blue?style=for-the-badge&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Tests-192%20✅-brightgreen?style=for-the-badge" alt="Tests">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License">
</p>

<h1 align="center">Token Viewer</h1>

<p align="center">
  小米 MiMo Credits 全方位管理平台<br>
  实时监控 · 趋势分析 · 预算管理 · 多账号 · 团队协作
</p>

<p align="center">
  <a href="#安装">安装</a> ·
  <a href="#功能特性">功能</a> ·
  <a href="#配置">配置</a> ·
  <a href="#开发">开发</a> ·
  <a href="https://github.com/Bynlk/Token-Viewer/releases">下载</a>
</p>

---

## 功能特性

### 核心监控
- **Credits 实时监控** — 状态栏显示剩余 Credits，支持 `1.2M`、`4.1B` 等紧凑格式
- **剩余百分比** — 同时显示额度剩余百分比（如 `4.1B (98.7%)`）
- **今日用量** — 鼠标悬停查看各模型 Token 用量、Credits 消耗、请求次数和缓存命中率
- **自动定时刷新** — 默认每 10 秒刷新，可自定义间隔（最小 10 秒）
- **HTTP 自动重试** — 网络抖动时自动重试 3 次（指数退避），无需手动干预

### 数据分析
- **用量面板 (Dashboard)** — 可视化面板：Credits 趋势图、每日消耗柱状图、模型 Token 分布、缓存命中率
- **消耗预测** — 基于历史数据预测 Credits 还能使用多少天
- **成本对比分析** — 对比当前模型消耗与最优方案，计算可节省的 Credits
- **月度预算管理** — 设置月度预算上限，支持多级告警（50%/80%/100%）
- **今日报告** — 一键查看当天各模型详细用量报告

### 账号管理
- **多账号支持** — 添加多个小米账号，一键切换
- **🔒 Cookie 加密存储** — Cookie 使用 VS Code SecretStorage 加密保存，启动时自动迁移明文数据
- **Cookie 自动获取** — 浏览器自动登录并提取 Cookie（支持 Chrome/Edge）
- **HTTP 代理采集** — 内置 MITM 代理服务器，自动从 HTTPS 请求中提取 Cookie
- **Cookie 过期检测** — 连续认证失败后自动引导更新 Cookie

### 团队协作
- **团队共享** — 通过共享目录同步团队成员的用量数据
- **团队用量面板** — Dashboard 中查看各成员的 Credits 使用情况

### 自定义显示
- **Tooltip 板块选择** — 自由控制 Tooltip 中显示哪些板块（账号信息/今日用量/预测/预算/费率/缓存命中率/GitHub）
- **Tooltip 行级控制** — 精细控制每个板块中的每一行显示
- **模型筛选** — 选择只显示关注的模型数据
- **告警管理** — 支持暂停告警 1 小时

## 模型消耗比例

各模型按不同比例消耗 Credits，TTS 系列免费：

| 模型 | 输入（命中缓存） | 输入（未命中缓存） | 输出 |
|------|:---:|:---:|:---:|
| MiMo-V2.5-Pro | 2.5 | 300 | 600 |
| MiMo-V2.5 | 2 | 100 | 200 |

> TTS 系列模型限时免费，不消耗 Credits。未知模型自动使用默认费率。

## 安装

### 从 Releases 安装（推荐）

```bash
code --install-extension token-viewer-x.x.x.vsix
```

或手动：
1. 从 [Releases](https://github.com/Bynlk/Token-Viewer/releases) 下载最新的 `.vsix` 文件
2. VSCode 中按 `Ctrl+Shift+P`，输入 `Extensions: Install from VSIX...`
3. 选择下载的 `.vsix` 文件

### 从源码构建

```bash
git clone https://github.com/Bynlk/Token-Viewer.git
cd Token-Viewer
npm install
npm run compile
npx vsce package
```

## 配置

### 快速配置 Cookie

1. 按 `Ctrl+Shift+P`，输入 `Token Viewer: 配置 Cookie`
2. 粘贴你的 Cookie，完成

### 方式一：浏览器自动获取（推荐）

1. 按 `Ctrl+Shift+P`，输入 `Token Viewer: 浏览器自动获取 Cookie`
2. 浏览器会自动打开小米平台登录页面
3. 登录小米账号后，点击「我已登录」按钮
4. 插件自动提取并保存 Cookie

> 需要安装 puppeteer-core：`npm install puppeteer-core`
> 支持 Chrome 和 Edge 浏览器

### 方式二：代理采集

1. 按 `Ctrl+Shift+P`，输入 `Token Viewer: 启动代理`
2. 浏览器自动通过代理打开小米平台
3. 登录后插件自动从 HTTPS 请求中提取 Cookie

### 方式三：手动获取 Cookie

1. 浏览器打开 https://platform.xiaomimimo.com/console/plan-manage 并登录
2. 按 `F12` 打开开发者工具 → **Network** 标签页
3. 刷新页面，在请求列表中找到任意一个请求
4. 复制请求 Headers 中的 **Cookie** 字段值
5. 按 `Ctrl+Shift+P`，输入 `Token Viewer: 配置 Cookie`，粘贴

## 配置项

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `tokenViewer.headers` | 请求头，只需填 Cookie | `{}` |
| `tokenViewer.refreshInterval` | 刷新间隔（秒） | `10` |
| `tokenViewer.alertThreshold` | 告警阈值（Credits） | `100000000` |
| `tokenViewer.proxyPort` | MITM 代理端口 | `9527` |
| `tokenViewer.monthlyBudget` | 月度预算上限（0=不启用） | `0` |
| `tokenViewer.budgetAlertLevels` | 预算告警百分比阈值 | `[50, 80, 100]` |
| `tokenViewer.teamSharePath` | 团队共享目录路径 | `""` |
| `tokenViewer.username` | 团队共享中的用户名 | `""` |

## 命令

| 命令 | 说明 |
|------|------|
| `Token Viewer: 刷新 Credits` | 立即刷新 |
| `Token Viewer: 配置 Cookie` | 打开 Cookie 配置向导 |
| `Token Viewer: 浏览器自动获取 Cookie` | 启动浏览器自动登录并获取 Cookie |
| `Token Viewer: 启动代理` | 启动 MITM 代理服务器 |
| `Token Viewer: 停止代理` | 停止代理服务器 |
| `Token Viewer: 代理状态` | 查看代理运行状态 |
| `Token Viewer: 打开用量面板` | 打开可视化 Dashboard |
| `Token Viewer: 添加账号` | 添加新的小米账号 |
| `Token Viewer: 切换账号` | 切换当前活跃账号 |
| `Token Viewer: 删除账号` | 删除已有账号 |
| `Token Viewer: 查看今日报告` | 查看当天各模型用量详情 |
| `Token Viewer: 打开充值页面` | 打开小米平台充值页面 |
| `Token Viewer: 复制用量摘要` | 复制用量报告到剪贴板 |
| `Token Viewer: 暂停告警 1 小时` | 临时暂停告警通知 |
| `Token Viewer: 菜单` | 打开功能菜单 |
| `Token Viewer: 设置` | 打开扩展设置 |
| `Token Viewer: 选择显示板块` | 自定义 Tooltip 显示板块 |
| `Token Viewer: 选择显示模型` | 筛选显示的模型 |

## 架构

```
src/
├── extension.ts        # 入口，命令注册，生命周期
├── api.ts              # API 调用（精简版，315 行）
├── config.ts           # 配置管理 + tooltip 类型定义
├── formatter.ts        # Tooltip 格式化
├── budget.ts           # 预算告警
├── prediction.ts       # 消耗预测
├── dashboard.ts        # Dashboard WebView 管理
├── dashboard-html.ts   # Dashboard HTML 模板
├── http.ts             # HTTP 客户端（含指数退避重试）
├── storage.ts          # 本地数据存储
├── cookie-storage.ts   # Cookie 加密存储
├── proxy.ts            # MITM 代理服务器
├── certs.ts            # X.509 证书生成（纯手写）
├── browser.ts          # 浏览器自动化
├── types.ts            # 类型定义 + MODEL_RATES
├── utils.ts            # 工具函数
└── test/               # 测试套件（192 个测试）
    ├── config.test.ts
    ├── formatter.test.ts
    ├── budget.test.ts
    ├── prediction.test.ts
    ├── storage.test.ts
    ├── dashboard-html.test.ts
    ├── utils.test.ts
    ├── utils-extended.test.ts
    ├── types.test.ts
    ├── http.test.ts
    ├── certs.test.ts
    └── dashboard.test.ts
```

## 常见问题

**状态栏显示 Error？**
按 `Ctrl+Shift+U` 打开输出面板，选择 **Token Viewer** 查看日志。通常是 Cookie 过期导致。

**Cookie 过期了？**
插件会自动检测并弹出提示。也可以运行 `Token Viewer: 浏览器自动获取 Cookie` 重新获取。

**今日用量没有显示？**
确认 Cookie 有效且包含 `api-platform_ph` 参数。小米 API 使用 UTC 时间，数据有 5 分钟以内延迟，每日数据在次日 7:00 UTC 完成校对。

**浏览器自动获取 Cookie 失败？**
确保已安装 puppeteer-core：`npm install puppeteer-core`。如果 Chrome/Edge 未安装在默认路径，请手动配置 Cookie。

**Dashboard 图表不显示？**
Chart.js 需要网络下载。如果下载失败，请检查网络连接后重新打开面板。

## 开发

```bash
npm install          # 安装依赖
npm run compile      # 编译
npm run watch        # 监听模式
npm test             # 运行测试（192 个测试）
npx vsce package    # 打包 .vsix
```

### 发版

```bash
./scripts/bump-version.sh minor   # 更新版本号
# 编辑 CHANGELOG.md
git add -A && git commit -m 'release: vx.x.x'
git tag vx.x.x
git push origin main --tags       # 自动触发 CI + Release
```

## License

[MIT](LICENSE)
