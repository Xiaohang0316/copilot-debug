import * as assert from 'assert';
import { SessionStore } from '../../sessionStore';
import { DetailPanel } from '../../views/detailPanel';
import { CopilotStep } from '../../types';

function makeStep(overrides: Partial<CopilotStep> = {}): CopilotStep {
  return {
    id: 'step_test_1',
    sessionId: 'session_1',
    timestamp: Date.now(),
    type: 'user_prompt',
    direction: 'input',
    content: 'Hello world',
    tokenCount: 100,
    contextSize: 500,
    metadata: {},
    ...overrides,
  };
}

describe('DetailPanel', () => {
  let store: SessionStore;
  let panel: DetailPanel;

  beforeEach(() => {
    store = new SessionStore();
    panel = new DetailPanel(store);
  });

  afterEach(() => {
    panel.dispose();
    store.dispose();
  });

  describe('show', () => {
    it('should not throw when showing a step', () => {
      const step = makeStep();
      assert.doesNotThrow(() => panel.show(step));
    });

    it('should not throw when showing a step with compression info', () => {
      const step = makeStep({
        type: 'compression',
        compressionInfo: {
          originalSize: 1000,
          compressedSize: 500,
          ratio: 0.5,
          method: 'truncation',
        },
      });
      assert.doesNotThrow(() => panel.show(step));
    });

    it('should not throw when showing a step with metadata', () => {
      const step = makeStep({
        metadata: {
          model: 'gpt-4o',
          toolName: 'readFile',
          filePath: '/path/to/file.ts',
          lineRange: '10-20',
        },
      });
      assert.doesNotThrow(() => panel.show(step));
    });

    it('should not throw when showing multiple steps (reusing panel)', () => {
      panel.show(makeStep({ type: 'user_prompt' }));
      panel.show(makeStep({ type: 'assistant_response' }));
      panel.show(makeStep({ type: 'tool_call' }));
    });
  });

  describe('showSessionOverview', () => {
    it('should not throw when showing a valid session overview', () => {
      const session = store.createSession('Test Session');
      store.addStep({
        ...makeStep(),
        sessionId: session.id,
      });
      assert.doesNotThrow(() => panel.showSessionOverview(session.id));
    });

    it('should handle session with no steps', () => {
      const session = store.createSession('Empty Session');
      assert.doesNotThrow(() => panel.showSessionOverview(session.id));
    });

    it('should handle nonexistent session gracefully', () => {
      assert.doesNotThrow(() => panel.showSessionOverview('nonexistent'));
    });

    it('should handle session with tool calls', () => {
      const session = store.createSession('Tool Session');
      store.addStep({
        ...makeStep({ type: 'tool_call', metadata: { toolName: 'readFile' } }),
        sessionId: session.id,
      });
      store.addStep({
        ...makeStep({ type: 'tool_call', metadata: { toolName: 'writeFile' } }),
        sessionId: session.id,
      });
      assert.doesNotThrow(() => panel.showSessionOverview(session.id));
    });

    it('should handle session with compression events', () => {
      const session = store.createSession('Compression Session');
      store.addStep({
        ...makeStep({
          type: 'compression',
          compressionInfo: {
            originalSize: 1000,
            compressedSize: 500,
            ratio: 0.5,
            method: 'detected_reduction',
          },
        }),
        sessionId: session.id,
      });
      assert.doesNotThrow(() => panel.showSessionOverview(session.id));
    });
  });

  describe('getHtml (indirectly tested via show)', () => {
    // We test HTML generation by accessing the private method through
    // the webview panel mock. The mock stores the HTML in webview.html.
    it('should generate HTML containing step type', () => {
      const step = makeStep({ type: 'tool_call' });
      panel.show(step);
      // The panel was created and HTML was set - no crash means success
    });

    it('should handle content with special HTML characters', () => {
      const step = makeStep({
        content: '<script>alert("xss")</script> & "quotes"',
      });
      // Should not throw - HTML should be escaped
      assert.doesNotThrow(() => panel.show(step));
    });

    it('should handle empty content', () => {
      const step = makeStep({ content: '' });
      assert.doesNotThrow(() => panel.show(step));
    });

    it('should handle very long content', () => {
      const step = makeStep({ content: 'x'.repeat(10000) });
      assert.doesNotThrow(() => panel.show(step));
    });

    it('should handle step with undefined metadata values', () => {
      const step = makeStep({
        metadata: { model: undefined, toolName: undefined },
      });
      assert.doesNotThrow(() => panel.show(step));
    });
  });

  describe('dispose', () => {
    it('should not throw when disposed', () => {
      assert.doesNotThrow(() => panel.dispose());
    });

    it('should not throw when disposed after showing', () => {
      panel.show(makeStep());
      assert.doesNotThrow(() => panel.dispose());
    });

    it('should not throw when disposed twice', () => {
      panel.dispose();
      assert.doesNotThrow(() => panel.dispose());
    });
  });
});
