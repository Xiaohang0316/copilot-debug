# Copilot Debugger - 开发文档

## 1. 环境搭建

### 1.1 前置要求

| 工具 | 版本要求 |
|------|---------|
| Node.js | >= 18.x |
| npm | >= 9.x |
| VS Code | >= 1.95.0 |
| TypeScript | >= 5.3 (devDependency) |

### 1.2 初始化

```bash
# 克隆项目
git clone <repo-url>
cd copilot-debugger

# 安装依赖
npm install

# 编译
npm run compile

# 或启动监听模式（自动编译）
npm run watch
```

### 1.3 依赖说明

本项目仅有 devDependencies，无运行时依赖：

| 包名 | 用途 |
|------|------|
| `@types/vscode` | VS Code 扩展 API 类型定义 |
| `@types/node` | Node.js 类型定义 |
| `typescript` | TypeScript 编译器 |
| `@vscode/vsce` | 扩展打包工具 |

---

## 2. 项目结构

```
copilot-debugger/
├── package.json              # 扩展清单（最重要的配置文件）
├── tsconfig.json             # TypeScript 配置
├── .vscodeignore             # VSIX 打包排除规则
│
├── src/                      # 源码目录
│   ├── extension.ts          # 入口文件：activate / deactivate
│   ├── types.ts              # 所有 TypeScript 接口/类型定义
│   ├── sessionStore.ts       # 数据层：会话存储和统计计算
│   ├── interceptor.ts        # L3: 编辑器事件拦截
│   ├── chatParticipant.ts    # L1: @debug Chat Participant 代理
│   ├── logWatcher.ts         # L2: Copilot 日志文件监控
│   └── views/                # 视图层
│       ├── sessionTreeProvider.ts   # Sessions 列表视图
│       ├── stepTreeProvider.ts      # Steps 时间线视图
│       ├── statsTreeProvider.ts     # Statistics 统计视图
│       └── detailPanel.ts          # Webview 详情面板
│
├── out/                      # 编译产物（git ignore）
├── resources/                # 静态资源
│   └── icon.svg              # 活动栏图标
│
└── docs/                     # 文档
    ├── DESIGN.md
    ├── USAGE.md
    └── DEVELOPMENT.md
```

---

## 3. 核心模块详解

### 3.1 扩展入口 — `extension.ts`

`activate()` 函数负责组装所有组件：

```
activate()
  ├── 创建 SessionStore（数据层）
  ├── 创建 CopilotInterceptor（L3: 编辑器事件拦截，依赖 store）
  ├── 创建 DebugChatParticipant（L1: @debug 代理，依赖 store）
  ├── 创建 CopilotLogWatcher（L2: 日志监控，依赖 store）
  ├── 创建 DetailPanel（详情面板，依赖 store）
  ├── 创建 3 个 TreeDataProvider（视图层，依赖 store）
  ├── 注册 3 个 TreeView
  ├── 注册 10 个命令
  ├── 创建状态栏按钮
  ├── 监听 store.onDidChange 更新状态栏
  └── 注册所有 disposable 到 context.subscriptions
```

所有组件通过 `SessionStore` 的 `onDidChange` 事件解耦——store 数据变更时自动通知所有视图刷新。

### 3.2 数据层 — `sessionStore.ts`

**职责：** 管理会话生命周期、存储步骤数据、计算统计。

**关键方法：**

| 方法 | 说明 |
|------|------|
| `createSession(label?)` | 创建新会话，设为活跃会话 |
| `endSession(id?)` | 结束指定会话（默认结束活跃会话），记录结束时间 |
| `addStep(step)` | 向指定会话添加步骤，累加 token 计数 |
| `getSessionStats(id)` | 计算会话统计：峰值上下文、压缩次数、工具调用分布等 |
| `exportSession(id)` | 导出会话数据 + 统计信息 |
| `clearAll()` | 清除所有会话数据 |

**事件机制：**

```typescript
private _onDidChange = new vscode.EventEmitter<void>();
readonly onDidChange = this._onDidChange.event;
```

所有数据修改操作结束后调用 `this._onDidChange.fire()`，视图层订阅此事件自动刷新。

### 3.3 L1: Chat 代理层 — `chatParticipant.ts`

**职责：** 注册 `@debug` Chat Participant，代理用户请求到 Copilot 模型，捕获完整 input/output。

**工作流程：**

```
handleRequest(request, context, stream, token)
  ├── 1. 解析 context.history → 记录所有历史对话（ChatRequestTurn / ChatResponseTurn）
  ├── 2. 记录 request.prompt + request.references（文件引用）
  ├── 3. vscode.lm.selectChatModels({ vendor: 'copilot' }) → 选择模型
  ├── 4. 记录模型信息（id, family, version, maxInputTokens）
  ├── 5. 构建 messages 数组 → 记录完整的 LM 请求
  ├── 6. model.sendRequest(messages) → 流式转发 response
  ├── 7. 记录完整 output response + duration
  └── 8. 在 stream 中追加 debug 摘要
```

