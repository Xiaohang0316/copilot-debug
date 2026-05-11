/**
 * Mock implementation of the vscode module for unit testing.
 * Only the APIs used by our extension are mocked.
 */

export class EventEmitter<T> {
  private listeners: ((e: T) => void)[] = [];

  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
  };

  fire(data: T): void {
    for (const listener of this.listeners) {
      listener(data);
    }
  }

  dispose(): void {
    this.listeners = [];
  }
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class TreeItem {
  label: string;
  collapsibleState: TreeItemCollapsibleState;
  description?: string;
  tooltip?: MarkdownString | string;
  iconPath?: ThemeIcon;
  contextValue?: string;
  command?: { command: string; title: string; arguments?: unknown[] };
  children?: TreeItem[];

  constructor(label: string, collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export class ThemeIcon {
  constructor(public readonly id: string, public readonly color?: ThemeColor) {}
}

export class ThemeColor {
  constructor(public readonly id: string) {}
}

export class MarkdownString {
  value: string;
  constructor(value?: string) {
    this.value = value || '';
  }
}

export class Uri {
  static file(path: string): Uri {
    return new Uri('file', '', path, '', '');
  }
  static parse(value: string): Uri {
    return new Uri('', '', value, '', '');
  }
  constructor(
    public readonly scheme: string,
    public readonly authority: string,
    public readonly path: string,
    public readonly query: string,
    public readonly fragment: string,
  ) {}
  get fsPath(): string { return this.path; }
  toString(): string { return `${this.scheme}://${this.path}`; }
}

export class Location {
  constructor(public readonly uri: Uri, public readonly range: Range) {}
}

export class Position {
  constructor(public readonly line: number, public readonly character: number) {}
}

export class Range {
  constructor(
    public readonly start: Position,
    public readonly end: Position,
  ) {}
}

export class Selection extends Range {
  constructor(
    public readonly anchor: Position,
    public readonly active: Position,
  ) {
    super(anchor, active);
  }
}

export enum LanguageModelChatMessageRole {
  User = 1,
  Assistant = 2,
}

export class LanguageModelChatMessage {
  constructor(public readonly role: LanguageModelChatMessageRole, public readonly content: { value: string }[]) {}

  static User(text: string): LanguageModelChatMessage {
    return new LanguageModelChatMessage(LanguageModelChatMessageRole.User, [{ value: text }]);
  }

  static Assistant(text: string): LanguageModelChatMessage {
    return new LanguageModelChatMessage(LanguageModelChatMessageRole.Assistant, [{ value: text }]);
  }
}

export class ChatRequestTurn {
  constructor(public readonly prompt: string, public readonly command?: string) {}
}

export class ChatResponseTurn {
  constructor(public readonly response: ChatResponseMarkdownPart[]) {}
}

export class ChatResponseMarkdownPart {
  constructor(public readonly value: MarkdownString) {}
}

export const window = {
  createOutputChannel: (_name: string, _options?: unknown) => ({
    appendLine: (_text: string) => {},
    append: (_text: string) => {},
    show: () => {},
    dispose: () => {},
  }),
  createTreeView: (_id: string, _options: unknown) => ({
    dispose: () => {},
  }),
  showInformationMessage: async (..._args: unknown[]) => undefined,
  showWarningMessage: async (..._args: unknown[]) => undefined,
  showErrorMessage: async (..._args: unknown[]) => undefined,
  showQuickPick: async (..._args: unknown[]) => undefined,
  showSaveDialog: async (..._args: unknown[]) => undefined,
  showOpenDialog: async (..._args: unknown[]) => undefined,
  createWebviewPanel: (_viewType: string, title: string, _column: unknown, _options: unknown) => ({
    title,
    webview: { html: '' },
    reveal: () => {},
    onDidDispose: () => ({ dispose: () => {} }),
    dispose: () => {},
  }),
  createStatusBarItem: () => ({
    text: '',
    tooltip: '',
    command: '',
    backgroundColor: undefined as unknown,
    show: () => {},
    dispose: () => {},
  }),
  onDidChangeActiveTextEditor: (_cb: unknown) => ({ dispose: () => {} }),
  onDidOpenTerminal: (_cb: unknown) => ({ dispose: () => {} }),
  onDidChangeVisibleTextEditors: (_cb: unknown) => ({ dispose: () => {} }),
  onDidChangeTextEditorSelection: (_cb: unknown) => ({ dispose: () => {} }),
};

export const commands = {
  registerCommand: (_command: string, _callback: (...args: unknown[]) => unknown) => ({
    dispose: () => {},
  }),
  executeCommand: async (_command: string, ..._args: unknown[]) => undefined,
};

export const workspace = {
  onDidChangeTextDocument: (_cb: unknown) => ({ dispose: () => {} }),
  fs: {
    readFile: async (_uri: Uri) => Buffer.from(''),
    writeFile: async (_uri: Uri, _content: Uint8Array) => {},
  },
};

export const languages = {
  onDidChangeDiagnostics: (_cb: unknown) => ({ dispose: () => {} }),
  getDiagnostics: (_uri: Uri) => [],
};

export const lm = {
  selectChatModels: async (_options?: unknown) => [],
  onDidChangeChatModels: (_cb: unknown) => ({ dispose: () => {} }),
};

export const chat = {
  createChatParticipant: (_id: string, _handler: unknown) => ({
    iconPath: undefined as unknown,
    dispose: () => {},
  }),
};

export const env = {
  language: 'en',
};

export enum ViewColumn {
  Beside = -2,
  Active = -1,
  One = 1,
}
