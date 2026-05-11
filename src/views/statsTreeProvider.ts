import * as vscode from 'vscode';
import { SessionStore } from '../sessionStore';
import { SessionStats } from '../types';
import { t } from '../i18n';

export class StatsTreeProvider implements vscode.TreeDataProvider<StatItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<StatItem | undefined>();
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

  getTreeItem(element: StatItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: StatItem): StatItem[] {
    if (element) {
      return element.children || [];
    }

    if (!this.sessionId) {
      return [new StatItem(t('stats.no_session'), '', 'info')];
    }

    const stats = this.store.getSessionStats(this.sessionId);
    if (!stats) {return [];}

    return this.buildStatItems(stats);
  }

  private buildStatItems(stats: SessionStats): StatItem[] {
    const items: StatItem[] = [];

    // Token usage section
    const tokenItem = new StatItem(t('stats.token_usage'), '', 'symbol-number');
    tokenItem.children = [
      new StatItem(t('stats.input_tokens'), formatNumber(stats.totalInputTokens), 'arrow-right'),
      new StatItem(t('stats.output_tokens'), formatNumber(stats.totalOutputTokens), 'arrow-left'),
      new StatItem(t('stats.total_tokens'), formatNumber(stats.totalInputTokens + stats.totalOutputTokens), 'symbol-number'),
    ];
    tokenItem.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
    items.push(tokenItem);

    // Context section
    const ctxItem = new StatItem(t('stats.context'), '', 'symbol-ruler');
    ctxItem.children = [
      new StatItem(t('stats.peak_context'), formatNumber(stats.peakContextSize) + ' tokens', 'graph'),
      new StatItem(t('stats.compression_events'), stats.compressionEvents.toString(), 'fold'),
    ];
    if (stats.avgCompressionRatio > 0) {
      ctxItem.children.push(
        new StatItem(t('stats.avg_compression'), (stats.avgCompressionRatio * 100).toFixed(1) + '%', 'percentage'),
      );
    }
    ctxItem.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
    items.push(ctxItem);

    // Execution section
    const execItem = new StatItem(t('stats.execution'), '', 'play');
    execItem.children = [
      new StatItem(t('stats.total_steps'), stats.totalSteps.toString(), 'list-ordered'),
      new StatItem(t('stats.duration'), formatDuration(stats.duration), 'clock'),
    ];
    execItem.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
    items.push(execItem);

    // Tool calls section
    if (stats.toolCalls.length > 0) {
      const toolItem = new StatItem(t('stats.tool_calls'), '', 'tools');
      toolItem.children = stats.toolCalls
        .sort((a, b) => b.count - a.count)
        .map(tc => new StatItem(tc.name, `x${tc.count}`, 'wrench'));
      toolItem.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
      items.push(toolItem);
    }

    return items;
  }
}

export class StatItem extends vscode.TreeItem {
  children?: StatItem[];

  constructor(
    label: string,
    value: string,
    icon: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = value;
    this.iconPath = new vscode.ThemeIcon(icon);
  }
}

function formatNumber(n: number): string {
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
