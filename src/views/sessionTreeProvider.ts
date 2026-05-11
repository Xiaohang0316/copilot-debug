import * as vscode from 'vscode';
import { SessionStore } from '../sessionStore';
import { CopilotSession } from '../types';

export class SessionTreeProvider implements vscode.TreeDataProvider<SessionItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SessionItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private selectedSessionId: string | undefined;

  constructor(private store: SessionStore) {
    store.onDidChange(() => this._onDidChangeTreeData.fire(undefined));
  }

  getSelectedSessionId(): string | undefined {
    return this.selectedSessionId;
  }

  selectSession(id: string): void {
    this.selectedSessionId = id;
    this._onDidChangeTreeData.fire(undefined);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: SessionItem): vscode.TreeItem {
    return element;
  }

  getChildren(): SessionItem[] {
    return this.store.getAllSessions().map(session => {
      const isActive = this.store.getActiveSession()?.id === session.id;
      const isSelected = this.selectedSessionId === session.id;
      return new SessionItem(session, isActive, isSelected);
    });
  }
}

export class SessionItem extends vscode.TreeItem {
  constructor(
    public readonly session: CopilotSession,
    isActive: boolean,
    isSelected: boolean,
  ) {
    super(session.label, vscode.TreeItemCollapsibleState.None);

    const startTime = new Date(session.startTime).toLocaleTimeString();
    const steps = session.steps.length;
    const tokens = session.totalInputTokens + session.totalOutputTokens;

    this.description = `${startTime} | ${steps} steps | ${formatTokens(tokens)} tokens`;
    this.tooltip = new vscode.MarkdownString(
      `**${session.label}**\n\n` +
      `- Start: ${new Date(session.startTime).toLocaleString()}\n` +
      `- Steps: ${steps}\n` +
      `- Input tokens: ${formatTokens(session.totalInputTokens)}\n` +
      `- Output tokens: ${formatTokens(session.totalOutputTokens)}\n` +
      (session.endTime ? `- Duration: ${formatDuration(session.endTime - session.startTime)}` : '- Status: Active')
    );

    if (isActive) {
      this.iconPath = new vscode.ThemeIcon('record', new vscode.ThemeColor('charts.red'));
    } else {
      this.iconPath = new vscode.ThemeIcon('history');
    }

    if (isSelected) {
      this.contextValue = 'session-selected';
    }

    this.command = {
      command: 'copilotDebugger.selectSession',
      title: 'Select Session',
      arguments: [session.id],
    };
  }
}

function formatTokens(n: number): string {
  if (n >= 1000000) {return (n / 1000000).toFixed(1) + 'M';}
  if (n >= 1000) {return (n / 1000).toFixed(1) + 'K';}
  return n.toString();
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) {return `${s}s`;}
  const m = Math.floor(s / 60);
  if (m < 60) {return `${m}m ${s % 60}s`;}
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
