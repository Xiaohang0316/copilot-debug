# Copilot Debugger - 设计文档

## 1. 项目概述

**Copilot Debugger** 是一个 VS Code 扩展，用于实时监控和调试 GitHub Copilot Agent 的执行过程。它能够记录 Copilot 的输入输出内容、追踪上下文窗口大小变化、检测提示词压缩(compaction)事件，并以可视化时间线的方式呈现每个执行步骤，帮助开发者理解和优化 Copilot 的行为。

### 1.1 解决的问题

| 痛点 | 解决方案 |
|------|----------|
| Copilot Agent 执行过程是黑盒，无法观测内部步骤 | 侧边栏时间线逐步展示每个交互 |
| 不知道上下文窗口消耗了多少 token | 实时追踪并显示 token 用量与上下文大小 |
| 不清楚何时发生了提示词压缩/截断 | 自动检测上下文骤降，标记压缩事件并记录压缩比 |
| 难以复现和分析 Copilot 的特定行为 | 导出完整会话为 JSON，支持离线分析和导入 |

### 1.2 目标用户

- 使用 GitHub Copilot Agent Mode 的开发者
- 需要调试 Copilot 提示词工程的团队
- 对 AI 辅助编程效率进行分析的研究者

---

## 2. 系统架构

```
┌──────────────────────────────────────────────────────────────┐
│                     VS Code Extension Host                    │
│                                                               │
│  ┌─────────────────────┐                                      │
│  │ DebugChatParticipant │──┐  (@debug 代理: 完整 prompt 捕获) │
│  │ - Chat History       │  │                                  │
│  │ - User Prompt        │  │                                  │
│  │ - LM Request/Response│  │                                  │
│  └─────────────────────┘  │                                  │
│                            │                                  │
│  ┌─────────────────────┐  │  ┌─────────────────────────────┐ │
│  │ CopilotLogWatcher   │──┼─▶│      SessionStore            │ │
│  │ - File System Watch  │  │  │                             │ │
│  │ - Log Line Parsing   │  │  │ - sessions: Map<id, Session>│ │
│  │ - Token Usage Extract│  │  │ - activeSessionId           │ │
│  └─────────────────────┘  │  │ - EventEmitter (onChange)    │ │
│                            │  │                             │ │
│  ┌─────────────────────┐  │  │ + createSession()           │ │
│  │ CopilotInterceptor  │──┘  │ + addStep()                 │ │
│  │ - LM API Monitor    │     │ + getSessionStats()         │ │
│  │ - Editor Monitor     │     │ + exportSession()           │ │
│  │ - Document Monitor   │     └────────────┬────────────────┘ │
│  │ - Selection Monitor  │                  │ onDidChange       │
│  └─────────────────────┘   ┌───────────────┼───────────────┐  │
│                             ▼               ▼               ▼  │
│                    ┌──────────────┐ ┌─────────────┐ ┌────────┐│
│                    │SessionTreeView│ │StepTreeView │ │StatsTree││
│                    │  (Sessions)  │ │  (Steps)    │ │(Stats) ││
│                    └──────────────┘ └──────┬──────┘ └────────┘│
│                                            │ click             │
│                                            ▼                   │
│                                   ┌─────────────────┐          │
│                                   │  DetailPanel     │          │
│                                   │  (Webview)       │          │
│                                   └─────────────────┘          │
└──────────────────────────────────────────────────────────────┘
```

### 2.1 三层捕获架构

扩展采用三层数据采集方案，解决 GitHub Copilot 不暴露内部 API 的问题：

| 层级 | 组件 | 捕获方式 | 捕获内容 | 数据完整度 |
|------|------|---------|---------|-----------|
| **L1: Chat 代理** | `DebugChatParticipant` | 用户通过 `@debug` 发起对话，代理转发给 Copilot 模型 | **完整的 input prompt、chat history、model info、streamed response、token 用量** | 最完整 |
| **L2: 日志监控** | `CopilotLogWatcher` | 用 `fs.watch` 监控 Copilot 扩展写入磁盘的日志文件 | **API 请求/响应、prompt_tokens/completion_tokens、tool_call、压缩事件** | 被动采集 |
| **L3: 编辑器监控** | `CopilotInterceptor` | 通过 VS Code API 监听编辑器事件 | 上下文文件变化、内联补全检测、文本选择、终端开启 | 间接推断 |

### 2.2 核心组件

#### DebugChatParticipant (`src/chatParticipant.ts`)

注册 `@debug` Chat Participant，是获取完整 input/output prompt 的核心方案。

**工作流程：**

