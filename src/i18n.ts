import * as vscode from 'vscode';

/**
 * Runtime localization for strings used in TypeScript code.
 * VS Code's %key% mechanism only works for package.json.
 * For runtime strings, we load from l10n bundles.
 */

const zhCn: Record<string, string> = {
  // Session
  'session.default_label': '会话 {0}',
  'session.imported': '已导入: {0}',
  'session.log': '日志: {0}',
  'session.debug_chat': '@debug 聊天会话',
  'session.log_watch': '日志监控会话',

  // Capture
  'capture.started': '上下文查看器: 捕获已开始。在聊天中使用 @debug 来捕获完整提示词。',
  'capture.stopped': '上下文查看器: 捕获已停止',
  'capture.log_started': '上下文查看器: 日志文件监控已开始',
  'capture.log_stopped': '上下文查看器: 日志文件监控已停止',

  // Clear
  'clear.confirm': '确定清除所有已捕获的会话？',
  'clear.button': '清除',
  'clear.done': '所有会话已清除',

  // Export
  'export.no_sessions': '没有可导出的会话',
  'export.select': '选择要导出的会话',
  'export.done': '会话已导出到 {0}',

  // Import
  'import.steps_done': '已导入 {0} 个步骤',
  'import.log_done': '从日志中导入了 {0} 个步骤',

  // Status bar
  'statusbar.idle': '上下文查看器',
  'statusbar.idle_tooltip': '点击开始捕获 Copilot 交互',
  'statusbar.capturing_tooltip': '捕获中... 点击停止。在聊天中使用 @debug 记录完整提示词。',

  // Steps
  'step.user_prompt': '用户提示',
  'step.system_prompt': '系统提示',
  'step.assistant_response': '助手响应',
  'step.tool_call': '工具调用',
  'step.tool_result': '工具结果',
  'step.context_injection': '上下文注入',
  'step.compression': '压缩',
  'step.unknown': '未知',

  // Stats
  'stats.no_session': '未选择会话',
  'stats.token_usage': 'Token 用量',
  'stats.input_tokens': '输入 Token',
  'stats.output_tokens': '输出 Token',
  'stats.total_tokens': '总 Token',
  'stats.context': '上下文',
  'stats.peak_context': '峰值上下文大小',
  'stats.compression_events': '压缩事件',
  'stats.avg_compression': '平均压缩比',
  'stats.execution': '执行',
  'stats.total_steps': '总步骤数',
  'stats.duration': '持续时间',
  'stats.tool_calls': '工具调用',

  // Detail panel
  'detail.metrics': '指标',
  'detail.token_count': 'Token 数量',
  'detail.context_size': '上下文大小',
  'detail.timestamp': '时间戳',
  'detail.step_id': '步骤 ID',
  'detail.compression_info': '压缩信息',
  'detail.original_size': '原始大小',
  'detail.compressed_size': '压缩后大小',
  'detail.ratio': '压缩比',
  'detail.method': '方法',
  'detail.metadata': '元数据',
  'detail.content': '内容',
  'detail.overview': '概览',
  'detail.context_over_time': '上下文大小变化',
  'detail.tool_distribution': '工具调用分布',

  // Chat participant
  'chat.no_model': '*没有可用的 Copilot 语言模型。请确保 GitHub Copilot 已安装并登录。*',
  'chat.debug_summary': '调试: {0} 输入 tok | {1} 输出 tok | {2}ms | 模型: {3}',

  // Log watcher
  'logwatch.no_paths': '上下文查看器: 未找到 Copilot 日志文件。请确保 GitHub Copilot/Copilot Chat 已安装。',
};

const en: Record<string, string> = {
  'session.default_label': 'Session {0}',
  'session.imported': 'Imported: {0}',
  'session.log': 'Log: {0}',
  'session.debug_chat': '@debug Chat Session',
  'session.log_watch': 'Log Watch Session',

  'capture.started': 'Context Viewer: Capture started. Use @debug in Chat to capture full prompts.',
  'capture.stopped': 'Context Viewer: Capture stopped',
  'capture.log_started': 'Context Viewer: Log file monitoring started',
  'capture.log_stopped': 'Context Viewer: Log file monitoring stopped',

  'clear.confirm': 'Clear all captured sessions?',
  'clear.button': 'Clear',
  'clear.done': 'All sessions cleared',

  'export.no_sessions': 'No sessions to export',
  'export.select': 'Select session to export',
  'export.done': 'Session exported to {0}',

  'import.steps_done': 'Imported {0} steps',
  'import.log_done': 'Imported {0} steps from log',

  'statusbar.idle': 'Context Viewer',
  'statusbar.idle_tooltip': 'Click to start capturing Copilot interactions',
  'statusbar.capturing_tooltip': 'Capturing... Click to stop. Use @debug in Chat for full prompt logging.',

  'step.user_prompt': 'User Prompt',
  'step.system_prompt': 'System Prompt',
  'step.assistant_response': 'Assistant Response',
  'step.tool_call': 'Tool Call',
  'step.tool_result': 'Tool Result',
  'step.context_injection': 'Context Injection',
  'step.compression': 'Compression',
  'step.unknown': 'Unknown',

  'stats.no_session': 'No session selected',
  'stats.token_usage': 'Token Usage',
  'stats.input_tokens': 'Input Tokens',
  'stats.output_tokens': 'Output Tokens',
  'stats.total_tokens': 'Total Tokens',
  'stats.context': 'Context',
  'stats.peak_context': 'Peak Context Size',
  'stats.compression_events': 'Compression Events',
  'stats.avg_compression': 'Avg Compression Ratio',
  'stats.execution': 'Execution',
  'stats.total_steps': 'Total Steps',
  'stats.duration': 'Duration',
  'stats.tool_calls': 'Tool Calls',

  'detail.metrics': 'Metrics',
  'detail.token_count': 'Token Count',
  'detail.context_size': 'Context Size',
  'detail.timestamp': 'Timestamp',
  'detail.step_id': 'Step ID',
  'detail.compression_info': 'Compression Info',
  'detail.original_size': 'Original Size',
  'detail.compressed_size': 'Compressed Size',
  'detail.ratio': 'Ratio',
  'detail.method': 'Method',
  'detail.metadata': 'Metadata',
  'detail.content': 'Content',
  'detail.overview': 'Overview',
  'detail.context_over_time': 'Context Size Over Time',
  'detail.tool_distribution': 'Tool Call Distribution',

  'chat.no_model': '*No Copilot language model available. Make sure GitHub Copilot is installed and signed in.*',
  'chat.debug_summary': 'Debug: {0} input tok | {1} output tok | {2}ms | model: {3}',

  'logwatch.no_paths': 'Context Viewer: No Copilot log files found. Make sure GitHub Copilot/Copilot Chat is installed.',
};

let currentBundle: Record<string, string> = en;

export function initI18n(): void {
  const lang = vscode.env.language;
  if (lang.startsWith('zh')) {
    currentBundle = zhCn;
  } else {
    currentBundle = en;
  }
}

/**
 * Get a localized string by key.
 * Supports placeholder substitution: t('key', 'arg0', 'arg1')
 * Placeholders in the string: {0}, {1}, etc.
 */
export function t(key: string, ...args: (string | number)[]): string {
  let text = currentBundle[key] || en[key] || key;
  for (let i = 0; i < args.length; i++) {
    text = text.replace(`{${i}}`, String(args[i]));
  }
  return text;
}
