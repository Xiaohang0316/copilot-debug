import * as assert from 'assert';
import { SessionStore } from '../../sessionStore';
import { SessionTreeProvider, SessionItem } from '../../views/sessionTreeProvider';

describe('SessionTreeProvider', () => {
  let store: SessionStore;
  let provider: SessionTreeProvider;

  beforeEach(() => {
    store = new SessionStore();
    provider = new SessionTreeProvider(store);
  });

  afterEach(() => {
    store.dispose();
  });

  describe('getChildren', () => {
    it('should return empty array when no sessions exist', () => {
      const children = provider.getChildren();
      assert.strictEqual(children.length, 0);
    });

    it('should return one item per session', () => {
      store.createSession('Session A');
      store.createSession('Session B');
      const children = provider.getChildren();
      assert.strictEqual(children.length, 2);
    });

    it('should create SessionItem instances', () => {
      store.createSession('Test');
      const children = provider.getChildren();
      assert.ok(children[0] instanceof SessionItem);
    });
  });

  describe('selectSession', () => {
    it('should set the selected session id', () => {
      const session = store.createSession();
      provider.selectSession(session.id);
      assert.strictEqual(provider.getSelectedSessionId(), session.id);
    });
  });

  describe('onDidChangeTreeData', () => {
    it('should fire when store changes', () => {
      let fired = false;
      provider.onDidChangeTreeData(() => { fired = true; });
      store.createSession();
      assert.ok(fired);
    });

    it('should fire on refresh', () => {
      let fired = false;
      provider.onDidChangeTreeData(() => { fired = true; });
      provider.refresh();
      assert.ok(fired);
    });
  });
});

describe('SessionItem', () => {
  it('should use session label as tree item label', () => {
    const session = {
      id: 'test_id',
      startTime: Date.now(),
      steps: [],
      totalInputTokens: 0,
      totalOutputTokens: 0,
      label: 'My Session',
    };
    const item = new SessionItem(session, false, false);
    assert.strictEqual(item.label, 'My Session');
  });

  it('should show record icon for active sessions', () => {
    const session = {
      id: 'test_id',
      startTime: Date.now(),
      steps: [],
      totalInputTokens: 0,
      totalOutputTokens: 0,
      label: 'Active Session',
    };
    const item = new SessionItem(session, true, false);
    assert.ok(item.iconPath);
    assert.strictEqual((item.iconPath as { id: string }).id, 'record');
  });

  it('should show history icon for inactive sessions', () => {
    const session = {
      id: 'test_id',
      startTime: Date.now(),
      steps: [],
      totalInputTokens: 0,
      totalOutputTokens: 0,
      label: 'Ended Session',
    };
    const item = new SessionItem(session, false, false);
    assert.strictEqual((item.iconPath as { id: string }).id, 'history');
  });

  it('should set contextValue for selected session', () => {
    const session = {
      id: 'test_id',
      startTime: Date.now(),
      steps: [],
      totalInputTokens: 0,
      totalOutputTokens: 0,
      label: 'Selected',
    };
    const item = new SessionItem(session, false, true);
    assert.strictEqual(item.contextValue, 'session-selected');
  });

  it('should not set contextValue for unselected session', () => {
    const session = {
      id: 'test_id',
      startTime: Date.now(),
      steps: [],
      totalInputTokens: 0,
      totalOutputTokens: 0,
      label: 'Not Selected',
    };
    const item = new SessionItem(session, false, false);
    assert.strictEqual(item.contextValue, undefined);
  });

  it('should register selectSession command', () => {
    const session = {
      id: 'test_id',
      startTime: Date.now(),
      steps: [],
      totalInputTokens: 0,
      totalOutputTokens: 0,
      label: 'Test',
    };
    const item = new SessionItem(session, false, false);
    assert.strictEqual(item.command?.command, 'copilotDebugger.selectSession');
    assert.deepStrictEqual(item.command?.arguments, ['test_id']);
  });

  it('should include step count and token count in description', () => {
    const session = {
      id: 'test_id',
      startTime: Date.now(),
      steps: [{}, {}, {}] as never[], // 3 steps
      totalInputTokens: 500,
      totalOutputTokens: 300,
      label: 'Test',
    };
    const item = new SessionItem(session, false, false);
    assert.ok(item.description);
    assert.ok(String(item.description).includes('3 steps'));
    assert.ok(String(item.description).includes('800 tokens'));
  });

  it('should format large token counts with K suffix', () => {
    const session = {
      id: 'test_id',
      startTime: Date.now(),
      steps: [],
      totalInputTokens: 5000,
      totalOutputTokens: 3000,
      label: 'Test',
    };
    const item = new SessionItem(session, false, false);
    assert.ok(String(item.description).includes('8.0K tokens'));
  });

  it('should include tooltip with markdown details', () => {
    const session = {
      id: 'test_id',
      startTime: Date.now(),
      steps: [],
      totalInputTokens: 100,
      totalOutputTokens: 50,
      label: 'Test Session',
    };
    const item = new SessionItem(session, false, false);
    assert.ok(item.tooltip);
    const tooltipValue = (item.tooltip as { value: string }).value;
    assert.ok(tooltipValue.includes('Test Session'));
    assert.ok(tooltipValue.includes('Status: Active'));
  });

  it('should show duration in tooltip for ended sessions', () => {
    const start = Date.now() - 120000; // 2 minutes ago
    const session = {
      id: 'test_id',
      startTime: start,
      endTime: Date.now(),
      steps: [],
      totalInputTokens: 0,
      totalOutputTokens: 0,
      label: 'Ended',
    };
    const item = new SessionItem(session, false, false);
    const tooltipValue = (item.tooltip as { value: string }).value;
    assert.ok(tooltipValue.includes('Duration'));
  });
});