```
用户在 Chat 中输入 "@debug 你的问题"
  │
  ├── 1. 记录 chat history（所有历史对话轮次）
  ├── 2. 记录当前 user prompt + 文件引用 (#file)
  ├── 3. 通过 vscode.lm.selectChatModels() 选择 Copilot 模型
  ├── 4. 记录模型信息（id, family, version, maxInputTokens）
  ├── 5. 记录发送给模型的完整消息数组（all messages）
  ├── 6. 调用 model.sendRequest() 并流式转发响应
  ├── 7. 记录完整的 output response + 耗时
  └── 8. 在聊天底部显示 debug 摘要（token 数、耗时、模型）
```

**捕获的数据项：**

| 数据 | 说明 |
|------|------|
| Chat History | 所有历史对话轮次，包含 user 和 assistant 的完整文本 |
| User Prompt | 当前用户输入的完整文本 |
| File References | 用户通过 `#file` 引用的文件路径和位置 |
| Model Info | 模型 ID、系列、版本、最大输入 token 数 |
| Full LM Request | 发送给模型的完整消息数组（含历史） |
| Streamed Response | 模型返回的完整响应文本 |
| Timing | 请求耗时（毫秒） |
| Token Estimates | 输入/输出的 token 估算 |

#### CopilotLogWatcher (`src/logWatcher.ts`)

被动监控 Copilot 扩展的日志文件，无需改变用户工作习惯。

**监控路径：**

| 平台 | 路径 |
|------|------|
| macOS | `~/.vscode/extensions/github.copilot-chat-*` |
| macOS | `~/Library/Application Support/Code/logs/` |
| Linux | `~/.vscode/extensions/github.copilot-chat-*` |
| Linux | `~/.config/Code/logs/` |
| Windows | `%USERPROFILE%\.vscode\extensions\github.copilot-*` |
| Windows | `%APPDATA%\Code\logs\` |

**日志解析模式（15 种匹配规则）：**

| 匹配模式 | 提取类型 | 额外提取字段 |
|----------|---------|-------------|
| `request to <endpoint>.*model=<model>` | user_prompt | endpoint, model |
| `sending request` / `"role":"user"` | user_prompt | — |
| `"role":"system"` | system_prompt | — |
| `response.*status=<code>` | assistant_response | statusCode |
| `prompt.tokens=<n>` | context_injection | promptTokens |
| `completion.tokens=<n>` | assistant_response | completionTokens |
| `total.tokens=<n>` | context_injection | totalTokens |
| `tool_call.*<name>` / `function_call.*name:<name>` | tool_call | toolName |
| `tool_result` / `function_result` | tool_result | — |
| `compaction` / `compress` / `truncat` | compression | — |
| `"content":"<text>"` | unknown | contentPreview |
| `stream.*chunk` / `delta.*content` | assistant_response | — |

**增量读取机制：** 记录每个文件的读取偏移量，只解析新增内容，避免重复处理。

#### CopilotInterceptor (`src/interceptor.ts`)

编辑器事件监控层，通过以下渠道捕获间接信号：

| 监控渠道 | 捕获内容 | VS Code API |
|----------|---------|-------------|
| Language Model API | 模型变更事件 | `vscode.lm.onDidChangeChatModels` |
| Chat Participant API | 聊天操作事件（proposed API） | `vscode.chat.onDidPerformAction` |
| Document Changes | 大段代码插入（>50字符），疑似 Copilot 补全 | `workspace.onDidChangeTextDocument` |
| Visible Editors | 可见编辑器变化 = 上下文文件变化 | `window.onDidChangeVisibleTextEditors` |
| Text Selection | 用户选中文本 = 提供给 Copilot 的上下文 | `window.onDidChangeTextEditorSelection` |
| Diagnostics | 诊断信息变更（Copilot 可能触发） | `languages.onDidChangeDiagnostics` |
| Terminal | 终端开启（Copilot CLI 交互） | `window.onDidOpenTerminal` |

**压缩检测算法：**

```
当新的上下文大小 < 上一次上下文大小 * 0.7 时，判定为压缩事件
记录：原始大小、压缩后大小、压缩比、检测方法
```

**Token 估算算法：**

```
英文/代码字符：~4 字符 = 1 token
CJK 字符（中日韩）：~2 字符 = 1 token
estimatedTokens = ceil(otherChars / 4 + cjkChars / 2)
```

#### SessionStore (`src/sessionStore.ts`)

内存中的会话数据存储，职责：

- 管理多个捕获会话的生命周期（创建 / 结束 / 清除）
- 存储每个会话的步骤序列
- 累计 token 统计
- 计算会话级统计指标（峰值上下文、压缩次数、工具调用分布等）
- 通过 `EventEmitter` 通知视图层刷新

#### DetailPanel (`src/views/detailPanel.ts`)

Webview 面板，提供两种视图模式：

1. **步骤详情** — 展示单个步骤的 token 数、上下文大小、压缩信息、元数据、原始内容
2. **会话概览** — 展示汇总统计、上下文大小时间线图（Canvas 绘制）、工具调用分布柱状图

---

## 3. 数据模型

### 3.1 核心类型定义

```typescript
// 捕获会话
interface CopilotSession {
  id: string;                // session_<timestamp>_<random>
  startTime: number;         // Unix 毫秒时间戳
  endTime?: number;
  steps: CopilotStep[];      // 有序步骤序列
  totalInputTokens: number;  // 累计输入 token
  totalOutputTokens: number; // 累计输出 token
  label: string;             // 显示名称
}

