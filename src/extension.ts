import * as vscode from 'vscode';
import { SessionStore } from './sessionStore';
import { CopilotInterceptor } from './interceptor';
import { DebugChatParticipant } from './chatParticipant';
import { CopilotLogWatcher } from './logWatcher';
import { SessionTreeProvider } from './views/sessionTreeProvider';
import { StepTreeProvider } from './views/stepTreeProvider';
import { StatsTreeProvider } from './views/statsTreeProvider';
import { DetailPanel } from './views/detailPanel';
import { initI18n, t } from './i18n';

export function activate(context: vscode.ExtensionContext) {
  initI18n();

  const store = new SessionStore();
  const interceptor = new CopilotInterceptor(store);
  const detailPanel = new DetailPanel(store);
  const chatParticipant = new DebugChatParticipant(store);
  const logWatcher = new CopilotLogWatcher(store);

  // Tree view providers
  const sessionProvider = new SessionTreeProvider(store);
  const stepProvider = new StepTreeProvider(store);
  const statsProvider = new StatsTreeProvider(store);

  // Register tree views
  context.subscriptions.push(
    vscode.window.createTreeView('copilotDebugger.sessions', {
      treeDataProvider: sessionProvider,
      showCollapseAll: false,
    }),
    vscode.window.createTreeView('copilotDebugger.steps', {
      treeDataProvider: stepProvider,
      showCollapseAll: true,
    }),
    vscode.window.createTreeView('copilotDebugger.stats', {
      treeDataProvider: statsProvider,
      showCollapseAll: true,
    }),
  );

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('copilotDebugger.startCapture', () => {
      interceptor.startCapture();
      logWatcher.startWatching();
      vscode.window.showInformationMessage(t('capture.started'));
    }),

    vscode.commands.registerCommand('copilotDebugger.stopCapture', () => {
      interceptor.stopCapture();
      logWatcher.stopWatching();
      vscode.window.showInformationMessage(t('capture.stopped'));
    }),

    vscode.commands.registerCommand('copilotDebugger.startLogWatch', () => {
      if (!store.getActiveSession()) {
        store.createSession(t('session.log_watch'));
      }
      logWatcher.startWatching();
      vscode.window.showInformationMessage(t('capture.log_started'));
    }),

    vscode.commands.registerCommand('copilotDebugger.stopLogWatch', () => {
      logWatcher.stopWatching();
      vscode.window.showInformationMessage(t('capture.log_stopped'));
    }),

    vscode.commands.registerCommand('copilotDebugger.selectSession', (sessionId: string) => {
      sessionProvider.selectSession(sessionId);
      stepProvider.setSessionId(sessionId);
      statsProvider.setSessionId(sessionId);
    }),

    vscode.commands.registerCommand('copilotDebugger.showDetails', (step) => {
      detailPanel.show(step);
    }),

    vscode.commands.registerCommand('copilotDebugger.clearSessions', async () => {
      const choice = await vscode.window.showWarningMessage(
        t('clear.confirm'),
        { modal: true },
        t('clear.button'),
      );
      if (choice === t('clear.button')) {
        if (interceptor.isCapturing()) {
          interceptor.stopCapture();
        }
        logWatcher.stopWatching();
        store.clearAll();
        stepProvider.setSessionId(undefined);
        statsProvider.setSessionId(undefined);
        vscode.window.showInformationMessage(t('clear.done'));
      }
    }),

    vscode.commands.registerCommand('copilotDebugger.exportSession', async () => {
      const sessions = store.getAllSessions();
      if (sessions.length === 0) {
        vscode.window.showWarningMessage(t('export.no_sessions'));
        return;
      }

      const picks = sessions.map(s => ({
        label: s.label,
        description: `${s.steps.length} steps | ${new Date(s.startTime).toLocaleString()}`,
        sessionId: s.id,
      }));

      const selected = await vscode.window.showQuickPick(picks, {
        placeHolder: t('export.select'),
      });
      if (!selected) { return; }

      const data = store.exportSession(selected.sessionId);
      if (!data) { return; }

      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`copilot-session-${Date.now()}.json`),
        filters: { 'JSON': ['json'] },
      });
      if (!uri) { return; }

      const content = JSON.stringify(data, null, 2);
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
      vscode.window.showInformationMessage(t('export.done', uri.fsPath));
    }),

    vscode.commands.registerCommand('copilotDebugger.refreshViews', () => {
      sessionProvider.refresh();
      stepProvider.refresh();
      statsProvider.refresh();
    }),

    vscode.commands.registerCommand('copilotDebugger.importLog', async () => {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'Log/JSON': ['log', 'json', 'txt'] },
        openLabel: 'Import Log',
      });
      if (!uris || uris.length === 0) { return; }

      const content = await vscode.workspace.fs.readFile(uris[0]);
      const text = Buffer.from(content).toString('utf-8');

      try {
        const parsed = JSON.parse(text);
        if (parsed.steps && Array.isArray(parsed.steps)) {
          const fileName = uris[0].path.split('/').pop() || '';
          const session = store.createSession(t('session.imported', fileName));
          for (const step of parsed.steps) {
            store.addStep({ ...step, sessionId: session.id });
          }
          store.endSession(session.id);
          vscode.window.showInformationMessage(t('import.steps_done', parsed.steps.length));
          return;
        }
      } catch {
        // Not JSON, parse as log lines
      }

      const lines = text.split('\n').filter(l => l.trim());
      const fileName = uris[0].path.split('/').pop() || '';
      const session = store.createSession(t('session.log', fileName));
      let stepCount = 0;
      for (const line of lines) {
        const parsed = interceptor.parseLogLine(line);
        if (parsed) {
          interceptor.addManualStep({
            type: parsed.type || 'unknown',
            direction: parsed.direction || 'input',
            content: parsed.content || line,
          });
          stepCount++;
        }
      }
      store.endSession(session.id);
      vscode.window.showInformationMessage(t('import.log_done', stepCount));
    }),
  );

  // Cleanup
  context.subscriptions.push(store, interceptor, detailPanel, chatParticipant, logWatcher);

  // Set initial context
  vscode.commands.executeCommand('setContext', 'copilotDebugger.capturing', false);

  // Status bar item
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'copilotDebugger.startCapture';
  statusBar.text = `$(debug-alt) ${t('statusbar.idle')}`;
  statusBar.tooltip = t('statusbar.idle_tooltip');
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Update status bar with live stats
  store.onDidChange(() => {
    const session = store.getActiveSession();
    if (session) {
      const total = session.totalInputTokens + session.totalOutputTokens;
      statusBar.text = `$(record) ${session.steps.length} steps | ${formatTokens(total)} tok`;
      statusBar.command = 'copilotDebugger.stopCapture';
      statusBar.tooltip = t('statusbar.capturing_tooltip');
      statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      statusBar.text = `$(debug-alt) ${t('statusbar.idle')}`;
      statusBar.command = 'copilotDebugger.startCapture';
      statusBar.tooltip = t('statusbar.idle_tooltip');
      statusBar.backgroundColor = undefined;
    }
  });

  console.log('Copilot Debugger extension activated');
}

export function deactivate() {}

function formatTokens(n: number): string {
  if (n >= 1000000) { return (n / 1000000).toFixed(1) + 'M'; }
  if (n >= 1000) { return (n / 1000).toFixed(1) + 'K'; }
  return n.toString();
}
