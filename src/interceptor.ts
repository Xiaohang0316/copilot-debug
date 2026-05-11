import * as vscode from 'vscode';
import { SessionStore } from './sessionStore';
import { CopilotStep, StepType, CompressionInfo } from './types';

/**
 * Intercepts Copilot interactions by monitoring:
 * 1. VS Code OutputChannel for Copilot logs
 * 2. Language Model API calls (vscode.lm)
 * 3. Chat participant messages
 */
export class CopilotInterceptor implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private capturing = false;
  private outputChannel: vscode.OutputChannel;
  private previousContextSize = 0;
  private stepCounter = 0;

  constructor(private store: SessionStore) {
    this.outputChannel = vscode.window.createOutputChannel('Copilot Debugger', { log: true });
  }

  startCapture(): void {
    if (this.capturing) {return;}
    this.capturing = true;
    this.previousContextSize = 0;
    this.stepCounter = 0;

    const session = this.store.createSession();
    this.outputChannel.appendLine(`[Capture Started] Session: ${session.id}`);

    // Monitor language model chat requests
    this.monitorLanguageModel();

    // Monitor output channels for Copilot activity
    this.monitorCopilotOutput();

    // Monitor active text editor changes (context injection signals)
    this.monitorEditorChanges();

    vscode.commands.executeCommand('setContext', 'copilotDebugger.capturing', true);
  }

  stopCapture(): void {
    if (!this.capturing) {return;}
    this.capturing = false;
    this.store.endSession();
    this.outputChannel.appendLine('[Capture Stopped]');

    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];

    vscode.commands.executeCommand('setContext', 'copilotDebugger.capturing', false);
  }

  isCapturing(): boolean {
    return this.capturing;
  }

  private monitorLanguageModel(): void {
    // Monitor chat model requests via the lm API
    // vscode.lm.onDidChangeChatModels fires when models change
    if (vscode.lm && vscode.lm.onDidChangeChatModels) {
      this.disposables.push(
        vscode.lm.onDidChangeChatModels(() => {
          this.outputChannel.appendLine('[LM] Chat models changed');
        })
      );
    }

    // Wrap sendChatRequest to intercept calls
    this.interceptChatRequests();
  }

  private interceptChatRequests(): void {
    // Monitor chat participant interactions via the proposed API
    const chatNs = vscode.chat as Record<string, unknown>;
    if (typeof chatNs.onDidPerformAction === 'function') {
      const chatHandler = (chatNs.onDidPerformAction as (cb: (action: unknown) => void) => vscode.Disposable)((action: unknown) => {
        if (!this.capturing) {return;}
        const session = this.store.getActiveSession();
        if (!session) {return;}

        const actionStr = JSON.stringify(action, null, 2);
        this.addStep({
          type: 'tool_call',
          direction: 'output',
          content: actionStr,
          tokenCount: this.estimateTokens(actionStr),
          contextSize: this.previousContextSize,
          metadata: { toolName: 'chat_action' },
        });
      });
      this.disposables.push(chatHandler);
    }
  }

  private monitorCopilotOutput(): void {
    // Monitor tab changes - when Copilot opens inline chat or panels
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (!this.capturing || !editor) {return;}
        // Track file context switches
        this.outputChannel.appendLine(`[Context] Active editor: ${editor.document.uri.fsPath}`);
      })
    );

    // Monitor terminal output for Copilot CLI interactions
    this.disposables.push(
      vscode.window.onDidOpenTerminal((terminal) => {
        if (!this.capturing) {return;}
        this.outputChannel.appendLine(`[Terminal] Opened: ${terminal.name}`);
      })
    );

    // Monitor diagnostics changes (Copilot may trigger these)
    this.disposables.push(
      vscode.languages.onDidChangeDiagnostics((e) => {
        if (!this.capturing) {return;}
        for (const uri of e.uris) {
          const diags = vscode.languages.getDiagnostics(uri);
          if (diags.length > 0) {
            this.outputChannel.appendLine(`[Diagnostics] ${uri.fsPath}: ${diags.length} issues`);
          }
        }
      })
    );

    // Monitor document changes for copilot inline suggestions
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (!this.capturing) {return;}
        if (e.contentChanges.length === 0) {return;}

        const session = this.store.getActiveSession();
        if (!session) {return;}

        // Detect large insertions which may be Copilot completions
        for (const change of e.contentChanges) {
          if (change.text.length > 50 && change.rangeLength === 0) {
            this.addStep({
              type: 'assistant_response',
              direction: 'output',
              content: change.text.slice(0, 500) + (change.text.length > 500 ? '...' : ''),
              tokenCount: this.estimateTokens(change.text),
              contextSize: this.previousContextSize,
              metadata: {
                filePath: e.document.uri.fsPath,
                lineRange: `${change.range.start.line}-${change.range.end.line}`,
              },
            });
          }
        }
      })
    );
  }

  private monitorEditorChanges(): void {
    // Track visible editors - context that Copilot might use
    this.disposables.push(
      vscode.window.onDidChangeVisibleTextEditors((editors) => {
        if (!this.capturing) {return;}
        const session = this.store.getActiveSession();
        if (!session) {return;}

        const contextFiles = editors.map(e => e.document.uri.fsPath);
        const contextContent = editors
          .map(e => e.document.getText())
          .join('\n');

        const newContextSize = this.estimateTokens(contextContent);
        const compressionInfo = this.detectCompression(newContextSize);

        this.addStep({
          type: 'context_injection',
          direction: 'input',
          content: `Context files: ${contextFiles.join(', ')}`,
          tokenCount: newContextSize,
          contextSize: newContextSize,
          compressionInfo,
          metadata: {
            filePath: contextFiles.join(', '),
          },
        });

        this.previousContextSize = newContextSize;
      })
    );

    // Monitor selections - Copilot uses selected text as context
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (!this.capturing) {return;}
        const session = this.store.getActiveSession();
        if (!session) {return;}

        const selectedText = e.textEditor.document.getText(e.selections[0]);
        if (selectedText.length > 20) {
          this.addStep({
            type: 'user_prompt',
            direction: 'input',
            content: `Selected: ${selectedText.slice(0, 200)}${selectedText.length > 200 ? '...' : ''}`,
            tokenCount: this.estimateTokens(selectedText),
            contextSize: this.previousContextSize + this.estimateTokens(selectedText),
            metadata: {
              filePath: e.textEditor.document.uri.fsPath,
              lineRange: `${e.selections[0].start.line}-${e.selections[0].end.line}`,
            },
          });
        }
      })
    );
  }

  /**
   * Parse raw Copilot log lines and convert to structured steps.
   * This handles the GitHub Copilot Chat output format.
   */
  parseLogLine(line: string): Partial<CopilotStep> | null {
    // Match common Copilot log patterns
    const patterns: { regex: RegExp; type: StepType; direction: 'input' | 'output' }[] = [
      { regex: /\[request\]|sending request/i, type: 'user_prompt', direction: 'input' },
      { regex: /\[response\]|received response/i, type: 'assistant_response', direction: 'output' },
      { regex: /\[tool.*call\]|calling tool/i, type: 'tool_call', direction: 'output' },
      { regex: /\[tool.*result\]|tool returned/i, type: 'tool_result', direction: 'input' },
      { regex: /\[compress\]|compaction|truncat/i, type: 'compression', direction: 'input' },
      { regex: /\[context\]|injecting context/i, type: 'context_injection', direction: 'input' },
      { regex: /\[system\]|system prompt/i, type: 'system_prompt', direction: 'input' },
    ];

    for (const { regex, type, direction } of patterns) {
      if (regex.test(line)) {
        return { type, direction, content: line };
      }
    }

    return null;
  }

  /**
   * Manually add a step from external sources (e.g. log file parsing)
   */
  addManualStep(partial: {
    type: StepType;
    direction: 'input' | 'output';
    content: string;
    metadata?: Record<string, unknown>;
  }): void {
    if (!this.capturing) {return;}
    this.addStep({
      ...partial,
      tokenCount: this.estimateTokens(partial.content),
      contextSize: this.previousContextSize,
      metadata: partial.metadata || {},
    });
  }

  private addStep(params: {
    type: StepType;
    direction: 'input' | 'output';
    content: string;
    tokenCount: number;
    contextSize: number;
    compressionInfo?: CompressionInfo;
    metadata: Record<string, unknown>;
  }): void {
    const session = this.store.getActiveSession();
    if (!session) {return;}

    const step: CopilotStep = {
      id: `step_${++this.stepCounter}`,
      sessionId: session.id,
      timestamp: Date.now(),
      ...params,
    };

    this.store.addStep(step);
    this.outputChannel.appendLine(
      `[${step.type}] ${step.direction} | tokens: ${step.tokenCount} | ctx: ${step.contextSize}`
    );
  }

  private detectCompression(newContextSize: number): CompressionInfo | undefined {
    if (this.previousContextSize > 0 && newContextSize < this.previousContextSize * 0.7) {
      return {
        originalSize: this.previousContextSize,
        compressedSize: newContextSize,
        ratio: newContextSize / this.previousContextSize,
        method: 'detected_reduction',
      };
    }
    return undefined;
  }

  /**
   * Rough token estimation (~4 chars per token for English, ~2 for CJK)
   */
  private estimateTokens(text: string): number {
    if (!text) {return 0;}
    // Count CJK characters
    const cjkCount = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
    const otherCount = text.length - cjkCount;
    return Math.ceil(otherCount / 4 + cjkCount / 2);
  }

  dispose(): void {
    this.stopCapture();
    this.outputChannel.dispose();
  }
}