// 执行步骤
interface CopilotStep {
  id: string;                // step_<counter>
  sessionId: string;
  timestamp: number;
  type: StepType;            // 步骤类型（见下方枚举）
  direction: 'input' | 'output';
  content: string;           // 原始内容
  tokenCount: number;        // 本步骤 token 数
  contextSize: number;       // 当前上下文窗口总大小
  compressionInfo?: CompressionInfo;
  metadata: StepMetadata;
  duration?: number;
}

// 步骤类型
type StepType =
  | 'user_prompt'        // 用户输入的提示
  | 'system_prompt'      // 系统提示词
  | 'assistant_response' // 模型响应/代码补全
  | 'tool_call'          // 工具调用（读文件、运行命令等）
  | 'tool_result'        // 工具返回结果
  | 'context_injection'  // 上下文注入（文件内容、选中文本等）
  | 'compression'        // 提示词压缩/截断事件
  | 'unknown';

// 压缩信息
interface CompressionInfo {
  originalSize: number;   // 压缩前 token 数
  compressedSize: number; // 压缩后 token 数
  ratio: number;          // 压缩比 (0-1)
  method: string;         // 检测方法标识
}
```

### 3.2 导出 JSON 格式

导出时会附加统计信息：

```json
{
  "id": "session_1715..._abc123",
  "label": "Session 1",
  "startTime": 1715000000000,
  "endTime": 1715000300000,
  "steps": [ ... ],
  "totalInputTokens": 15230,
  "totalOutputTokens": 8420,
  "stats": {
    "totalSteps": 47,
    "peakContextSize": 32000,
    "compressionEvents": 3,
    "avgCompressionRatio": 0.45,
    "duration": 300000,
    "toolCalls": [
      { "name": "readFile", "count": 12 },
      { "name": "runCommand", "count": 5 }
    ]
  }
}
```

---

## 4. UI 设计

### 4.1 活动栏 (Activity Bar)

在 VS Code 左侧活动栏注册独立图标入口，包含三个折叠视图。

### 4.2 Sessions 视图

```
SESSIONS                          [● Start] [✕ Clear]
─────────────────────────────────────────────
● Session 1       14:30:05 | 23 steps | 12.5K tokens
  Session 2       14:15:22 | 47 steps | 31.2K tokens
  Session 3       13:50:00 | 12 steps | 5.1K tokens
```

- 红色 `●` 图标表示正在录制的活跃会话
- 灰色 `⏱` 图标表示已结束的历史会话
- 点击选中后，Steps 和 Statistics 视图自动联动

### 4.3 Execution Steps 视图

```
EXECUTION STEPS                          [↻ Refresh]
─────────────────────────────────────────────
💬 #1 User Prompt        14:30:06 → 125 tok | ctx: 2000
⚙️ #2 System Prompt      14:30:06 → 800 tok | ctx: 2800
🤖 #3 Assistant Response  14:30:08 ← 350 tok | ctx: 2800
🔧 #4 Tool Call           14:30:09 ← 50 tok  | ctx: 2800
📥 #5 Tool Result         14:30:10 → 1200 tok | ctx: 4000
🤖 #6 Assistant Response  14:30:12 ← 500 tok | ctx: 4000
📄 #7 Context Injection   14:30:15 → 8000 tok | ctx: 12000
🔻 #8 Compression         14:30:16 → 4800 tok | ctx: 4800  ⚠️
```

- `→` 表示输入方向，`←` 表示输出方向
- 每个步骤类型有独立的彩色图标
- 压缩事件用红色高亮
- 点击任意步骤打开 Webview 详情面板

### 4.4 Statistics 视图

```
STATISTICS
─────────────────────────────────────────────
▸ Token Usage
    → Input Tokens         15.2K
    ← Output Tokens         8.4K
    # Total Tokens          23.6K
▸ Context
    📊 Peak Context Size    32K tokens
    🔻 Compression Events   3
    📐 Avg Compression Ratio 45.0%
▸ Execution
    📋 Total Steps          47
    🕐 Duration             5m 0s
▸ Tool Calls
    🔧 readFile             x12
    🔧 runCommand           x5
    🔧 searchFiles          x3
