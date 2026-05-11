import * as assert from 'assert';
import { SessionStore } from '../../sessionStore';
import { StatsTreeProvider, StatItem } from '../../views/statsTreeProvider';
import { CopilotStep } from '../../types';

function makeStep(sessionId: string, overrides: Partial<CopilotStep> = {}): CopilotStep {
  return {
    id: `step_${Math.random().toString(36).slice(2)}`,
    sessionId,
    timestamp: Date.now(),
    type: 'user_prompt',
    direction: 'input',
    content: 'test',
    tokenCount: 100,
    contextSize: 500,
    metadata: {},
    ...overrides,
  };
}

describe('StatsTreeProvider', () => {
  let store: SessionStore;
  let provider: StatsTreeProvider;

  beforeEach(() => {
    store = new SessionStore();
    provider = new StatsTreeProvider(store);
  });

  afterEach(() => {
    store.dispose();
  });

  describe('getChildren (root)', () => {
    it('should show "no session" message when no session is selected', () => {
      const children = provider.getChildren();
      assert.strictEqual(children.length, 1);
      assert.ok(children[0] instanceof StatItem);
    });

    it('should return empty array for nonexistent session', () => {
      provider.setSessionId('nonexistent');
      const children = provider.getChildren();
      assert.strictEqual(children.length, 0);
    });

    it('should return stat categories for a valid session', () => {
      const session = store.createSession();
      store.addStep(makeStep(session.id));
      provider.setSessionId(session.id);
      const children = provider.getChildren();
      // Should have at least: Token Usage, Context, Execution
      assert.ok(children.length >= 3);
    });

    it('should include tool calls section when tools are used', () => {
      const session = store.createSession();
      store.addStep(makeStep(session.id, { type: 'tool_call', metadata: { toolName: 'readFile' } }));
      provider.setSessionId(session.id);
      const children = provider.getChildren();
      // Should have 4 sections: Token Usage, Context, Execution, Tool Calls
      assert.strictEqual(children.length, 4);
    });

    it('should not include tool calls section when no tools are used', () => {
      const session = store.createSession();
      store.addStep(makeStep(session.id, { type: 'user_prompt' }));
      provider.setSessionId(session.id);
      const children = provider.getChildren();
      assert.strictEqual(children.length, 3);
    });
  });

  describe('getChildren (nested)', () => {
    it('should return children of a stat group', () => {
      const session = store.createSession();
      store.addStep(makeStep(session.id, { direction: 'input', tokenCount: 200 }));
      provider.setSessionId(session.id);

      const roots = provider.getChildren();
      // Token usage section should have children
      const tokenSection = roots[0];
      const tokenChildren = provider.getChildren(tokenSection);
      assert.ok(tokenChildren.length >= 3); // input, output, total
    });
  });

  describe('setSessionId', () => {
    it('should trigger tree data change', () => {
      let fired = false;
      provider.onDidChangeTreeData(() => { fired = true; });
      provider.setSessionId('test');
      assert.ok(fired);
    });
  });

  describe('refresh', () => {
    it('should trigger tree data change', () => {
      let fired = false;
      provider.onDidChangeTreeData(() => { fired = true; });
      provider.refresh();
      assert.ok(fired);
    });
  });

  describe('auto-refresh on store change', () => {
    it('should refresh when store changes', () => {
      let changeCount = 0;
      provider.onDidChangeTreeData(() => { changeCount++; });
      store.createSession();
      assert.ok(changeCount > 0);
    });
  });
});

describe('StatItem', () => {
  it('should set label and description', () => {
    const item = new StatItem('Input Tokens', '1.5K', 'arrow-right');
    assert.strictEqual(item.label, 'Input Tokens');
    assert.strictEqual(item.description, '1.5K');
  });

  it('should set icon from string', () => {
    const item = new StatItem('Test', '', 'graph');
    assert.ok(item.iconPath);
    assert.strictEqual((item.iconPath as { id: string }).id, 'graph');
  });

  it('should have no collapsible state by default', () => {
    const item = new StatItem('Test', '', 'info');
    // TreeItemCollapsibleState.None = 0
    assert.strictEqual(item.collapsibleState, 0);
  });

  it('should support children array', () => {
    const parent = new StatItem('Parent', '', 'folder');
    parent.children = [
      new StatItem('Child 1', '10', 'info'),
      new StatItem('Child 2', '20', 'info'),
    ];
    assert.strictEqual(parent.children.length, 2);
  });
});
