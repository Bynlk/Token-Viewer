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

1. 从 [Releases](https://github.com/Bynlk/Token-Viewer/releases) 下载最新的 `.vsix` 文件
2. 在 VSCode 中按 `Ctrl+Shift+P`
3. 输入 `Extensions: Install from VSIX...`
4. 选择下载的 `.vsix` 文件

### 方式二：从源码构建

```bash
git clone https://github.com/Bynlk/Token-Viewer.git
cd Token-Viewer
npm install
npm run compile
vsce package
```

然后按方式一安装生成的 `.vsix` 文件。

---

## 🚀 配置教程（超详细版）

> **如果你不会配置，可以把你的浏览器开发者工具截图发给 AI（如 ChatGPT、Claude、豆包等），让 AI 帮你填写配置。**

### 第一步：打开插件配置向导

1. 在 VSCode 中按 `Ctrl+Shift+P`（Mac 用户按 `Cmd+Shift+P`）
2. 在弹出的输入框中输入：`Token Viewer: 配置设置`
3. 按回车键，插件会弹出第一个配置框

### 第二步：获取 API 地址

> API 地址就是浏览器在查看 Token 余额时，向服务器发送请求的网址。

**操作步骤：**

1. 打开浏览器（Chrome 或 Edge），登录你的 AI 平台账号
2. 按键盘上的 `F12` 键，屏幕右侧或底部会弹出一个开发者工具面板
3. 点击开发者工具面板顶部的 **「Network」**（网络）标签页
4. **确保左上角的录制按钮是红色的**（表示正在录制网络请求）
5. 在 AI 平台页面上，**执行一次查看 Token 余额的操作**（比如刷新页面、点击「查看余额」按钮等）
6. 此时 Network 面板中会出现很多请求条目
7. 点击 **「Fetch/XHR」** 筛选按钮（只显示 API 请求）
8. 逐个点击请求条目，在右侧的 **「Preview」**（预览）标签页中查看返回数据
9. **找到那个返回数据中包含 Token 数量的请求**（比如有 `remaining`、`balance`、`quota`、`limit`、`used` 等字段）
10. 点击该请求，在右侧的 **「Headers」** 标签页中找到 **「Request URL」**
11. **复制这个完整的 URL 地址**
12. 粘贴到插件配置的第 1 步「API 地址」输入框中

**示例：**
```
https://platform.xiaomimimo.com/api/v1/tokenPlan/usage
```

### 第三步：获取请求头（Cookie / Authorization）

> 请求头是告诉服务器"我是谁"的认证信息。没有它，服务器不会返回你的数据。

**操作步骤：**

1. 仍然在刚才找到的那个请求上
2. 在右侧的 **「Headers」** 标签页中，向下滚动找到 **「Request Headers」**（请求头）区域
3. 你需要关注以下字段（**有哪个就复制哪个**）：

| 字段名 | 长什么样 | 说明 |
|--------|----------|------|
| `Cookie` | `session=abc123; user=tom; token=xxx` | 登录凭证，通常很长 |
| `Authorization` | `Bearer sk-xxxxx` 或 `Bearer eyJxxxx` | 认证令牌 |
| `X-API-Key` | `sk-xxxxx` | API 密钥 |

4. 复制你需要的字段名和值

**如何组装成 JSON 格式：**

假设你在 Headers 中看到了：
```
Cookie: session_id=abc123def456; user=tom
Authorization: Bearer sk-proj-xxxxx
```

那么在插件配置的第 2 步「请求头」中，你应该输入：
```json
{"Cookie": "session_id=abc123def456; user=tom", "Authorization": "Bearer sk-proj-xxxxx"}
```

**格式要点：**
- 整体用 `{}` 包裹
- 每个键值对用 `"键": "值"` 表示
- 多个键值对之间用逗号 `,` 分隔
- Cookie 的值通常是**整个字符串**（包含所有 `key=value` 和分号），不要拆开
- **注意引号**：必须是英文双引号 `"`，不能是中文引号 `""`

### 第四步：确定 JSON 解析路径

> JSON 解析路径告诉插件从服务器返回的数据中，哪个字段是 Token 数量。

**操作步骤：**

1. 回到 Network 面板，点击你找到的那个请求
2. 点击右侧的 **「Response」**（响应）标签页
3. 你会看到服务器返回的 JSON 数据
4. 找到包含 Token 数量的字段

**三种路径格式：**

**格式 1：简单路径**（适用于返回结构简单的 API）

如果响应是：
```json
{
  "data": {
    "remaining": 8200
  }
}
```
→ 填入：`data.remaining`

**格式 2：数组索引**（适用于返回数组的 API）

如果响应是：
```json
{
  "data": {
    "usage": {
      "items": [
        { "limit": 700000000 }
      ]
    }
  }
}
```
→ 填入：`data.usage.items[0].limit`

**格式 3：减法表达式**（适用于需要计算剩余量的 API）

如果响应是：
```json
{
  "data": {
    "usage": {
      "items": [
        { "limit": 700000000, "used": 133695233 }
      ]
    }
  }
}
```
→ 剩余量 = 总量 - 已用 = `limit` - `used`
→ 填入：`data.usage.items[0].limit - data.usage.items[0].used`

**怎么验证找对了？** 按照你写的路径，从外到内一层层展开 JSON，最终应该指向一个**数字**。

### 第五步：设置刷新间隔和告警阈值

- **刷新间隔**：每隔多少秒自动刷新一次。建议填 `60`（1 分钟）或 `300`（5 分钟）
- **告警阈值**：当剩余 Token 少于这个数字时，弹出警告。根据你的使用量设置，比如 `100`、`1000`、`1000000` 等

### 完整操作流程总结

```
1. 浏览器登录目标 AI 平台
2. 按 F12 打开开发者工具 → Network 标签页
3. 在平台上操作一次（触发 Token 查询）
4. 在 Network 中找到返回 Token 数量的那个请求
5. 从 Headers → Request URL 复制 API 地址 → 填入第 1 步
6. 从 Headers → Request Headers 复制 Cookie / Authorization → 填入第 2 步
7. 从 Response 查看 JSON 结构，确定解析路径 → 填入第 3 步
8. 填入刷新间隔和告警阈值 → 完成！
```

---

## 🤖 不会配置？让 AI 帮你！

如果你觉得上面的步骤太复杂，或者操作过程中遇到问题，**可以把以下信息发给 AI 助手（ChatGPT、Claude、豆包、Kimi 等），让 AI 帮你生成配置**：

1. **截图或复制**浏览器开发者工具 Network 面板中找到的请求
2. **复制** Request URL（API 地址）
3. **复制** Request Headers 中的 Cookie 或 Authorization
4. **复制** Response 中的 JSON 数据

**发给 AI 的提示词模板：**

```
我正在配置一个 VSCode 插件，需要从以下信息中提取配置：

API 地址：[粘贴 Request URL]
请求头：[粘贴 Cookie 或 Authorization 的值]
响应数据：[粘贴 Response 的 JSON]

请帮我：
1. 确认 API 地址是否正确
2. 生成请求头的 JSON 格式：{"Cookie": "..."}
3. 分析 JSON 结构，告诉我 Token 数量在哪个字段，生成解析路径
```

AI 会帮你分析数据并生成正确的配置值！

---

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

### JSON 路径怎么写？

看服务器返回的 JSON 数据，从最外层开始，用 `.` 连接每一层的字段名，直到到达包含数字的那个字段。如果中间有数组，用 `[索引]` 表示，如 `items[0]`。如果需要计算剩余量（总量 - 已用），用 ` - ` 连接两个路径。

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
