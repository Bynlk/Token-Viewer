<p align="center">
  <img src="https://img.shields.io/badge/VSCode-Extension-blue?style=for-the-badge&logo=visual-studio-code" alt="VSCode Extension">
  <img src="https://img.shields.io/badge/TypeScript-5.3-blue?style=for-the-badge&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=for-the-badge" alt="Platform">
</p>

<h1 align="center">🤖 Token Viewer</h1>

<p align="center">
  在 VSCode 底部状态栏实时显示 AI 平台的剩余 Token 数量<br>
  支持 OpenAI、Claude、小米 MiMo、DeepSeek、通义千问等所有 AI 平台
</p>

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 🤖 **状态栏显示** | 在状态栏右侧实时显示剩余 Token 数量 |
| 🔄 **自动刷新** | 按设定间隔自动获取最新 Token 数量 |
| ⚠️ **告警通知** | Token 不足时弹出警告消息，状态栏变色提示 |
| 🖱️ **点击刷新** | 点击状态栏项立即刷新 |
| 📋 **命令面板** | 通过 `Ctrl+Shift+P` 调用刷新或配置命令 |
| 💾 **持久化存储** | 上次获取的 Token 数量跨会话保留 |
| 🔧 **交互式配置** | 通过输入框逐步引导配置，无需手动编辑 JSON |
| 🧮 **灵活解析** | 支持简单路径、数组索引、减法表达式 |
| 📋 **详细日志** | 错误信息输出到 OutputChannel，便于排查 |

## 📦 安装

### 方式一：从 .vsix 文件安装（推荐）

1. 从 [Releases](https://github.com/bynlk/token-viewer/releases) 下载最新的 `.vsix` 文件
2. 在 VSCode 中按 `Ctrl+Shift+P`
3. 输入 `Extensions: Install from VSIX...`
4. 选择下载的 `.vsix` 文件

### 方式二：从源码构建

```bash
git clone https://github.com/bynlk/token-viewer.git
cd token-viewer
npm install
npm run compile
vsce package
```

然后按方式一安装生成的 `.vsix` 文件。

## 🚀 快速开始

### 第一步：打开配置向导

按 `Ctrl+Shift+P`，输入 `Token Viewer: 配置设置`

### 第二步：获取 API 地址和请求头

> 以任意 AI 平台为例（OpenAI、Claude、小米 MiMo、DeepSeek 等均可）

1. 用浏览器登录你的 AI 平台账号
2. 按 `F12` 打开开发者工具
3. 点击 **Network** 标签页
4. 在页面上执行一次查看 Token 余额的操作
5. 在 Network 列表中找到返回 Token 数据的请求

**获取 API 地址**：
- 点击该请求 → Headers → 复制 **Request URL**

**获取请求头**：
- 在 Headers → Request Headers 中找到 `Cookie` 或 `Authorization`
- 复制完整的值

**确定 JSON 路径**：
- 点击该请求 → Response → 查看返回的 JSON 结构
- 找到 Token 数量所在的字段

### 第三步：填入配置

在配置向导中依次填入：

| 步骤 | 配置项 | 示例 |
|------|--------|------|
| 1 | API 地址 | `https://api.example.com/tokens/balance` |
| 2 | 请求头 | `{"Cookie": "session=abc123"}` |
| 3 | JSON 路径 | `data.remaining` 或 `data.usage.items[0].limit - data.usage.items[0].used` |
| 4 | 刷新间隔 | `60`（秒） |
| 5 | 告警阈值 | `100` |

## 🧮 JSON 路径语法

插件支持三种路径格式：

### 1. 简单路径

```
data.remaining
```

适用于返回结构简单的 API：
```json
{ "data": { "remaining": 8200 } }
```

### 2. 数组索引

```
data.usage.items[0].limit
```

适用于返回数组的 API：
```json
{ "data": { "usage": { "items": [{ "limit": 700000000 }] } } }
```

### 3. 减法表达式

```
data.usage.items[0].limit - data.usage.items[0].used
```

适用于需要计算剩余量的 API（总量 - 已用 = 剩余）：
```json
{ "data": { "usage": { "items": [{ "limit": 700000000, "used": 133695233 }] } } }
// 结果: 700000000 - 133695233 = 566304767
```

## 📋 命令列表

| 命令 | 说明 |
|------|------|
| `Token Viewer: 配置设置` | 打开交互式配置向导 |
| `Token Viewer: 刷新 Token 数量` | 立即执行一次刷新 |

## ⚙️ 配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `tokenViewer.apiUrl` | string | `""` | API 地址 |
| `tokenViewer.headers` | object | `{}` | 请求头 JSON 对象 |
| `tokenViewer.jsonPath` | string | `""` | JSON 解析路径 |
| `tokenViewer.refreshInterval` | number | `60` | 刷新间隔（秒） |
| `tokenViewer.alertThreshold` | number | `100` | 告警阈值 |

## 🌐 支持的平台

本插件适用于任何通过 HTTP API 返回 Token/配额信息的平台，包括但不限于：

| 平台 | API 类型 | 说明 |
|------|----------|------|
| OpenAI | API Key | 通过 `/dashboard/billing/credit_grants` 查询 |
| Claude | Cookie | 通过浏览器获取 Cookie |
| 小米 MiMo | Cookie | 通过浏览器获取 Cookie |
| DeepSeek | API Key | 通过 API 查询余额 |
| 通义千问 | API Key | 通过 API 查询配额 |
| 其他平台 | 任意 | 只要能通过 HTTP GET 获取 JSON 数据即可 |

## 🔍 常见问题

### Cookie 过期了怎么办？

Cookie 通常有有效期，过期后需要重新从浏览器获取。更新 `tokenViewer.headers` 中的 Cookie 值即可。

### 状态栏显示 Error 怎么办？

1. 按 `Ctrl+Shift+U` 打开输出面板
2. 选择 **Token Viewer** 查看详细错误日志
3. 常见原因：
   - Cookie 过期
   - API 地址错误
   - JSON 路径写错

### 如何查看详细日志？

按 `Ctrl+Shift+U` 打开输出面板，在下拉列表中选择 **Token Viewer**。

## 🛠️ 开发

```bash
# 安装依赖
npm install

# 编译
npm run compile

# 监听模式（开发时使用）
npm run watch

# 打包
vsce package
```

## 📄 License

[MIT](LICENSE)

## 🤝 Contributing

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建你的分支 (`git checkout -b feature/amazing-feature`)
3. 提交你的更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打开一个 Pull Request
