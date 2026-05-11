import * as assert from 'assert';
import { SessionStore } from '../../sessionStore';
import { StepTreeProvider, StepItem } from '../../views/stepTreeProvider';
import { CopilotStep, StepType } from '../../types';

function makeStep(sessionId: string, overrides: Partial<CopilotStep> = {}): CopilotStep {
  return {
    id: `step_${Math.random().toString(36).slice(2)}`,
    sessionId,
    timestamp: Date.now(),
    type: 'user_prompt',
    direction: 'input',
    content: 'test content',
    tokenCount: 100,
    contextSize: 500,
    metadata: {},
    ...overrides,
  };
}

describe('StepTreeProvider', () => {
  let store: SessionStore;
  let provider: StepTreeProvider;

  beforeEach(() => {
    store = new SessionStore();
    provider = new StepTreeProvider(store);
  });

  afterEach(() => {
    store.dispose();
  });

  describe('getChildren', () => {
    it('should return empty array when no session is selected', () => {
      const children = provider.getChildren();
      assert.strictEqual(children.length, 0);
    });

    it('should return empty array for nonexistent session id', () => {
      provider.setSessionId('nonexistent');
      const children = provider.getChildren();
      assert.strictEqual(children.length, 0);
    });

    it('should return steps for the selected session', () => {
      const session = store.createSession();
      store.addStep(makeStep(session.id));
      store.addStep(makeStep(session.id));
      provider.setSessionId(session.id);
      const children = provider.getChildren();
      assert.strictEqual(children.length, 2);
    });

    it('should create StepItem instances', () => {
      const session = store.createSession();
      store.addStep(makeStep(session.id));
      provider.setSessionId(session.id);
      const children = provider.getChildren();
      assert.ok(children[0] instanceof StepItem);
    });
  });

  describe('setSessionId', () => {
    it('should trigger tree data change', () => {
      let fired = false;
      provider.onDidChangeTreeData(() => { fired = true; });
      provider.setSessionId('test');
      assert.ok(fired);
    });

    it('should clear steps when set to undefined', () => {
      const session = store.createSession();
      store.addStep(makeStep(session.id));
      provider.setSessionId(session.id);
      assert.strictEqual(provider.getChildren().length, 1);

      provider.setSessionId(undefined);
      assert.strictEqual(provider.getChildren().length, 0);
    });
  });

  describe('auto-refresh on store change', () => {
    it('should refresh when a step is added to the active session', () => {
      const session = store.createSession();
      provider.setSessionId(session.id);
      let changeCount = 0;
      provider.onDidChangeTreeData(() => { changeCount++; });

      store.addStep(makeStep(session.id));
      assert.ok(changeCount > 0);
    });
  });
});

describe('StepItem', () => {
  const allStepTypes: StepType[] = [
    'user_prompt', 'system_prompt', 'assistant_response',
    'tool_call', 'tool_result', 'context_injection',
    'compression', 'unknown',
  ];

  it('should include step index in label', () => {
    const step = makeStep('s1', { type: 'user_prompt' });
    const item = new StepItem(step, 0);
    assert.ok((item.label as string).startsWith('#1 '));
  });

  it('should show correct index for third step', () => {
    const step = makeStep('s1');
    const item = new StepItem(step, 2);
    assert.ok((item.label as string).startsWith('#3 '));
  });

  it('should include direction arrow in description', () => {
    const inputStep = makeStep('s1', { direction: 'input' });
    const outputStep = makeStep('s1', { direction: 'output' });
    const inputItem = new StepItem(inputStep, 0);
    const outputItem = new StepItem(outputStep, 0);
    assert.ok(String(inputItem.description).includes('\u2192')); // →
    assert.ok(String(outputItem.description).includes('\u2190')); // ←
  });

  it('should include token count in description', () => {
    const step = makeStep('s1', { tokenCount: 42 });
    const item = new StepItem(step, 0);
    assert.ok(String(item.description).includes('42 tok'));
  });

  it('should include context size in description', () => {
    const step = makeStep('s1', { contextSize: 1000 });
    const item = new StepItem(step, 0);
    assert.ok(String(item.description).includes('ctx: 1000'));
  });

  for (const type of allStepTypes) {
    it(`should have an icon for step type: ${type}`, () => {
      const step = makeStep('s1', { type });
      const item = new StepItem(step, 0);
      assert.ok(item.iconPath, `Missing icon for ${type}`);
    });
  }

  it('should register showDetails command', () => {
    const step = makeStep('s1');
    const item = new StepItem(step, 0);
    assert.strictEqual(item.command?.command, 'copilotDebugger.showDetails');
    assert.strictEqual(item.command?.arguments?.[0], step);
  });

  it('should include compression info in tooltip', () => {
    const step = makeStep('s1', {
      type: 'compression',
      compressionInfo: { originalSize: 1000, compressedSize: 500, ratio: 0.5, method: 'truncation' },
    });
    const item = new StepItem(step, 0);
    const tooltipValue = (item.tooltip as { value: string }).value;
    assert.ok(tooltipValue.includes('Compression'));
    assert.ok(tooltipValue.includes('1000'));
    assert.ok(tooltipValue.includes('500'));
    assert.ok(tooltipValue.includes('truncation'));
  });

  it('should include tool name in tooltip', () => {
    const step = makeStep('s1', {
      type: 'tool_call',
      metadata: { toolName: 'readFile' },
    });
    const item = new StepItem(step, 0);
    const tooltipValue = (item.tooltip as { value: string }).value;
    assert.ok(tooltipValue.includes('readFile'));
  });

  it('should include file path in tooltip', () => {
    const step = makeStep('s1', {
      metadata: { filePath: '/path/to/file.ts' },
    });
    const item = new StepItem(step, 0);
    const tooltipValue = (item.tooltip as { value: string }).value;
    assert.ok(tooltipValue.includes('/path/to/file.ts'));
  });

  it('should truncate long content in tooltip', () => {
    const longContent = 'x'.repeat(500);
    const step = makeStep('s1', { content: longContent });
    const item = new StepItem(step, 0);
    const tooltipValue = (item.tooltip as { value: string }).value;
    assert.ok(tooltipValue.includes('...'));
    // Should not contain full 500 chars
    assert.ok(tooltipValue.length < 600);
  });
});