```

### 4.5 Webview 详情面板

点击步骤后在编辑器侧边打开，包含：

1. **标题区** — 步骤类型 + 方向 badge (input/output)
2. **指标卡片** — Token Count / Context Size / Timestamp / Step ID
3. **压缩卡片**（仅压缩步骤） — 原始大小 / 压缩后大小 / 压缩比 / 可视化进度条
4. **元数据表格** — 模型名称 / 工具名称 / 文件路径 / 行范围等
5. **原始内容区** — 可滚动的代码块展示完整内容

### 4.6 状态栏

```
状态栏右侧:
  未录制: [🐛 Copilot Debugger]          点击开始
  录制中: [● 23 steps | 12.5K tok]       点击停止（橙色警告背景）
```

---

## 5. 命令注册

| 命令 ID | 标题 | 触发方式 |
|---------|------|---------|
| `copilotDebugger.startCapture` | Start Capture | 命令面板 / Sessions 视图标题栏 / 状态栏 |
| `copilotDebugger.stopCapture` | Stop Capture | 命令面板 / Sessions 视图标题栏 / 状态栏 |
| `copilotDebugger.clearSessions` | Clear All Sessions | 命令面板 / Sessions 视图标题栏 |
| `copilotDebugger.exportSession` | Export Session as JSON | 命令面板 |
| `copilotDebugger.importLog` | Import Log | 命令面板 |
| `copilotDebugger.startLogWatch` | Start Log File Monitoring | 命令面板 |
| `copilotDebugger.stopLogWatch` | Stop Log File Monitoring | 命令面板 |
| `copilotDebugger.showDetails` | Show Step Details | 点击步骤触发 |
| `copilotDebugger.selectSession` | Select Session | 点击会话触发 |
| `copilotDebugger.refreshViews` | Refresh | Steps 视图标题栏 |

---

## 6. 技术决策

### 6.1 为什么用内存存储而非持久化

- 捕获数据量大（每步包含完整内容），持久化到磁盘会影响性能
- 会话数据是临时调试用途，不需要跨重启保持
- 需要持久化时可通过 Export 命令手动导出 JSON

### 6.2 为什么用 Token 估算而非精确计算

- 精确的 tokenizer（如 tiktoken）需要额外 WASM 依赖，增加包体积
- 估算精度（~10% 误差）对调试场景足够
- 未来可作为可选依赖引入精确 tokenizer

### 6.3 为什么选择 TreeView + Webview 的混合方案

- TreeView 适合展示列表/层级数据，渲染性能好，原生 VS Code 风格
- Webview 适合复杂的详情展示（图表、格式化内容、交互），灵活度高
- 两者结合：列表用 TreeView，详情用 Webview

### 6.4 压缩检测阈值 (0.7) 的选择

- 阈值 0.7 表示上下文减少超过 30% 才判定为压缩
- 过低会产生太多误报（正常编辑器切换也会改变上下文大小）
- 过高可能漏掉轻度压缩事件
- 0.7 是经验值，可根据实际使用调整

---

## 7. 文件结构

```
context-viewer/
├── package.json              # 扩展清单：命令、视图、菜单、chatParticipants
├── tsconfig.json             # TypeScript 编译配置
├── .vscodeignore             # 打包排除规则
├── .gitignore
├── resources/
│   └── icon.svg              # 活动栏图标
├── src/
│   ├── extension.ts          # 扩展入口：激活、注册命令、组装组件
│   ├── types.ts              # 核心类型定义
│   ├── sessionStore.ts       # 会话数据存储与统计计算
│   ├── interceptor.ts        # L3: 编辑器事件拦截器
│   ├── chatParticipant.ts    # L1: @debug Chat Participant 代理
│   ├── logWatcher.ts         # L2: Copilot 日志文件监控
│   └── views/
│       ├── sessionTreeProvider.ts  # Sessions 视图
│       ├── stepTreeProvider.ts     # Execution Steps 视图
│       ├── statsTreeProvider.ts    # Statistics 视图
│       └── detailPanel.ts         # Webview 详情面板
├── out/                      # 编译输出（.js + .map）
└── docs/
    ├── DESIGN.md             # 本文档
    ├── USAGE.md              # 使用指南
    └── DEVELOPMENT.md        # 开发文档
```

---

## 8. 未来扩展方向

| 方向 | 描述 |
|------|------|
| 精确 Token 计数 | 集成 tiktoken WASM，提供精确的 token 统计 |
| 网络层拦截 | 通过代理或 HTTP hook 直接拦截 Copilot API 请求/响应 |
| 会话持久化 | 可选的 SQLite 存储，支持跨重启的历史查询 |
| 会话对比 | 并排对比两个会话的执行路径和 token 消耗差异 |
| 性能火焰图 | 用火焰图展示每步的 token 消耗占比 |
| 团队共享 | 导出为标准格式，团队成员间共享分析结果 |
| @debug 增强 | 支持 `@debug /explain`、`@debug /fix` 等子命令，覆盖更多 Copilot Chat 场景 |
