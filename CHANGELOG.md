# Changelog

All notable changes to Token Viewer will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/lang/zh-CN/).

## [Unreleased]

## [3.1.0] - 2026-06-02

### ✨ 新功能
- **Cookie 加密存储** — 使用 VS Code SecretStorage 加密保存 Cookie，启动时自动迁移明文数据
- **HTTP 重试机制** — httpGet/httpPost 自动重试 3 次（指数退避 1s/2s/4s），应对网络抖动
- **MODEL_RATES fallback** — 未知模型自动使用默认费率，不再返回 0

### ♻️ 重构
- **拆分 api.ts** — 659 行上帝模块拆分为 5 个职责单一的模块：
  - `config.ts` — 配置管理 + tooltip 类型定义
  - `formatter.ts` — Tooltip 格式化（今日用量/消耗比例/缓存命中率）
  - `budget.ts` — 预算告警逻辑
  - `prediction.ts` — 消耗预测算法
  - `api.ts` — 仅保留 API 调用核心逻辑（315 行）
- **Dashboard HTML 提取** — 350 行内联 HTML/CSS/JS 提取为 `dashboard-html.ts`
- **loadHistory 优化** — 用 `readdirSync` 替代 999 次循环文件检查

### 🧪 测试
- **192 个测试，36 个测试套件**，覆盖所有核心模块
- 新增 8 个测试文件：config、formatter、budget、prediction、storage、dashboard-html、utils-extended、types
- 扩展 vscode-mock：支持 `window`、`globalState`、`secrets`、`createMockContext()`

### 🔧 CI/CD
- **跨平台测试矩阵** — Ubuntu/Windows/macOS × Node 18/20
- **自动 Release 工作流** — 推送 `v*` tag 时自动编译 VSIX + 生成 Release 文案

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