**关键技术点：**

- 通过 `vscode.chat.createChatParticipant()` 注册，需在 `package.json` 的 `chatParticipants` 中声明
- 使用 `vscode.lm.selectChatModels()` 获取 Copilot 模型实例
- 通过 `model.sendRequest()` 发送请求并获取流式响应
- 自动管理 `runningContextSize`，累计输入 token 追踪上下文增长

### 3.4 L2: 日志监控层 — `logWatcher.ts`

**职责：** 被动监控 Copilot 扩展写入磁盘的日志文件，解析为结构化步骤。

**核心机制：**

```
startWatching()
  ├── findCopilotLogPaths() → 搜索 Copilot 扩展目录和 VS Code 日志目录
  ├── 对每个目录注册 fs.watch()
  ├── 记录每个文件的当前偏移量（只读新增内容）
  └── 文件变更时：
      ├── 增量读取新内容（从上次偏移量开始）
      ├── 逐行匹配 15 种正则模式
      └── 匹配成功 → 提取元数据 → store.addStep()
```

**搜索路径的平台适配：** 自动搜索 macOS/Linux/Windows 下的 `~/.vscode/extensions/github.copilot-*` 和 VS Code 日志目录，递归搜索 `exthost` 子目录。

**增量读取：** 通过 `fileOffsets` Map 记录每个文件的已读偏移，只处理新写入的内容，避免重复解析。

### 3.5 L3: 编辑器监控层 — `interceptor.ts`

**职责：** 通过 VS Code API 监控编辑器事件，间接推断 Copilot 活动。

**生命周期：**

```
startCapture()
  ├── 创建新 Session
  ├── 注册 LM API 监听器
  ├── 注册编辑器/文档监听器
  ├── 注册选择/终端/诊断监听器
  └── 设置 context: copilotDebugger.capturing = true

stopCapture()
  ├── 结束 Session
  ├── dispose 所有监听器
  └── 设置 context: copilotDebugger.capturing = false
```

**监听器注册方式：**

每个监听器返回的 `Disposable` 存入 `this.disposables` 数组。`stopCapture()` 时统一 dispose，避免内存泄漏。

**核心方法 `addStep()`：**

```typescript
private addStep(params: {
  type: StepType;
  direction: 'input' | 'output';
  content: string;
  tokenCount: number;
  contextSize: number;
  compressionInfo?: CompressionInfo;
  metadata: Record<string, unknown>;
}): void
```

所有监控渠道最终汇入此方法，统一生成 `CopilotStep` 对象并存入 store。

**日志解析 `parseLogLine()`：**

用于导入外部日志文件。通过 7 个正则模式匹配日志行，识别步骤类型：

```typescript
const patterns = [
  { regex: /\[request\]|sending request/i,    type: 'user_prompt' },
  { regex: /\[response\]|received response/i, type: 'assistant_response' },
  { regex: /\[tool.*call\]|calling tool/i,    type: 'tool_call' },
  // ...
];
```

### 3.4 视图层 — `views/`

三个 TreeDataProvider 遵循相同模式：

```typescript
class XxxTreeProvider implements vscode.TreeDataProvider<XxxItem> {
  // 刷新事件
  private _onDidChangeTreeData = new vscode.EventEmitter<XxxItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private store: SessionStore) {
    // 订阅 store 变更，自动刷新
    store.onDidChange(() => this._onDidChangeTreeData.fire(undefined));
  }

  getTreeItem(element: XxxItem): vscode.TreeItem { return element; }
  getChildren(element?: XxxItem): XxxItem[] { /* 构建树节点 */ }
}
```

**视图联动机制：**

```
用户点击 Session
  → copilotDebugger.selectSession 命令
    → sessionProvider.selectSession(id)   // 高亮选中
    → stepProvider.setSessionId(id)       // 加载步骤
    → statsProvider.setSessionId(id)      // 加载统计
```

**StepItem 图标映射：**

```typescript
const STEP_ICONS: Record<StepType, { icon: string; color?: string }> = {
  user_prompt:       { icon: 'comment',       color: 'charts.blue' },
  system_prompt:     { icon: 'settings-gear',  color: 'charts.purple' },
  assistant_response:{ icon: 'hubot',          color: 'charts.green' },
  tool_call:         { icon: 'tools',          color: 'charts.orange' },
  tool_result:       { icon: 'output',         color: 'charts.yellow' },
  context_injection: { icon: 'file-code',      color: 'charts.blue' },
  compression:       { icon: 'fold',           color: 'charts.red' },
  unknown:           { icon: 'question' },
};
```

