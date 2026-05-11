import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SessionStore } from './sessionStore';
import { StepType } from './types';
import { t } from './i18n';

/**
 * Watches Copilot extension log files on disk for real-time parsing.
 *
 * Copilot Chat writes logs to its extension directory. This watcher
 * monitors those files and parses new lines into structured steps.
 */
export class CopilotLogWatcher implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private watchers: fs.FSWatcher[] = [];
  private fileOffsets = new Map<string, number>();
  private watching = false;
  private outputChannel: vscode.OutputChannel;
  private stepCounter = 0;
  private runningContextSize = 0;

  // Patterns to extract structured info from Copilot logs
  private readonly patterns: { regex: RegExp; type: StepType; direction: 'input' | 'output'; extract?: (match: RegExpMatchArray) => Record<string, unknown> }[] = [
    // Request/response patterns
    { regex: /request to (\S+).*model[=: ]+(\S+)/i, type: 'user_prompt', direction: 'input', extract: (m) => ({ endpoint: m[1], model: m[2] }) },
    { regex: /sending request|"role"\s*:\s*"user"/i, type: 'user_prompt', direction: 'input' },
    { regex: /"role"\s*:\s*"system"/i, type: 'system_prompt', direction: 'input' },
    { regex: /response.*status[=: ]+(\d+)/i, type: 'assistant_response', direction: 'output', extract: (m) => ({ statusCode: parseInt(m[1]) }) },
    { regex: /received response|"role"\s*:\s*"assistant"/i, type: 'assistant_response', direction: 'output' },
    // Token usage patterns
    { regex: /prompt.tokens[=: ]+(\d+)/i, type: 'context_injection', direction: 'input', extract: (m) => ({ promptTokens: parseInt(m[1]) }) },
    { regex: /completion.tokens[=: ]+(\d+)/i, type: 'assistant_response', direction: 'output', extract: (m) => ({ completionTokens: parseInt(m[1]) }) },
    { regex: /total.tokens[=: ]+(\d+)/i, type: 'context_injection', direction: 'input', extract: (m) => ({ totalTokens: parseInt(m[1]) }) },
    // Tool call patterns
    { regex: /tool[_\s]*call.*?["']?(\w+)["']?/i, type: 'tool_call', direction: 'output', extract: (m) => ({ toolName: m[1] }) },
    { regex: /function[_\s]*call.*?["']?name["']?\s*:\s*["'](\w+)["']/i, type: 'tool_call', direction: 'output', extract: (m) => ({ toolName: m[1] }) },
    { regex: /tool[_\s]*result|function[_\s]*result/i, type: 'tool_result', direction: 'input' },
    // Compression/truncation patterns
    { regex: /compaction|compress|truncat|context.*(?:reduc|trim|prun)/i, type: 'compression', direction: 'input' },
    // Content patterns (prompt/message bodies)
    { regex: /"content"\s*:\s*"(.{10,})"/i, type: 'unknown', direction: 'input', extract: (m) => ({ contentPreview: m[1].slice(0, 200) }) },
    // Streaming patterns
    { regex: /stream.*chunk|delta.*content/i, type: 'assistant_response', direction: 'output' },
  ];

  constructor(private store: SessionStore) {
    this.outputChannel = vscode.window.createOutputChannel('Copilot Log Watcher', { log: true });
  }

  startWatching(): void {
    if (this.watching) { return; }
    this.watching = true;
    this.stepCounter = 0;
    this.runningContextSize = 0;

    this.outputChannel.appendLine('[LogWatcher] Starting...');

    // Find Copilot extension log directories
    const logPaths = this.findCopilotLogPaths();

    if (logPaths.length === 0) {
      this.outputChannel.appendLine('[LogWatcher] No Copilot log paths found');
      vscode.window.showWarningMessage(t('logwatch.no_paths'));
      return;
    }

    for (const logPath of logPaths) {
      this.watchPath(logPath);
    }

    this.outputChannel.appendLine(`[LogWatcher] Watching ${logPaths.length} log paths`);
  }

  stopWatching(): void {
    if (!this.watching) { return; }
    this.watching = false;

    for (const w of this.watchers) {
      w.close();
    }
    this.watchers = [];
    this.fileOffsets.clear();
    this.outputChannel.appendLine('[LogWatcher] Stopped');
  }

  isWatching(): boolean {
    return this.watching;
  }

  private findCopilotLogPaths(): string[] {
    const paths: string[] = [];

    // VS Code extensions directory
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    const extensionsDirs = [
      path.join(homeDir, '.vscode', 'extensions'),
      path.join(homeDir, '.vscode-insiders', 'extensions'),
    ];

    for (const extDir of extensionsDirs) {
      if (!fs.existsSync(extDir)) { continue; }

      try {
        const entries = fs.readdirSync(extDir);
        for (const entry of entries) {
          // Match GitHub Copilot and Copilot Chat extension directories
          if (entry.startsWith('github.copilot-chat') || entry.startsWith('github.copilot-')) {
            const extPath = path.join(extDir, entry);
            // Look for log files in the extension directory
            paths.push(extPath);

            // Also check for dist/ directory where runtime logs might be
            const distPath = path.join(extPath, 'dist');
            if (fs.existsSync(distPath)) {
              paths.push(distPath);
            }
          }
        }
      } catch {
        // Skip unreadable directories
      }
    }

    // VS Code log directory
    const logDirs = [
      path.join(homeDir, 'Library', 'Application Support', 'Code', 'logs'),   // macOS
      path.join(homeDir, '.config', 'Code', 'logs'),                          // Linux
      path.join(homeDir, 'AppData', 'Roaming', 'Code', 'logs'),              // Windows
    ];

    for (const logDir of logDirs) {
      if (fs.existsSync(logDir)) {
        paths.push(logDir);
        // Traverse subdirectories to find extension host logs
        try {
          this.findLogDirsRecursive(logDir, paths, 3);
        } catch {
          // Skip on error
        }
      }
    }

    return paths;
  }

  private findLogDirsRecursive(dir: string, results: string[], depth: number): void {
    if (depth <= 0) { return; }
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = path.join(dir, entry.name);
          // Look for exthost directories or copilot-related dirs
          if (entry.name.includes('exthost') || entry.name.includes('copilot')) {
            results.push(fullPath);
          }
          this.findLogDirsRecursive(fullPath, results, depth - 1);
        }
      }
    } catch {
      // Skip
    }
  }

  private watchPath(dirPath: string): void {
    try {
      const watcher = fs.watch(dirPath, { recursive: false }, (eventType, filename) => {
        if (!this.watching || !filename) { return; }
        // Only watch .log and .txt files
        if (!filename.endsWith('.log') && !filename.endsWith('.txt') && !filename.endsWith('.json')) { return; }

        const fullPath = path.join(dirPath, filename);
        this.onFileChanged(fullPath);
      });

      this.watchers.push(watcher);

      // Also scan existing log files for initial content
      try {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          if (file.endsWith('.log') || (file.includes('copilot') && file.endsWith('.txt'))) {
            const fullPath = path.join(dirPath, file);
            // Set offset to current end so we only read new content
            try {
              const stat = fs.statSync(fullPath);
              this.fileOffsets.set(fullPath, stat.size);
            } catch {
              // Skip
            }
          }
        }
      } catch {
        // Skip
      }
    } catch (err) {
      this.outputChannel.appendLine(`[LogWatcher] Failed to watch ${dirPath}: ${err}`);
    }
  }

  private onFileChanged(filePath: string): void {
    try {
      const stat = fs.statSync(filePath);
      const previousOffset = this.fileOffsets.get(filePath) || 0;

      if (stat.size <= previousOffset) {
        // File was truncated or unchanged
        if (stat.size < previousOffset) {
          this.fileOffsets.set(filePath, 0);
        }
        return;
      }

      // Read only the new content
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(stat.size - previousOffset);
      fs.readSync(fd, buffer, 0, buffer.length, previousOffset);
      fs.closeSync(fd);

      this.fileOffsets.set(filePath, stat.size);

      const newContent = buffer.toString('utf-8');
      const lines = newContent.split('\n').filter(l => l.trim());

      for (const line of lines) {
        this.parseLine(line, filePath);
      }
    } catch {
      // File may have been deleted or locked
    }
  }

  private parseLine(line: string, sourceFile: string): void {
    const session = this.store.getActiveSession();
    if (!session) { return; }

    for (const pattern of this.patterns) {
      const match = line.match(pattern.regex);
      if (!match) { continue; }

      const extra = pattern.extract ? pattern.extract(match) : {};
      const tokenCount = this.estimateTokens(line);

      // Update running context size for token usage lines
      if (extra.promptTokens) {
        this.runningContextSize = extra.promptTokens as number;
      }
      if (extra.totalTokens) {
        this.runningContextSize = extra.totalTokens as number;
      }

      this.store.addStep({
        id: `log_${++this.stepCounter}`,
        sessionId: session.id,
        timestamp: Date.now(),
        type: pattern.type,
        direction: pattern.direction,
        content: line,
        tokenCount,
        contextSize: this.runningContextSize,
        metadata: {
          source: 'copilot_log',
          sourceFile: path.basename(sourceFile),
          ...extra,
        },
      });

      this.outputChannel.appendLine(
        `[LogWatcher] [${pattern.type}] ${pattern.direction} | ${path.basename(sourceFile)}`,
      );

      break; // Only match the first pattern
    }
  }

  private estimateTokens(text: string): number {
    if (!text) { return 0; }
    const cjkCount = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
    const otherCount = text.length - cjkCount;
    return Math.ceil(otherCount / 4 + cjkCount / 2);
  }

  dispose(): void {
    this.stopWatching();
    this.outputChannel.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
