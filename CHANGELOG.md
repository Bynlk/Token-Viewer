# Changelog

All notable changes to Token Viewer will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/lang/zh-CN/).

## [Unreleased]

## [3.1.0] - 2026-06-02

### ✨ 新功能
- **Cookie 加密存储** — 使用 VS Code SecretStorage 加密保存 Cookie，启动时自动迁移明文数据
- **HTTP 自动重试** — httpGet/httpPost 指数退避重试 3 次（1s/2s/4s），网络抖动无需手动干预
- **未知模型 fallback** — 未注册的模型自动使用默认费率（input=100, output=200），不再返回 0

### ♻️ 重构
- **拆分 api.ts（659→315 行）** — 上帝模块拆分为 5 个职责单一的模块：
  - `config.ts` — 配置管理 + tooltip 板块/行类型定义
  - `formatter.ts` — Tooltip 格式化（今日用量/消耗比例/缓存命中率）
  - `budget.ts` — 预算告警逻辑
  - `prediction.ts` — 消耗预测算法（Dashboard + Tooltip 两套）
  - `api.ts` — 仅保留 API 调用核心逻辑
- **Dashboard HTML 提取** — 350 行内联 HTML/CSS/JS 提取为独立的 `dashboard-html.ts`
- **loadHistory 性能优化** — `readdirSync` 替代 999 次循环文件存在性检查

### 🧪 测试
- **192 个测试 · 36 个测试套件 · 覆盖全部核心模块**
- 新增 8 个测试文件：config / formatter / budget / prediction / storage / dashboard-html / utils-extended / types
- 扩展 vscode-mock：完整的 `window`、`globalState`、`secrets` 模拟 + `createMockContext()` 工厂函数
- 存储测试使用临时目录，测试后自动清理

### 🔧 CI/CD
- **跨平台测试矩阵** — Ubuntu / Windows / macOS × Node 18 / 20 / 22（9 个 job 全部通过）
- **自动 Release 工作流** — 推送 `v*` tag 时自动编译 VSIX + 从 conventional commits 生成 Release 文案
- **版本校验** — CI 自动检查 package.json 版本号是否与 tag 一致
- **跨平台测试运行器** — `scripts/run-tests.js` 解决 Windows PowerShell 不展开 glob 的问题
- **fail-fast: false** — 单个 job 失败不会取消其他矩阵 job

## [3.0.3] - 2026-05-29

### 🐛 修复
- 修复今日用量百分比公式
- 修复浏览器 Cookie 采集流程
- 优化 loadMonthlyUsage 重复调用

## [3.0.0] - 2026-05-28

### ✨ 新功能
- MITM 代理自动获取 Cookie
- 团队协作功能
- 自定义 tooltip 板块和行显示
- 多账户管理

## [2.0.0] - 2026-05-20

### ✨ 新功能
- WebView Dashboard（趋势图、消耗图、模型分布）
- 预算管理和告警
- 按模型用量报告

## [1.0.0] - 2026-05-15

### ✨ 新功能
- 状态栏实时显示 MiMo Credits
- 自动刷新（可配置间隔）
- 低余额告警
