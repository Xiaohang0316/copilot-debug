import * as vscode from 'vscode';
import { SessionStore } from './sessionStore';
import { StepType } from './types';
import { t } from './i18n';

/**
 * Registers a @debug chat participant that proxies requests to Copilot's LM,
 * capturing the full input prompt and streamed output response.
 *
 * Usage: In VS Code Chat, type "@debug your question here"
 * The participant forwards to the Copilot model and logs every message.
 */
export class DebugChatParticipant implements vscode.Disposable {
  private participant: vscode.ChatParticipant;
  private runningContextSize = 0;
  private stepCounter = 0;

  constructor(private store: SessionStore) {
    this.participant = vscode.chat.createChatParticipant(
      'copilot-debugger.debug',
      this.handleRequest.bind(this),
    );
    this.participant.iconPath = new vscode.ThemeIcon('bug');
  }

  private async handleRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<void> {
    // Ensure we have an active session; create one if not
    let session = this.store.getActiveSession();
    if (!session) {
      session = this.store.createSession(t('session.debug_chat'));
    }

    // --- 1. Log history (prior turns as context) ---
    const historyMessages: vscode.LanguageModelChatMessage[] = [];
    let historyText = '';

    for (const turn of context.history) {
      if (turn instanceof vscode.ChatRequestTurn) {
        const msg = vscode.LanguageModelChatMessage.User(turn.prompt);
        historyMessages.push(msg);
        historyText += `[user] ${turn.prompt}\n`;
      } else if (turn instanceof vscode.ChatResponseTurn) {
        const parts: string[] = [];
        for (const part of turn.response) {
          if (part instanceof vscode.ChatResponseMarkdownPart) {
            parts.push(part.value.value);
          }
        }
        const text = parts.join('');
        historyMessages.push(vscode.LanguageModelChatMessage.Assistant(text));
        historyText += `[assistant] ${text}\n`;
      }
    }

    if (historyText) {
      this.addStep(session.id, {
        type: 'context_injection',
        direction: 'input',
        content: historyText,
        metadata: { source: 'chat_history', turnCount: context.history.length },
      });
    }

    // --- 2. Log the current user prompt (the actual input) ---
    const userPrompt = request.prompt;
    const references = request.references || [];
    let refText = '';
    for (const ref of references) {
      const refValue = ref.value;
      if (refValue instanceof vscode.Uri) {
        refText += `\n[ref: ${refValue.fsPath}]`;
      } else if (refValue instanceof vscode.Location) {
        refText += `\n[ref: ${refValue.uri.fsPath}:${refValue.range.start.line}-${refValue.range.end.line}]`;
      }
    }

    const fullUserInput = userPrompt + refText;
    this.addStep(session.id, {
      type: 'user_prompt',
      direction: 'input',
      content: fullUserInput,
      metadata: {
        command: request.command || undefined,
        referenceCount: references.length,
        model: request.model?.id,
      },
    });

    // --- 3. Select a language model and send request ---
    let models: vscode.LanguageModelChat[];
    try {
      models = await vscode.lm.selectChatModels({
        vendor: 'copilot',
        family: 'gpt-4o',
      });
      if (models.length === 0) {
        // Fallback: try any copilot model
        models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
      }
    } catch {
      models = [];
    }

    if (models.length === 0) {
      stream.markdown(t('chat.no_model'));
      this.addStep(session.id, {
        type: 'assistant_response',
        direction: 'output',
        content: '[ERROR] No Copilot language model available',
        metadata: {},
      });
      return;
    }

    const model = models[0];

    // Log system info
    this.addStep(session.id, {
      type: 'system_prompt',
      direction: 'input',
      content: `Model: ${model.id}\nFamily: ${model.family}\nVersion: ${model.version}\nMax Input Tokens: ${model.maxInputTokens}`,
      metadata: {
        model: model.id,
        family: model.family,
        version: model.version,
        maxInputTokens: model.maxInputTokens,
      },
    });

    // Build messages array
    const messages = [
      ...historyMessages,
      vscode.LanguageModelChatMessage.User(userPrompt),
    ];

    // Log the full request (all messages sent to the model)
    const requestSummary = messages.map((m, i) => {
      const role = m.role === vscode.LanguageModelChatMessageRole.User ? 'user' : 'assistant';
      // Extract text from message parts
      let text = '';
      for (const part of m.content) {
        if (typeof part === 'string') {
          text += part;
        } else if ('value' in part && typeof part.value === 'string') {
          text += part.value;
        } else {
          text += JSON.stringify(part);
        }
      }
      return `[${i}] ${role}: ${text}`;
    }).join('\n---\n');

    const inputTokenEstimate = this.estimateTokens(requestSummary);
    this.runningContextSize = inputTokenEstimate;

    this.addStep(session.id, {
      type: 'context_injection',
      direction: 'input',
      content: `Full LM Request (${messages.length} messages):\n\n${requestSummary}`,
      metadata: {
        messageCount: messages.length,
        estimatedInputTokens: inputTokenEstimate,
        model: model.id,
      },
    });

    // --- 4. Send request and stream response ---
    const startTime = Date.now();
    let fullResponse = '';

    try {
      const chatResponse = await model.sendRequest(messages, {}, token);

      for await (const fragment of chatResponse.text) {
        fullResponse += fragment;
        stream.markdown(fragment);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      fullResponse = `[ERROR] ${errorMsg}`;
      stream.markdown(`\n\n*Error: ${errorMsg}*`);
    }

    const duration = Date.now() - startTime;

    // --- 5. Log the full output response ---
    this.addStep(session.id, {
      type: 'assistant_response',
      direction: 'output',
      content: fullResponse,
      duration,
      metadata: {
        model: model.id,
        durationMs: duration,
        outputLength: fullResponse.length,
        estimatedOutputTokens: this.estimateTokens(fullResponse),
      },
    });

    // --- 6. Show debug summary in chat ---
    const outputTokens = this.estimateTokens(fullResponse);
    stream.markdown(
      `\n\n---\n*${t('chat.debug_summary', inputTokenEstimate, outputTokens, duration, model.id)}*`,
    );
  }

  private addStep(
    sessionId: string,
    params: {
      type: StepType;
      direction: 'input' | 'output';
      content: string;
      duration?: number;
      metadata: Record<string, unknown>;
    },
  ): void {
    const tokenCount = this.estimateTokens(params.content);
    if (params.direction === 'input') {
      this.runningContextSize += tokenCount;
    }

    this.store.addStep({
      id: `chat_${++this.stepCounter}`,
      sessionId,
      timestamp: Date.now(),
      type: params.type,
      direction: params.direction,
      content: params.content,
      tokenCount,
      contextSize: this.runningContextSize,
      duration: params.duration,
      metadata: params.metadata,
    });
  }

  private estimateTokens(text: string): number {
    if (!text) { return 0; }
    const cjkCount = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
    const otherCount = text.length - cjkCount;
    return Math.ceil(otherCount / 4 + cjkCount / 2);
  }

  dispose(): void {
    this.participant.dispose();
  }
}