### 3.5 Webview — `detailPanel.ts`

Webview 面板使用原生 HTML/CSS/Canvas 实现，无额外前端框架依赖。

**关键设计：**

- 使用 VS Code CSS 变量 (`--vscode-*`) 确保主题适配
- 使用 `retainContextWhenHidden: true` 保留面板状态
- 面板复用：只创建一个 `WebviewPanel` 实例，切换内容时更新 HTML
- Canvas 图表：用原生 Canvas API 绘制上下文大小时间线，红点标记压缩事件

**上下文时间线图表的绘制逻辑：**

```javascript
// 数据点：每步的 contextSize
// X 轴：步骤序号
// Y 轴：context size (tokens)
// 蓝色折线：上下文大小变化
// 红色圆点：压缩事件位置
```

---

## 4. 开发与调试

### 4.1 本地开发

```bash
# 启动持续编译
npm run watch
```

然后在 VS Code 中按 `F5`，启动 Extension Development Host 窗口。修改源码后，在开发宿主窗口中 `Cmd+Shift+P` → `Developer: Reload Window` 即可生效。

### 4.2 调试

在 `.vscode/launch.json` 中添加（如不存在则创建）：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "outFiles": ["${workspaceFolder}/out/**/*.js"],
      "preLaunchTask": "npm: watch"
    }
  ]
}
```

可在源码中设置断点，调试器会在 Extension Host 进程中命中。

### 4.3 查看日志

开发时，扩展的 `console.log` 输出在 Extension Development Host 的 Debug Console 中可见。

捕获事件日志在 Output 面板的 `Copilot Debugger` 通道中查看。

---

## 5. 添加新功能

### 5.1 添加新的步骤类型

1. **`types.ts`** — 在 `StepType` 联合类型中添加新类型：
   ```typescript
   export type StepType = ... | 'my_new_type';
   ```

2. **`interceptor.ts`** — 在 `parseLogLine()` 中添加匹配模式：
   ```typescript
   { regex: /my_pattern/i, type: 'my_new_type', direction: 'input' },
   ```

3. **`stepTreeProvider.ts`** — 在 `STEP_ICONS` 和 `STEP_LABELS` 中添加映射：
   ```typescript
   my_new_type: { icon: 'some-icon', color: 'charts.green' },
   ```

### 5.2 添加新的监控渠道

**在 `CopilotInterceptor` (L3) 中添加编辑器监控：**

1. 创建新的 `monitorXxx()` 私有方法
2. 在 `startCapture()` 中调用
3. 注册的 `Disposable` 推入 `this.disposables`
4. 通过 `this.addStep()` 统一写入数据

```typescript
private monitorXxx(): void {
  this.disposables.push(
    vscode.someApi.onSomeEvent((e) => {
      if (!this.capturing) return;
      this.addStep({
        type: 'my_new_type',
        direction: 'input',
        content: '...',
        tokenCount: this.estimateTokens('...'),
        contextSize: this.previousContextSize,
        metadata: {},
      });
    })
  );
}
```

**在 `CopilotLogWatcher` (L2) 中添加日志模式：**

在 `this.patterns` 数组中添加新的匹配规则：

```typescript
{
  regex: /my_log_pattern/i,
  type: 'my_new_type',
  direction: 'input',
  extract: (match) => ({ customField: match[1] }),
}
```

**在 `DebugChatParticipant` (L1) 中扩展代理功能：**

在 `handleRequest()` 中增加处理逻辑，例如支持子命令：

```typescript
if (request.command === 'explain') {
  // 处理 @debug /explain 子命令
}
```

### 5.3 添加新的统计指标

1. **`types.ts`** — 在 `SessionStats` 接口中添加字段
2. **`sessionStore.ts`** — 在 `getSessionStats()` 中计算新指标
3. **`statsTreeProvider.ts`** — 在 `buildStatItems()` 中添加 UI 节点

### 5.4 添加新命令

1. **`package.json`** — 在 `contributes.commands` 中注册命令声明
2. **`extension.ts`** — 在 `activate()` 中用 `vscode.commands.registerCommand` 注册处理函数
3. （可选）**`package.json`** — 在 `contributes.menus` 中添加菜单入口

---

## 6. 打包与发布

### 6.1 打包 VSIX

```bash
# 编译 + 打包
npm run package

# 或手动打包（跳过 repository 检查）
npx vsce package --allow-missing-repository
```

生成的 `.vsix` 文件在项目根目录。

### 6.2 发布到 Marketplace

```bash
# 首次需要创建 publisher 并登录
npx vsce login <publisher-name>

