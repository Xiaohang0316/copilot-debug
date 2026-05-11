import * as assert from 'assert';
import { CopilotInterceptor } from '../interceptor';
import { SessionStore } from '../sessionStore';

describe('CopilotInterceptor', () => {
  let store: SessionStore;
  let interceptor: CopilotInterceptor;

  beforeEach(() => {
    store = new SessionStore();
    interceptor = new CopilotInterceptor(store);
  });

  afterEach(() => {
    interceptor.dispose();
    store.dispose();
  });

  describe('parseLogLine', () => {
    it('should parse request log lines as user_prompt', () => {
      const result = interceptor.parseLogLine('[request] sending data to model');
      assert.ok(result);
      assert.strictEqual(result!.type, 'user_prompt');
      assert.strictEqual(result!.direction, 'input');
    });

    it('should parse "sending request" lines as user_prompt', () => {
      const result = interceptor.parseLogLine('INFO: sending request to api endpoint');
      assert.ok(result);
      assert.strictEqual(result!.type, 'user_prompt');
      assert.strictEqual(result!.direction, 'input');
    });

    it('should parse response log lines as assistant_response', () => {
      const result = interceptor.parseLogLine('[response] received data from model');
      assert.ok(result);
      assert.strictEqual(result!.type, 'assistant_response');
      assert.strictEqual(result!.direction, 'output');
    });

    it('should parse "received response" lines as assistant_response', () => {
      const result = interceptor.parseLogLine('received response from server');
      assert.ok(result);
      assert.strictEqual(result!.type, 'assistant_response');
      assert.strictEqual(result!.direction, 'output');
    });

    it('should parse tool call lines', () => {
      const result = interceptor.parseLogLine('[tool_call] calling tool readFile');
      assert.ok(result);
      assert.strictEqual(result!.type, 'tool_call');
      assert.strictEqual(result!.direction, 'output');
    });

    it('should parse "calling tool" lines', () => {
      const result = interceptor.parseLogLine('calling tool: executeCommand');
      assert.ok(result);
      assert.strictEqual(result!.type, 'tool_call');
      assert.strictEqual(result!.direction, 'output');
    });

    it('should parse tool result lines', () => {
      const result = interceptor.parseLogLine('[tool_result] output: success');
      assert.ok(result);
      assert.strictEqual(result!.type, 'tool_result');
      assert.strictEqual(result!.direction, 'input');
    });

    it('should parse "tool returned" lines', () => {
      const result = interceptor.parseLogLine('tool returned 200 OK');
      assert.ok(result);
      assert.strictEqual(result!.type, 'tool_result');
      assert.strictEqual(result!.direction, 'input');
    });

    it('should parse compression lines', () => {
      const result = interceptor.parseLogLine('[compress] compacting context window');
      assert.ok(result);
      assert.strictEqual(result!.type, 'compression');
      assert.strictEqual(result!.direction, 'input');
    });

    it('should parse compaction lines', () => {
      const result = interceptor.parseLogLine('performing compaction on conversation');
      assert.ok(result);
      assert.strictEqual(result!.type, 'compression');
      assert.strictEqual(result!.direction, 'input');
    });

    it('should parse truncation lines', () => {
      const result = interceptor.parseLogLine('truncating old messages to fit context');
      assert.ok(result);
      assert.strictEqual(result!.type, 'compression');
      assert.strictEqual(result!.direction, 'input');
    });

    it('should parse context injection lines', () => {
      const result = interceptor.parseLogLine('[context] injecting context from file');
      assert.ok(result);
      assert.strictEqual(result!.type, 'context_injection');
      assert.strictEqual(result!.direction, 'input');
    });

    it('should parse "injecting context" lines', () => {
      const result = interceptor.parseLogLine('injecting context: editor content');
      assert.ok(result);
      assert.strictEqual(result!.type, 'context_injection');
      assert.strictEqual(result!.direction, 'input');
    });

    it('should parse system prompt lines', () => {
      const result = interceptor.parseLogLine('[system] setting system prompt');
      assert.ok(result);
      assert.strictEqual(result!.type, 'system_prompt');
      assert.strictEqual(result!.direction, 'input');
    });

    it('should parse "system prompt" lines', () => {
      const result = interceptor.parseLogLine('system prompt loaded from config');
      assert.ok(result);
      assert.strictEqual(result!.type, 'system_prompt');
      assert.strictEqual(result!.direction, 'input');
    });

    it('should return null for unrecognized lines', () => {
      assert.strictEqual(interceptor.parseLogLine('some random log line'), null);
    });

    it('should return null for empty lines', () => {
      assert.strictEqual(interceptor.parseLogLine(''), null);
    });

    it('should return null for whitespace-only lines', () => {
      assert.strictEqual(interceptor.parseLogLine('   \t  '), null);
    });

    it('should be case-insensitive', () => {
      assert.ok(interceptor.parseLogLine('[REQUEST] data'));
      assert.ok(interceptor.parseLogLine('[RESPONSE] data'));
      assert.ok(interceptor.parseLogLine('CALLING TOOL xyz'));
      assert.ok(interceptor.parseLogLine('COMPACTION started'));
    });

    it('should include the original line content', () => {
      const line = '[request] sending data to gpt-4';
      const result = interceptor.parseLogLine(line);
      assert.strictEqual(result!.content, line);
    });
  });

  describe('isCapturing / startCapture / stopCapture', () => {
    it('should start as not capturing', () => {
      assert.strictEqual(interceptor.isCapturing(), false);
    });

    it('should be capturing after startCapture', () => {
      interceptor.startCapture();
      assert.strictEqual(interceptor.isCapturing(), true);
    });

    it('should not be capturing after stopCapture', () => {
      interceptor.startCapture();
      interceptor.stopCapture();
      assert.strictEqual(interceptor.isCapturing(), false);
    });

    it('should create a session on startCapture', () => {
      interceptor.startCapture();
      assert.ok(store.getActiveSession());
    });

    it('should end the session on stopCapture', () => {
      interceptor.startCapture();
      const session = store.getActiveSession()!;
      interceptor.stopCapture();
      const ended = store.getSession(session.id);
      assert.ok(ended?.endTime);
    });

    it('should not start capture twice', () => {
      interceptor.startCapture();
      interceptor.startCapture(); // should be a no-op
      assert.strictEqual(store.getAllSessions().length, 1);
    });

    it('should not error on stopCapture when not capturing', () => {
      interceptor.stopCapture(); // should not throw
    });
  });

  describe('addManualStep', () => {
    it('should add a step when capturing', () => {
      interceptor.startCapture();
      const session = store.getActiveSession()!;
      interceptor.addManualStep({
        type: 'user_prompt',
        direction: 'input',
        content: 'manual test step',
      });
      assert.strictEqual(session.steps.length, 1);
      assert.strictEqual(session.steps[0].content, 'manual test step');
      assert.strictEqual(session.steps[0].type, 'user_prompt');
    });

    it('should not add a step when not capturing', () => {
      interceptor.addManualStep({
        type: 'user_prompt',
        direction: 'input',
        content: 'should be ignored',
      });
      // No session exists, no error
    });

    it('should estimate token count for manual steps', () => {
      interceptor.startCapture();
      const session = store.getActiveSession()!;
      interceptor.addManualStep({
        type: 'user_prompt',
        direction: 'input',
        content: 'hello world',
      });
      assert.ok(session.steps[0].tokenCount > 0);
    });

    it('should use provided metadata', () => {
      interceptor.startCapture();
      const session = store.getActiveSession()!;
      interceptor.addManualStep({
        type: 'tool_call',
        direction: 'output',
        content: 'test',
        metadata: { toolName: 'readFile' },
      });
      assert.strictEqual(session.steps[0].metadata.toolName, 'readFile');
    });
  });
});
