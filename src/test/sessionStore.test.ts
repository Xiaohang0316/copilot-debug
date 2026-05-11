import * as assert from 'assert';
import { SessionStore } from '../sessionStore';
import { CopilotStep } from '../types';

function makeStep(sessionId: string, overrides: Partial<CopilotStep> = {}): CopilotStep {
  return {
    id: `step_${Date.now()}_${Math.random().toString(36).slice(2)}`,
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

describe('SessionStore', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore();
  });

  afterEach(() => {
    store.dispose();
  });

  describe('createSession', () => {
    it('should create a session with auto-generated label', () => {
      const session = store.createSession();
      assert.ok(session.id.startsWith('session_'));
      assert.strictEqual(session.label, 'Session 1');
      assert.ok(session.startTime > 0);
      assert.strictEqual(session.steps.length, 0);
      assert.strictEqual(session.totalInputTokens, 0);
      assert.strictEqual(session.totalOutputTokens, 0);
      assert.strictEqual(session.endTime, undefined);
    });

    it('should create a session with custom label', () => {
      const session = store.createSession('My Debug Session');
      assert.strictEqual(session.label, 'My Debug Session');
    });

    it('should increment session label numbers', () => {
      const s1 = store.createSession();
      const s2 = store.createSession();
      assert.strictEqual(s1.label, 'Session 1');
      assert.strictEqual(s2.label, 'Session 2');
    });

    it('should set new session as active', () => {
      const session = store.createSession();
      const active = store.getActiveSession();
      assert.strictEqual(active?.id, session.id);
    });

    it('should replace active session when creating a new one', () => {
      store.createSession();
      const s2 = store.createSession();
      const active = store.getActiveSession();
      assert.strictEqual(active?.id, s2.id);
    });
  });

  describe('getActiveSession', () => {
    it('should return undefined when no sessions exist', () => {
      assert.strictEqual(store.getActiveSession(), undefined);
    });

    it('should return the active session', () => {
      const session = store.createSession();
      assert.strictEqual(store.getActiveSession()?.id, session.id);
    });

    it('should return undefined after session is ended', () => {
      store.createSession();
      store.endSession();
      assert.strictEqual(store.getActiveSession(), undefined);
    });
  });

  describe('endSession', () => {
    it('should set endTime on the session', () => {
      const session = store.createSession();
      store.endSession();
      const ended = store.getSession(session.id);
      assert.ok(ended?.endTime);
      assert.ok(ended!.endTime! >= ended!.startTime);
    });

    it('should end a specific session by id', () => {
      const s1 = store.createSession();
      store.createSession();
      store.endSession(s1.id);
      const ended = store.getSession(s1.id);
      assert.ok(ended?.endTime);
      // s2 is still active
      assert.ok(store.getActiveSession());
    });

    it('should do nothing if session does not exist', () => {
      store.endSession('nonexistent');
      // no error thrown
    });

    it('should do nothing if no active session and no id given', () => {
      store.endSession();
      // no error thrown
    });
  });

  describe('addStep', () => {
    it('should add an input step and update totalInputTokens', () => {
      const session = store.createSession();
      const step = makeStep(session.id, { direction: 'input', tokenCount: 50 });
      store.addStep(step);

      const updated = store.getSession(session.id)!;
      assert.strictEqual(updated.steps.length, 1);
      assert.strictEqual(updated.totalInputTokens, 50);
      assert.strictEqual(updated.totalOutputTokens, 0);
    });

    it('should add an output step and update totalOutputTokens', () => {
      const session = store.createSession();
      const step = makeStep(session.id, { direction: 'output', tokenCount: 75 });
      store.addStep(step);

      const updated = store.getSession(session.id)!;
      assert.strictEqual(updated.totalOutputTokens, 75);
      assert.strictEqual(updated.totalInputTokens, 0);
    });

    it('should accumulate tokens across multiple steps', () => {
      const session = store.createSession();
      store.addStep(makeStep(session.id, { direction: 'input', tokenCount: 100 }));
      store.addStep(makeStep(session.id, { direction: 'input', tokenCount: 200 }));
      store.addStep(makeStep(session.id, { direction: 'output', tokenCount: 50 }));

      const updated = store.getSession(session.id)!;
      assert.strictEqual(updated.totalInputTokens, 300);
      assert.strictEqual(updated.totalOutputTokens, 50);
      assert.strictEqual(updated.steps.length, 3);
    });

    it('should ignore steps for nonexistent sessions', () => {
      const step = makeStep('nonexistent');
      store.addStep(step);
      // no error, step is silently discarded
    });
  });

  describe('getSession', () => {
    it('should return the session by id', () => {
      const session = store.createSession('Test');
      const result = store.getSession(session.id);
      assert.strictEqual(result?.label, 'Test');
    });

    it('should return undefined for unknown id', () => {
      assert.strictEqual(store.getSession('unknown'), undefined);
    });
  });

  describe('getAllSessions', () => {
    it('should return empty array when no sessions exist', () => {
      assert.deepStrictEqual(store.getAllSessions(), []);
    });

    it('should return sessions sorted by startTime descending', () => {
      const s1 = store.createSession('First');
      // Ensure s2 has a later startTime
      s1.startTime = Date.now() - 1000;
      const s2 = store.createSession('Second');
      const all = store.getAllSessions();
      assert.strictEqual(all.length, 2);
      // Most recent first
      assert.strictEqual(all[0].id, s2.id);
      assert.strictEqual(all[1].id, s1.id);
    });
  });

  describe('getSessionStats', () => {
    it('should return undefined for unknown session', () => {
      assert.strictEqual(store.getSessionStats('unknown'), undefined);
    });

    it('should return correct stats for an empty session', () => {
      const session = store.createSession();
      const stats = store.getSessionStats(session.id)!;
      assert.strictEqual(stats.totalSteps, 0);
      assert.strictEqual(stats.totalInputTokens, 0);
      assert.strictEqual(stats.totalOutputTokens, 0);
      assert.strictEqual(stats.peakContextSize, 0);
      assert.strictEqual(stats.compressionEvents, 0);
      assert.strictEqual(stats.avgCompressionRatio, 0);
      assert.strictEqual(stats.toolCalls.length, 0);
    });

    it('should compute totalSteps correctly', () => {
      const session = store.createSession();
      store.addStep(makeStep(session.id));
      store.addStep(makeStep(session.id));
      store.addStep(makeStep(session.id));
      const stats = store.getSessionStats(session.id)!;
      assert.strictEqual(stats.totalSteps, 3);
    });

    it('should compute peakContextSize correctly', () => {
      const session = store.createSession();
      store.addStep(makeStep(session.id, { contextSize: 100 }));
      store.addStep(makeStep(session.id, { contextSize: 500 }));
      store.addStep(makeStep(session.id, { contextSize: 300 }));
      const stats = store.getSessionStats(session.id)!;
      assert.strictEqual(stats.peakContextSize, 500);
    });

    it('should compute totalContextSize correctly', () => {
      const session = store.createSession();
      store.addStep(makeStep(session.id, { contextSize: 100 }));
      store.addStep(makeStep(session.id, { contextSize: 200 }));
      const stats = store.getSessionStats(session.id)!;
      assert.strictEqual(stats.totalContextSize, 300);
    });

    it('should count compression events', () => {
      const session = store.createSession();
      store.addStep(makeStep(session.id, {
        compressionInfo: { originalSize: 1000, compressedSize: 500, ratio: 0.5, method: 'test' },
      }));
      store.addStep(makeStep(session.id)); // no compression
      store.addStep(makeStep(session.id, {
        compressionInfo: { originalSize: 800, compressedSize: 400, ratio: 0.5, method: 'test' },
      }));
      const stats = store.getSessionStats(session.id)!;
      assert.strictEqual(stats.compressionEvents, 2);
    });

    it('should compute avgCompressionRatio correctly', () => {
      const session = store.createSession();
      store.addStep(makeStep(session.id, {
        compressionInfo: { originalSize: 1000, compressedSize: 600, ratio: 0.6, method: 'test' },
      }));
      store.addStep(makeStep(session.id, {
        compressionInfo: { originalSize: 1000, compressedSize: 400, ratio: 0.4, method: 'test' },
      }));
      const stats = store.getSessionStats(session.id)!;
      assert.strictEqual(stats.avgCompressionRatio, 0.5);
    });

    it('should count tool calls by name', () => {
      const session = store.createSession();
      store.addStep(makeStep(session.id, { type: 'tool_call', metadata: { toolName: 'readFile' } }));
      store.addStep(makeStep(session.id, { type: 'tool_call', metadata: { toolName: 'readFile' } }));
      store.addStep(makeStep(session.id, { type: 'tool_call', metadata: { toolName: 'writeFile' } }));
      const stats = store.getSessionStats(session.id)!;

      assert.strictEqual(stats.toolCalls.length, 2);
      const readFile = stats.toolCalls.find(t => t.name === 'readFile');
      const writeFile = stats.toolCalls.find(t => t.name === 'writeFile');
      assert.strictEqual(readFile?.count, 2);
      assert.strictEqual(writeFile?.count, 1);
    });

    it('should use "unknown" for tool calls without toolName', () => {
      const session = store.createSession();
      store.addStep(makeStep(session.id, { type: 'tool_call', metadata: {} }));
      const stats = store.getSessionStats(session.id)!;
      assert.strictEqual(stats.toolCalls[0].name, 'unknown');
    });

    it('should compute duration for active session', () => {
      const session = store.createSession();
      const stats = store.getSessionStats(session.id)!;
      assert.ok(stats.duration >= 0);
    });

    it('should compute duration for ended session', () => {
      const session = store.createSession();
      store.endSession();
      const stats = store.getSessionStats(session.id)!;
      assert.ok(stats.duration >= 0);
    });
  });

  describe('clearAll', () => {
    it('should remove all sessions', () => {
      store.createSession();
      store.createSession();
      store.clearAll();
      assert.deepStrictEqual(store.getAllSessions(), []);
      assert.strictEqual(store.getActiveSession(), undefined);
    });
  });

  describe('exportSession', () => {
    it('should return session data with stats', () => {
      const session = store.createSession('Export Test');
      store.addStep(makeStep(session.id, { tokenCount: 100, direction: 'input' }));
      const exported = store.exportSession(session.id) as Record<string, unknown>;
      assert.ok(exported);
      assert.strictEqual(exported.label, 'Export Test');
      assert.ok(exported.stats);
      assert.ok(Array.isArray(exported.steps));
    });

    it('should return undefined for unknown session', () => {
      assert.strictEqual(store.exportSession('unknown'), undefined);
    });
  });

  describe('onDidChange event', () => {
    it('should fire when a session is created', () => {
      let fired = false;
      store.onDidChange(() => { fired = true; });
      store.createSession();
      assert.ok(fired);
    });

    it('should fire when a session is ended', () => {
      store.createSession();
      let fired = false;
      store.onDidChange(() => { fired = true; });
      store.endSession();
      assert.ok(fired);
    });

    it('should fire when a step is added', () => {
      const session = store.createSession();
      let fired = false;
      store.onDidChange(() => { fired = true; });
      store.addStep(makeStep(session.id));
      assert.ok(fired);
    });

    it('should fire when sessions are cleared', () => {
      store.createSession();
      let fired = false;
      store.onDidChange(() => { fired = true; });
      store.clearAll();
      assert.ok(fired);
    });

    it('should support multiple listeners', () => {
      let count = 0;
      store.onDidChange(() => { count++; });
      store.onDidChange(() => { count++; });
      store.createSession();
      assert.strictEqual(count, 2);
    });
  });
});
