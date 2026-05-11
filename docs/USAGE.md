# Context Viewer - 使用指南

## 1. 安装

### 从 VSIX 文件安装

```bash
code --install-extension context-viewer-0.1.3.vsix
```

或在 VS Code 中：
1. 打开命令面板 (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. 输入 `Extensions: Install from VSIX...`
3. 选择 `context-viewer-0.1.3.vsix` 文件

### 从源码安装

```bash
git clone <repo-url>
cd context-viewer
npm install
npm run compile
# 然后按 F5 启动扩展开发宿主窗口
```

### 前置条件

- VS Code >= 1.95.0
- GitHub Copilot 扩展（已安装并登录）

---

## 2. 快速开始

### 2.1 打开 Context Viewer 面板

安装后，VS Code 左侧活动栏会出现 Context Viewer 图标（铅笔+加号图标）。点击它打开侧边栏，包含三个视图：

- **Sessions** — 捕获会话列表
- **Execution Steps** — 当前会话的步骤时间线
- **Statistics** — 实时统计数据

### 2.2 开始捕获

有三种方式开始捕获 Copilot 交互：

**方式 1：状态栏**
> 点击右下角状态栏的 `Context Viewer` 按钮

**方式 2：视图按钮**
> 在 Sessions 视图标题栏点击红色录制按钮 `●`

**方式 3：命令面板**
> `Cmd+Shift+P` → 输入 `Context Viewer: Start Capture`

开始捕获后：
- 状态栏变为橙色背景，实时显示步骤数和 token 消耗
- Sessions 视图出现一个带红色 `●` 图标的活跃会话
- 同时启动日志文件监控（自动监控 Copilot 扩展的磁盘日志）

### 2.3 三种捕获模式

扩展提供三层捕获方案，可以组合使用：

#### 模式 A：`@debug` Chat 代理（推荐，最完整的数据）

在 VS Code Chat 中输入 `@debug 你的问题`，扩展会：

1. 记录完整的 **chat history**（所有历史对话轮次）
2. 记录当前 **user prompt** + 文件引用
3. 选择 Copilot 模型，记录 **模型信息**（id, family, version, maxInputTokens）
4. 记录发送给模型的 **完整消息数组**
5. 转发请求并 **流式输出** 响应
6. 记录完整的 **output response** + 耗时
7. 在聊天底部显示 **debug 摘要**（input/output token 数、耗时、模型名）

```
示例：
  @debug 帮我重构这个函数
  @debug #file:src/main.ts 解释这段代码的作用
```

#### 模式 B：日志文件监控（被动，不改变工作习惯）

- Start Capture 时自动启动
- 也可单独开启：`Context Viewer: Start Log File Monitoring`
- 监控 Copilot 扩展写入磁盘的日志文件
- 自动解析：API 请求/响应、`prompt_tokens`/`completion_tokens`、`tool_call`、压缩事件

#### 模式 C：编辑器监控（间接推断）

正常使用 Copilot 的所有功能，扩展在后台通过编辑器事件推断：

- **内联代码补全** — 检测 >50 字符的代码插入
- **文件切换** — 当可见编辑器变化时，记录上下文变化
- **文本选择** — 当选中 >20 字符的文本时，记录为用户提示
- **Chat 交互** — 通过 proposed API 监听聊天操作
- **终端操作** — 记录新终端的开启

> **三种模式的对比：**
>
> | 模式 | 数据完整度 | 是否需改变习惯 | 适用场景 |
> |------|-----------|--------------|---------|
> | `@debug` 代理 | 完整 input/output prompt | 需要用 `@debug` 前缀 | 精确调试特定对话 |
> | 日志监控 | token 计数 + tool call + 压缩 | 无需改变 | 长期被动监控 |
> | 编辑器监控 | 上下文变化 + 补全检测 | 无需改变 | 追踪上下文大小变化 |

### 2.4 查看执行步骤

1. 点击 Sessions 视图中的会话，选中它
2. Execution Steps 视图自动加载该会话的所有步骤
3. 每个步骤显示：
   - **序号和类型** — 如 `#1 User Prompt`
   - **时间** — 如 `14:30:06`
   - **方向** — `→` 输入 / `←` 输出
   - **Token 数** — 如 `125 tok`
   - **上下文大小** — 如 `ctx: 2000`

### 2.5 查看步骤详情

点击任意步骤，在编辑器右侧打开 Webview 详情面板，包含：

- **指标卡片** — Token Count、Context Size、时间戳、Step ID
- **压缩信息**（如有） — 原始大小、压缩后大小、压缩比、可视化进度条
- **元数据** — 模型、工具名、文件路径、行范围等
- **原始内容** — 完整的步骤内容文本

### 2.6 停止捕获

与开始类似，三种方式：

- 点击状态栏（录制中状态）
- Sessions 视图标题栏的停止按钮 `■`
- 命令面板 → `Context Viewer: Stop Capture`

---

## 3. 功能详解

### 3.1 上下文大小追踪

扩展实时追踪当前上下文窗口的估算 token 数：

- 每当可见编辑器变化时，重新估算所有可见文件的 token 总量
- 在 Steps 视图中，每步显示 `ctx:` 字段
- 在 Statistics 视图中，显示峰值上下文大小

**Token 估算规则：**
- 英文/代码：约 4 个字符 = 1 个 token
- 中日韩字符：约 2 个字符 = 1 个 token

### 3.2 压缩检测

当上下文大小出现显著下降（>30%）时，扩展自动标记为压缩事件：

- 在 Steps 视图中，压缩步骤用红色 `🔻` 图标标记
- 在详情面板中，显示专用的压缩信息卡片
- 在 Statistics 视图中，统计压缩事件总数和平均压缩比

这帮助你了解 Copilot 何时对上下文进行了截断或压缩，以及压缩的幅度。

### 3.3 统计面板

Statistics 视图分为四个组：

| 组别 | 指标 |
|------|------|
| **Token Usage** | 输入 token 数、输出 token 数、总 token 数 |
| **Context** | 峰值上下文大小、压缩事件次数、平均压缩比 |
| **Execution** | 总步骤数、会话持续时间 |
| **Tool Calls** | 各工具调用次数排名 |

### 3.4 导出会话

将完整会话数据导出为 JSON 文件，用于离线分析或团队共享：

1. 命令面板 → `Context Viewer: Export Session as JSON`
2. 在弹出的列表中选择要导出的会话
3. 选择保存路径

导出的 JSON 包含完整的步骤序列和统计摘要。

### 3.5 导入日志

支持导入两种格式进行离线分析：

1. 命令面板 → `Context Viewer: Import Log`
2. 选择文件（支持 `.json`、`.log`、`.txt`）

**JSON 格式**：包含 `steps` 数组的 JSON 文件（如之前导出的文件）

**日志格式**：纯文本日志文件，自动匹配以下模式：
- `[request]` / `sending request` → User Prompt
- `[response]` / `received response` → Assistant Response
- `[tool call]` / `calling tool` → Tool Call
- `[tool result]` / `tool returned` → Tool Result
- `[compress]` / `compaction` / `truncat` → Compression
- `[context]` / `injecting context` → Context Injection
- `[system]` / `system prompt` → System Prompt

### 3.6 清除会话

命令面板 → `Context Viewer: Clear All Sessions`

会弹出确认对话框，确认后清除所有会话数据。如果正在录制，会自动停止。

---

## 4. 命令速查表

| 操作 | 命令面板输入 | 快捷触发 |
|------|-------------|---------|
| 开始捕获 | `Context Viewer: Start Capture` | 点击状态栏 / Sessions 标题栏 `●` |
| 停止捕获 | `Context Viewer: Stop Capture` | 点击状态栏 / Sessions 标题栏 `■` |
| 开始日志监控 | `Context Viewer: Start Log File Monitoring` | — |
| 停止日志监控 | `Context Viewer: Stop Log File Monitoring` | — |
| 清除会话 | `Context Viewer: Clear All Sessions` | Sessions 标题栏 `✕` |
| 导出 JSON | `Context Viewer: Export Session as JSON` | — |
| 导入日志 | `Context Viewer: Import Log` | — |
| 刷新视图 | `Context Viewer: Refresh` | Steps 标题栏 `↻` |
| @debug 对话 | 在 Chat 中输入 `@debug 你的问题` | — |

---

## 5. 典型使用场景

### 场景 1：分析 Copilot Agent 为什么没按预期工作

1. 开始捕获
2. 在 Chat 中使用 `@debug` 代替直接提问，如 `@debug 帮我重构这个函数`
3. 停止捕获
4. 逐步检查 Execution Steps，关注：
   - **完整的 input prompt** — 确认发送给模型的内容是否包含足够的上下文
   - **chat history** — 检查多轮对话中是否丢失了关键信息
   - **output response** — 检查模型的完整回复
   - 是否发生了压缩导致丢失了关键信息
   - 工具调用的顺序是否合理

### 场景 2：优化上下文使用效率

1. 在不同的编辑器布局下各录制一次会话
2. 导出两个会话的 JSON
3. 对比 `peakContextSize` 和 `compressionEvents`
4. 找到让 Copilot 上下文利用率最高的工作方式

### 场景 3：调试提示词压缩问题

1. 开始捕获
2. 打开大量文件，使上下文逼近窗口限制
3. 在 Statistics 视图观察上下文峰值
4. 当发生压缩时，检查压缩步骤详情
5. 确认压缩后是否丢失了关键代码上下文

### 场景 4：团队分享 Copilot 行为分析

1. 录制一个有代表性的 Copilot 交互会话
2. 导出为 JSON
3. 分享给团队成员
4. 团队成员通过 Import Log 导入查看

---

## 6. 输出通道

扩展在 VS Code 的 Output 面板注册了 `Context Viewer` 通道，记录所有捕获事件的原始日志：

```
查看方式：View → Output → 选择 "Context Viewer"
```

日志格式：
```
[Capture Started] Session: session_1715000000000_abc123
[context_injection] input | tokens: 2500 | ctx: 2500
[user_prompt] input | tokens: 125 | ctx: 2625
[assistant_response] output | tokens: 350 | ctx: 2625
[tool_call] output | tokens: 50 | ctx: 2625
[Capture Stopped]
```

---

## 7. 已知限制

| 限制 | 说明 |
|------|------|
| Token 计数为估算值 | 使用字符比例估算，与实际 tokenizer 结果有 ~10% 误差 |
| `@debug` 需要改变工作习惯 | 需要在 Chat 中使用 `@debug` 前缀才能捕获完整 prompt，直接使用 Copilot Chat 无法拦截其内部 API |
| 日志监控依赖 Copilot 日志格式 | Copilot 扩展的日志格式可能随版本更新变化，需要适配新的日志模式 |
| 数据不持久化 | 会话数据存储在内存中，重启 VS Code 后丢失（可手动导出） |
| 部分 API 为 proposed | `chat.onDidPerformAction` 属于 proposed API，需要在 `package.json` 中声明 `enabledApiProposals` 才能使用全部功能 |
| `@debug` 模型选择 | 默认选择 `copilot` vendor 的 `gpt-4o` 系列模型，如果 Copilot 使用其他模型可能需要调整 |
