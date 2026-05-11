import * as vscode from 'vscode';
import { SessionStore } from '../sessionStore';
import { CopilotStep, StepType } from '../types';
import { t } from '../i18n';

export class StepTreeProvider implements vscode.TreeDataProvider<StepItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<StepItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private sessionId: string | undefined;

  constructor(private store: SessionStore) {
    store.onDidChange(() => this._onDidChangeTreeData.fire(undefined));
  }

  setSessionId(id: string | undefined): void {
    this.sessionId = id;
    this._onDidChangeTreeData.fire(undefined);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: StepItem): vscode.TreeItem {
    return element;
  }

  getChildren(): StepItem[] {
    if (!this.sessionId) {
      return [];
    }
    const session = this.store.getSession(this.sessionId);
    if (!session) {return [];}

    return session.steps.map((step, index) => new StepItem(step, index));
  }
}

const STEP_ICONS: Record<StepType, { icon: string; color?: string }> = {
  user_prompt: { icon: 'comment', color: 'charts.blue' },
  system_prompt: { icon: 'settings-gear', color: 'charts.purple' },
  assistant_response: { icon: 'hubot', color: 'charts.green' },
  tool_call: { icon: 'tools', color: 'charts.orange' },
  tool_result: { icon: 'output', color: 'charts.yellow' },
  context_injection: { icon: 'file-code', color: 'charts.blue' },
  compression: { icon: 'fold', color: 'charts.red' },
  unknown: { icon: 'question' },
};

function getStepLabel(type: StepType): string {
  const key = `step.${type}` as const;
  return t(key);
}

export class StepItem extends vscode.TreeItem {
  constructor(
    public readonly step: CopilotStep,
    index: number,
  ) {
    super(`#${index + 1} ${getStepLabel(step.type)}`, vscode.TreeItemCollapsibleState.None);

    const time = new Date(step.timestamp).toLocaleTimeString();
    const direction = step.direction === 'input' ? '\u2192' : '\u2190';
    const tokens = step.tokenCount;
    const ctx = step.contextSize;

    this.description = `${time} ${direction} ${tokens} tok | ctx: ${ctx}`;

    const iconInfo = STEP_ICONS[step.type];
    this.iconPath = new vscode.ThemeIcon(
      iconInfo.icon,
      iconInfo.color ? new vscode.ThemeColor(iconInfo.color) : undefined,
    );

    // Build tooltip
    const lines = [
      `**${getStepLabel(step.type)}** (${step.direction})`,
      '',
      `- Time: ${new Date(step.timestamp).toLocaleString()}`,
      `- Tokens: ${tokens}`,
      `- Context size: ${ctx}`,
    ];
    if (step.compressionInfo) {
      lines.push(
        `- **Compression**: ${step.compressionInfo.originalSize} \u2192 ${step.compressionInfo.compressedSize} (${(step.compressionInfo.ratio * 100).toFixed(1)}%)`,
        `- Method: ${step.compressionInfo.method}`,
      );
    }
    if (step.metadata.toolName) {
      lines.push(`- Tool: ${step.metadata.toolName}`);
    }
    if (step.metadata.filePath) {
      lines.push(`- File: ${step.metadata.filePath}`);
    }
    lines.push('', '---', '', step.content.slice(0, 300) + (step.content.length > 300 ? '...' : ''));

    this.tooltip = new vscode.MarkdownString(lines.join('\n'));

    this.command = {
      command: 'copilotDebugger.showDetails',
      title: 'Show Step Details',
      arguments: [step],
    };
  }
}