# 发布
npx vsce publish
```

发布前检查清单：

- [ ] `package.json` 中 `version` 已更新
- [ ] `package.json` 中 `publisher` 填写正确
- [ ] 编译无错误 (`npm run compile`)
- [ ] 功能测试通过
- [ ] 添加了 `LICENSE` 文件
- [ ] 添加了 `README.md`（作为 Marketplace 页面展示）

### 6.3 版本管理

```bash
# 补丁版本 0.1.0 → 0.1.1
npx vsce publish patch

# 次版本 0.1.0 → 0.2.0
npx vsce publish minor

# 主版本 0.1.0 → 1.0.0
npx vsce publish major
```

---

## 7. package.json 关键配置解读

### 7.1 激活事件

```json
"activationEvents": ["onStartupFinished"]
```

扩展在 VS Code 完全启动后自动激活。这确保 Copilot 扩展已加载，我们能监控其活动。

### 7.2 Chat Participant 注册

```json
"chatParticipants": [{
  "id": "copilot-debugger.debug",
  "fullName": "Copilot Debugger",
  "name": "debug",
  "description": "Proxy chat participant that forwards to Copilot and logs full input/output prompts",
  "isSticky": false
}]
```

注册 `@debug` 聊天参与者。`name` 决定了在 Chat 中使用的前缀 `@debug`。`isSticky: false` 表示不会自动粘滞到后续对话。

### 7.3 视图容器

```json
"viewsContainers": {
  "activitybar": [{
    "id": "copilot-debugger",
    "title": "Copilot Debugger",
    "icon": "resources/icon.svg"
  }]
}
```

在活动栏注册独立的侧边栏容器，与 Explorer、Search 等平级。

### 7.4 菜单条件

```json
{
  "command": "copilotDebugger.startCapture",
  "when": "view == copilotDebugger.sessions && !copilotDebugger.capturing"
}
```

使用 `when` 子句控制按钮的显隐。`copilotDebugger.capturing` 是通过 `setContext` 命令动态设置的布尔上下文变量。

---

## 8. 代码规范

| 规范 | 说明 |
|------|------|
| 语言 | TypeScript strict mode |
| 模块 | CommonJS (`"module": "commonjs"`) |
| 目标 | ES2022 |
| 命名 | 类名 PascalCase，方法/变量 camelCase，常量 UPPER_SNAKE |
| 事件 | 使用 `vscode.EventEmitter` + `vscode.Event` 模式 |
| 资源释放 | 所有 `Disposable` 注册到 `context.subscriptions` 或手动管理 |
| 错误处理 | 静默处理缺失数据（返回 `undefined` / 空数组），用户操作错误用 `showWarningMessage` |

---

## 9. 常见问题

### Q: 编译报错 `onDidPerformAction` 不存在

这是 VS Code 的 proposed API。当前代码已通过运行时类型检查规避：

```typescript
const chatNs = vscode.chat as Record<string, unknown>;
if (typeof chatNs.onDidPerformAction === 'function') { ... }
```

如需完整的 proposed API 支持，在 `package.json` 中添加：
```json
"enabledApiProposals": ["chatParticipantAdditions"]
```

### Q: 如何添加单元测试

1. 安装测试依赖：
   ```bash
   npm install --save-dev @vscode/test-electron mocha @types/mocha
   ```

2. 创建 `src/test/` 目录，添加测试文件

3. 在 `package.json` 中添加测试脚本：
   ```json
   "test": "vscode-test"
   ```

4. `SessionStore` 和 token 估算等纯逻辑可以用常规单元测试覆盖

### Q: `@debug` 在 Chat 中不显示

确保 `package.json` 中正确声明了 `chatParticipants`：

```json
"chatParticipants": [{
  "id": "copilot-debugger.debug",
  "name": "debug",
  ...
}]
```

同时确保扩展已激活（检查 Output 面板中是否有 `Copilot Debugger extension activated` 日志）。

### Q: `@debug` 提示 "No Copilot language model available"

这表示 `vscode.lm.selectChatModels({ vendor: 'copilot' })` 没有找到可用模型。检查：

1. GitHub Copilot 扩展已安装且已登录
2. Copilot 订阅有效
3. 重启 VS Code 后重试

### Q: 日志监控没有捕获到数据

可能原因：

1. Copilot 扩展版本较新，日志格式变化 — 检查 Output 面板的 `Copilot Log Watcher` 通道
2. 日志路径不在默认搜索范围内 — 检查是否使用了非标准的 VS Code 安装
3. Copilot 扩展没有写入日志 — 部分操作（如内联补全）可能不写日志

### Q: 数据量大时会影响性能吗

当前所有数据存储在内存中。对于极长的会话（>10000 步），TreeView 刷新可能有轻微延迟。建议：

- 及时结束已完成的会话
- 使用 Clear 清理不需要的历史
- 导出后清理以释放内存
