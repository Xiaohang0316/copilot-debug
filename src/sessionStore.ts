import * as vscode from 'vscode';
import { CopilotSession, CopilotStep, SessionStats } from './types';

export class SessionStore {
  private sessions: Map<string, CopilotSession> = new Map();
  private activeSessionId: string | null = null;
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  createSession(label?: string): CopilotSession {
    const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const session: CopilotSession = {
      id,
      startTime: Date.now(),
      steps: [],
      totalInputTokens: 0,
      totalOutputTokens: 0,
      label: label || `Session ${this.sessions.size + 1}`,
    };
    this.sessions.set(id, session);
    this.activeSessionId = id;
    this._onDidChange.fire();
    return session;
  }

  getActiveSession(): CopilotSession | undefined {
    if (!this.activeSessionId) {return undefined;}
    return this.sessions.get(this.activeSessionId);
  }

  endSession(id?: string): void {
    const sessionId = id || this.activeSessionId;
    if (!sessionId) {return;}
    const session = this.sessions.get(sessionId);
    if (session) {
      session.endTime = Date.now();
      if (sessionId === this.activeSessionId) {
        this.activeSessionId = null;
      }
      this._onDidChange.fire();
    }
  }

  addStep(step: CopilotStep): void {
    const session = this.sessions.get(step.sessionId);
    if (!session) {return;}

    session.steps.push(step);
    if (step.direction === 'input') {
      session.totalInputTokens += step.tokenCount;
    } else {
      session.totalOutputTokens += step.tokenCount;
    }
    this._onDidChange.fire();
  }

  getSession(id: string): CopilotSession | undefined {
    return this.sessions.get(id);
  }

  getAllSessions(): CopilotSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.startTime - a.startTime);
  }

  getSessionStats(id: string): SessionStats | undefined {
    const session = this.sessions.get(id);
    if (!session) {return undefined;}

    const compressionSteps = session.steps.filter(s => s.compressionInfo);
    const toolCalls = session.steps.filter(s => s.type === 'tool_call');
    const toolCountMap = new Map<string, number>();
    for (const tc of toolCalls) {
      const name = tc.metadata.toolName || 'unknown';
      toolCountMap.set(name, (toolCountMap.get(name) || 0) + 1);
    }

    let peakContextSize = 0;
    let totalContextSize = 0;
    for (const step of session.steps) {
      if (step.contextSize > peakContextSize) {
        peakContextSize = step.contextSize;
      }
      totalContextSize += step.contextSize;
    }

    const avgCompressionRatio = compressionSteps.length > 0
      ? compressionSteps.reduce((sum, s) => sum + (s.compressionInfo?.ratio || 0), 0) / compressionSteps.length
      : 0;

    return {
      totalSteps: session.steps.length,
      totalInputTokens: session.totalInputTokens,
      totalOutputTokens: session.totalOutputTokens,
      totalContextSize,
      peakContextSize,
      compressionEvents: compressionSteps.length,
      avgCompressionRatio,
      duration: (session.endTime || Date.now()) - session.startTime,
      toolCalls: Array.from(toolCountMap.entries()).map(([name, count]) => ({ name, count })),
    };
  }

  clearAll(): void {
    this.sessions.clear();
    this.activeSessionId = null;
    this._onDidChange.fire();
  }

  exportSession(id: string): object | undefined {
    const session = this.sessions.get(id);
    if (!session) {return undefined;}
    return {
      ...session,
      stats: this.getSessionStats(id),
    };
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
