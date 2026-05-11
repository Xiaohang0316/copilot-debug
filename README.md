# Copilot Debugger

监控和调试 GitHub Copilot Agent 的执行过程 — 追踪输入输出、上下文大小、提示词压缩和逐步执行。

## 功能特性

- **实时捕获 Copilot 交互** — 记录每个执行步骤的输入输出内容、token 用量和上下文窗口大小
- **`@debug` 聊天代理** — 在 VS Code Chat 中使用 `@debug 你的问题`，获取完整的 prompt、chat history、模型信息和流式响应
- **日志文件监控** — 被动监控 Copilot 扩展的磁盘日志，自动解析 API 请求/响应、token 统计和工具调用
- **压缩检测** — 自动检测上下文骤降（>30%），标记压缩事件并记录压缩比
- **可视化时间线** — 侧边栏逐步展示每个交互，支持按类型和方向区分
- **统计面板** — 实时显示 token 用量、峰值上下文大小、压缩事件次数和工具调用分布
- **导出/导入** — 导出完整会话为 JSON 用于离线分析，支持导入 JSON 和日志文件
- **中英文双语** — 根据 VS Code 语言设置自动切换界面语言

## 前置条件

- VS Code >= 1.95.0
- GitHub Copilot 扩展（已安装并登录）

## 安装

### 从 VSIX 文件安装

```bash
code --install-extension copilot-debugger-0.1.0.vsix
```

或在 VS Code 中：`Cmd+Shift+P` → `Extensions: Install from VSIX...` → 选择 `.vsix` 文件。

### 从源码安装

```bash
git clone <repo-url>
cd copilot-debugger
npm install
npm run compile
```

然后按 `F5` 启动扩展开发宿主窗口。

## 快速开始

1. 点击左侧活动栏的 **Copilot Debugger** 图标，打开侧边栏
2. 点击 Sessions 视图标题栏的 **录制按钮** `●` 开始捕获
3. 使用 Copilot 进行交互（推荐在 Chat 中使用 `@debug` 前缀获取最完整的数据）
4. 在 **Execution Steps** 视图中查看每个步骤的详情
5. 点击任意步骤打开 Webview 详情面板，查看完整的 token 统计、压缩信息和原始内容

## 三层捕获架构

| 层级 | 组件 | 数据完整度 | 是否需改变习惯 |
|------|------|-----------|--------------|
| **L1: `@debug` 代理** | Chat Participant | 最完整（完整 prompt + response + 模型信息） | 需要用 `@debug` 前缀 |
| **L2: 日志监控** | Log Watcher | token 计数 + tool call + 压缩事件 | 无需改变 |
| **L3: 编辑器监控** | Interceptor | 上下文变化 + 补全检测 | 无需改变 |

三层可同时工作，数据统一汇入内存中的 SessionStore。

## 命令速查

| 命令 | 快捷触发 |
|------|---------|
| `Copilot Debugger: Start Capture` | 状态栏 / Sessions 标题栏 `●` |
| `Copilot Debugger: Stop Capture` | 状态栏 / Sessions 标题栏 `■` |
| `Copilot Debugger: Start Log File Monitoring` | — |
| `Copilot Debugger: Stop Log File Monitoring` | — |
| `Copilot Debugger: Clear All Sessions` | Sessions 标题栏 `✕` |
| `Copilot Debugger: Export Session as JSON` | — |
| `Copilot Debugger: Open Debug Chat` | `Cmd+Shift+D` / `Ctrl+Shift+D` |
| `Copilot Debugger: Toggle Global Intercept Mode` | — |

## 已知限制

- Token 计数为估算值（~10% 误差），未集成精确 tokenizer
- `@debug` 模式需要在 Chat 中使用特定前缀，直接使用 Copilot Chat 无法拦截内部 API
- 日志监控依赖 Copilot 扩展的日志格式，可能随版本更新变化
- 会话数据存储在内存中，重启 VS Code 后丢失（可手动导出 JSON）

## 文档

- [设计文档](docs/DESIGN.md) — 系统架构、数据模型、技术决策
- [使用指南](docs/USAGE.md) — 详细的功能说明和使用场景
- [开发文档](docs/DEVELOPMENT.md) — 环境搭建、模块详解、扩展指南

## License

MIT
