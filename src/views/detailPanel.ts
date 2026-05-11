import * as vscode from 'vscode';
import { CopilotStep } from '../types';
import { SessionStore } from '../sessionStore';
import { t } from '../i18n';

export class DetailPanel {
  private panel: vscode.WebviewPanel | undefined;

  constructor(private store: SessionStore) {}

  show(step: CopilotStep): void {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'copilotDebugger.detail',
        'Copilot Step Detail',
        vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true },
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
    }

    this.panel.title = `Step: ${step.type}`;
    this.panel.webview.html = this.getHtml(step);
    this.panel.reveal(vscode.ViewColumn.Beside, true);
  }

  showSessionOverview(sessionId: string): void {
    const session = this.store.getSession(sessionId);
    const stats = this.store.getSessionStats(sessionId);
    if (!session || !stats) {return;}

    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'copilotDebugger.detail',
        'Session Overview',
        vscode.ViewColumn.Beside,
        { enableScripts: true, retainContextWhenHidden: true },
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
    }

    this.panel.title = `Session: ${session.label}`;
    this.panel.webview.html = this.getSessionHtml(session, stats);
    this.panel.reveal(vscode.ViewColumn.Beside, true);
  }

  private getHtml(step: CopilotStep): string {
    const compressionHtml = step.compressionInfo
      ? `
      <div class="card compression">
        <h3>${t('detail.compression_info')}</h3>
        <div class="stat-grid">
          <div class="stat">
            <span class="stat-label">${t('detail.original_size')}</span>
            <span class="stat-value">${step.compressionInfo.originalSize} tokens</span>
          </div>
          <div class="stat">
            <span class="stat-label">${t('detail.compressed_size')}</span>
            <span class="stat-value">${step.compressionInfo.compressedSize} tokens</span>
          </div>
          <div class="stat">
            <span class="stat-label">${t('detail.ratio')}</span>
            <span class="stat-value">${(step.compressionInfo.ratio * 100).toFixed(1)}%</span>
          </div>
          <div class="stat">
            <span class="stat-label">${t('detail.method')}</span>
            <span class="stat-value">${escapeHtml(step.compressionInfo.method)}</span>
          </div>
        </div>
        <div class="compression-bar">
          <div class="compression-fill" style="width: ${step.compressionInfo.ratio * 100}%"></div>
        </div>
      </div>`
      : '';

    const metadataHtml = Object.entries(step.metadata)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `<tr><td class="meta-key">${escapeHtml(k)}</td><td>${escapeHtml(String(v))}</td></tr>`)
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root {
    --bg: var(--vscode-editor-background);
    --fg: var(--vscode-editor-foreground);
    --border: var(--vscode-panel-border);
    --accent: var(--vscode-textLink-foreground);
    --card-bg: var(--vscode-editorWidget-background);
  }
  body { font-family: var(--vscode-font-family); color: var(--fg); background: var(--bg); padding: 16px; margin: 0; }
  h2 { margin-top: 0; color: var(--accent); }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; margin-right: 6px; }
  .badge-input { background: #264f78; color: #9cdcfe; }
  .badge-output { background: #2d4a2d; color: #89d185; }
  .badge-type { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 6px; padding: 16px; margin-bottom: 12px; }
  .card h3 { margin-top: 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7; }
  .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .stat { display: flex; flex-direction: column; }
  .stat-label { font-size: 11px; opacity: 0.6; text-transform: uppercase; }
  .stat-value { font-size: 18px; font-weight: 600; color: var(--accent); }
  .compression-bar { height: 8px; background: #333; border-radius: 4px; overflow: hidden; margin-top: 8px; }
  .compression-fill { height: 100%; background: linear-gradient(90deg, #e74c3c, #f39c12); border-radius: 4px; }
  .content-block { background: var(--vscode-textCodeBlock-background); border: 1px solid var(--border); border-radius: 4px; padding: 12px; font-family: var(--vscode-editor-font-family); font-size: 12px; white-space: pre-wrap; word-break: break-all; max-height: 400px; overflow-y: auto; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 4px 8px; border-bottom: 1px solid var(--border); font-size: 12px; }
  .meta-key { font-weight: 600; width: 120px; opacity: 0.7; }
  .compression { border-left: 3px solid #e74c3c; }
  .timeline-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
  .dot-input { background: #4fc1ff; }
  .dot-output { background: #89d185; }
</style>
</head>
<body>
  <h2>
    <span class="timeline-dot ${step.direction === 'input' ? 'dot-input' : 'dot-output'}"></span>
    ${escapeHtml(step.type.replace(/_/g, ' ').toUpperCase())}
  </h2>
  <div>
    <span class="badge badge-${step.direction}">${step.direction}</span>
    <span class="badge badge-type">${escapeHtml(step.type)}</span>
  </div>

  <div class="card" style="margin-top: 12px;">
    <h3>${t('detail.metrics')}</h3>
    <div class="stat-grid">
      <div class="stat">
        <span class="stat-label">${t('detail.token_count')}</span>
        <span class="stat-value">${step.tokenCount}</span>
      </div>
      <div class="stat">
        <span class="stat-label">${t('detail.context_size')}</span>
        <span class="stat-value">${step.contextSize}</span>
      </div>
      <div class="stat">
        <span class="stat-label">${t('detail.timestamp')}</span>
        <span class="stat-value" style="font-size:13px">${new Date(step.timestamp).toLocaleString()}</span>
      </div>
      <div class="stat">
        <span class="stat-label">${t('detail.step_id')}</span>
        <span class="stat-value" style="font-size:13px">${escapeHtml(step.id)}</span>
      </div>
    </div>
  </div>

  ${compressionHtml}

  ${metadataHtml ? `
  <div class="card">
    <h3>${t('detail.metadata')}</h3>
    <table>${metadataHtml}</table>
  </div>` : ''}

  <div class="card">
    <h3>${t('detail.content')}</h3>
    <div class="content-block">${escapeHtml(step.content)}</div>
  </div>
</body>
</html>`;
  }

  private getSessionHtml(session: import('../types').CopilotSession, stats: import('../types').SessionStats): string {
    const contextTimeline = session.steps.map((s, i) => ({
      index: i,
      contextSize: s.contextSize,
      type: s.type,
      isCompression: !!s.compressionInfo,
    }));

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root { --bg: var(--vscode-editor-background); --fg: var(--vscode-editor-foreground); --border: var(--vscode-panel-border); --accent: var(--vscode-textLink-foreground); --card-bg: var(--vscode-editorWidget-background); }
  body { font-family: var(--vscode-font-family); color: var(--fg); background: var(--bg); padding: 16px; margin: 0; }
  h2 { margin-top: 0; color: var(--accent); }
  .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 6px; padding: 16px; margin-bottom: 12px; }
  .card h3 { margin-top: 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7; }
  .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .stat { display: flex; flex-direction: column; }
  .stat-label { font-size: 11px; opacity: 0.6; text-transform: uppercase; }
  .stat-value { font-size: 20px; font-weight: 600; color: var(--accent); }
  canvas { width: 100%; height: 200px; }
  .tool-bar { display: flex; align-items: center; margin: 4px 0; }
  .tool-bar-fill { height: 16px; background: var(--accent); border-radius: 3px; margin-right: 8px; }
  .tool-name { font-size: 12px; min-width: 120px; }
  .tool-count { font-size: 12px; opacity: 0.7; }
</style>
</head>
<body>
  <h2>${escapeHtml(session.label)}</h2>

  <div class="card">
    <h3>${t('detail.overview')}</h3>
    <div class="stat-grid">
      <div class="stat">
        <span class="stat-label">${t('stats.total_steps')}</span>
        <span class="stat-value">${stats.totalSteps}</span>
      </div>
      <div class="stat">
        <span class="stat-label">${t('stats.input_tokens')}</span>
        <span class="stat-value">${formatNumber(stats.totalInputTokens)}</span>
      </div>
      <div class="stat">
        <span class="stat-label">${t('stats.output_tokens')}</span>
        <span class="stat-value">${formatNumber(stats.totalOutputTokens)}</span>
      </div>
      <div class="stat">
        <span class="stat-label">${t('stats.peak_context')}</span>
        <span class="stat-value">${formatNumber(stats.peakContextSize)}</span>
      </div>
      <div class="stat">
        <span class="stat-label">${t('stats.compression_events')}</span>
        <span class="stat-value">${stats.compressionEvents}</span>
      </div>
      <div class="stat">
        <span class="stat-label">${t('stats.duration')}</span>
        <span class="stat-value">${formatDuration(stats.duration)}</span>
      </div>
    </div>
  </div>

  <div class="card">
    <h3>${t('detail.context_over_time')}</h3>
    <canvas id="chart"></canvas>
  </div>

  ${stats.toolCalls.length > 0 ? `
  <div class="card">
    <h3>${t('detail.tool_distribution')}</h3>
    ${stats.toolCalls.sort((a, b) => b.count - a.count).map(tc => {
      const maxCount = Math.max(...stats.toolCalls.map(t => t.count));
      const pct = (tc.count / maxCount) * 100;
      return `<div class="tool-bar">
        <span class="tool-name">${escapeHtml(tc.name)}</span>
        <div class="tool-bar-fill" style="width: ${pct}%; min-width: 4px;"></div>
        <span class="tool-count">${tc.count}</span>
      </div>`;
    }).join('')}
  </div>` : ''}

  <script>
    const data = ${JSON.stringify(contextTimeline)};
    const canvas = document.getElementById('chart');
    if (canvas && data.length > 0) {
      const ctx = canvas.getContext('2d');
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * 2;
      canvas.height = 400;

      const maxCtx = Math.max(...data.map(d => d.contextSize), 1);
      const w = canvas.width;
      const h = canvas.height;
      const padY = 30;
      const padX = 50;

      // Draw grid
      ctx.strokeStyle = 'rgba(128,128,128,0.2)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = padY + (h - 2 * padY) * (1 - i / 4);
        ctx.beginPath();
        ctx.moveTo(padX, y);
        ctx.lineTo(w - 10, y);
        ctx.stroke();
        ctx.fillStyle = 'rgba(128,128,128,0.5)';
        ctx.font = '18px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(Math.round(maxCtx * i / 4).toString(), padX - 6, y + 5);
      }

      // Draw line
      ctx.beginPath();
      ctx.strokeStyle = '#4fc1ff';
      ctx.lineWidth = 2;
      data.forEach((d, i) => {
        const x = padX + (i / Math.max(data.length - 1, 1)) * (w - padX - 10);
        const y = padY + (h - 2 * padY) * (1 - d.contextSize / maxCtx);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Draw compression markers
      ctx.fillStyle = '#e74c3c';
      data.forEach((d, i) => {
        if (d.isCompression) {
          const x = padX + (i / Math.max(data.length - 1, 1)) * (w - padX - 10);
          const y = padY + (h - 2 * padY) * (1 - d.contextSize / maxCtx);
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }
  </script>
</body>
</html>`;
  }

  dispose(): void {
    this.panel?.dispose();
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
