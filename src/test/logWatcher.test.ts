import * as assert from 'assert';
import { CopilotLogWatcher } from '../logWatcher';
import { SessionStore } from '../sessionStore';

/**
 * Tests for CopilotLogWatcher's log pattern matching.
 * We test the patterns array indirectly by accessing the parseLine behavior
 * via the public interface (startWatching/stopWatching) and the store.
 *
 * Since the patterns and parseLine are private, we test them by simulating
 * log lines through the store after creating a session.
 */
describe('CopilotLogWatcher', () => {
  let store: SessionStore;
  let watcher: CopilotLogWatcher;

  beforeEach(() => {
    store = new SessionStore();
    watcher = new CopilotLogWatcher(store);
  });

  afterEach(() => {
    watcher.dispose();
    store.dispose();
  });

  describe('isWatching / startWatching / stopWatching', () => {
    it('should start as not watching', () => {
      assert.strictEqual(watcher.isWatching(), false);
    });

    it('should not error on stopWatching when not watching', () => {
      watcher.stopWatching(); // should not throw
    });
  });

  describe('log pattern matching (via the patterns property)', () => {
    // We access the patterns indirectly through the class.
    // Since patterns is private, we use a type assertion to test them directly.
    let patterns: { regex: RegExp; type: string; direction: string; extract?: (match: RegExpMatchArray) => Record<string, unknown> }[];

    before(() => {
      // Access private patterns for testing
      patterns = (watcher as unknown as { patterns: typeof patterns }).patterns;
    });

    it('should match request with model info', () => {
      const line = 'request to https://api.openai.com model=gpt-4o';
      const match = line.match(patterns[0].regex);
      assert.ok(match);
      assert.strictEqual(patterns[0].type, 'user_prompt');
      const extracted = patterns[0].extract!(match!);
      assert.strictEqual(extracted.endpoint, 'https://api.openai.com');
      assert.strictEqual(extracted.model, 'gpt-4o');
    });

    it('should match "sending request" lines', () => {
      const line = 'INFO sending request to copilot';
      const matched = patterns.find(p => p.regex.test(line));
      assert.ok(matched);
      assert.strictEqual(matched!.type, 'user_prompt');
    });

    it('should match "role": "user" JSON lines', () => {
      const line = '{"role": "user", "content": "hello"}';
      const matched = patterns.find(p => p.regex.test(line));
      assert.ok(matched);
      assert.strictEqual(matched!.type, 'user_prompt');
    });

    it('should match "role": "system" JSON lines', () => {
      const line = '{"role": "system", "content": "You are a helpful assistant"}';
      const matched = patterns.find(p => p.regex.test(line));
      assert.ok(matched);
      assert.strictEqual(matched!.type, 'system_prompt');
    });

    it('should match response with status code', () => {
      const line = 'response from server status=200';
      const matched = patterns.find(p => p.regex.test(line));
      assert.ok(matched);
      assert.strictEqual(matched!.type, 'assistant_response');
      if (matched!.extract) {
        const match = line.match(matched!.regex)!;
        const extracted = matched!.extract(match);
        assert.strictEqual(extracted.statusCode, 200);
      }
    });

    it('should match "role": "assistant" JSON lines', () => {
      const line = '{"role": "assistant", "content": "Hello!"}';
      const matched = patterns.find(p => p.regex.test(line));
      assert.ok(matched);
      assert.strictEqual(matched!.type, 'assistant_response');
    });

    it('should match prompt.tokens usage', () => {
      const line = 'prompt_tokens=1234';
      const matched = patterns.find(p => p.regex.test(line));
      assert.ok(matched);
      assert.strictEqual(matched!.type, 'context_injection');
      if (matched!.extract) {
        const match = line.match(matched!.regex)!;
        const extracted = matched!.extract(match);
        assert.strictEqual(extracted.promptTokens, 1234);
      }
    });

    it('should match completion.tokens usage', () => {
      const line = 'completion_tokens=567';
      const matched = patterns.find(p => p.regex.test(line));
      assert.ok(matched);
      assert.strictEqual(matched!.type, 'assistant_response');
      if (matched!.extract) {
        const match = line.match(matched!.regex)!;
        const extracted = matched!.extract(match);
        assert.strictEqual(extracted.completionTokens, 567);
      }
    });

    it('should match total.tokens usage', () => {
      const line = 'total_tokens=2000';
      const matched = patterns.find(p => p.regex.test(line));
      assert.ok(matched);
      if (matched!.extract) {
        const match = line.match(matched!.regex)!;
        const extracted = matched!.extract(match);
        assert.strictEqual(extracted.totalTokens, 2000);
      }
    });

    it('should match tool_call with tool name', () => {
      const line = 'tool_call: "readFile"';
      const matched = patterns.find(p => p.regex.test(line));
      assert.ok(matched);
      assert.strictEqual(matched!.type, 'tool_call');
      assert.strictEqual(matched!.direction, 'output');
    });

    it('should match function_call with name', () => {
      const line = 'function_call "name": "editFile"';
      const matched = patterns.find(p => p.regex.test(line));
      assert.ok(matched);
      assert.strictEqual(matched!.type, 'tool_call');
      if (matched!.extract) {
        const match = line.match(matched!.regex)!;
        const extracted = matched!.extract(match);
        assert.strictEqual(extracted.toolName, 'editFile');
      }
    });

    it('should match tool_result lines', () => {
      const line = 'tool_result: file content returned';
      const matched = patterns.find(p => p.regex.test(line));
      assert.ok(matched);
      assert.strictEqual(matched!.type, 'tool_result');
      assert.strictEqual(matched!.direction, 'input');
    });

    it('should match function_result lines', () => {
      const line = 'function_result received';
      const matched = patterns.find(p => p.regex.test(line));
      assert.ok(matched);
      assert.strictEqual(matched!.type, 'tool_result');
    });

    it('should match compaction lines', () => {
      const line = 'performing compaction on conversation history';
      const matched = patterns.find(p => p.regex.test(line));
      assert.ok(matched);
      assert.strictEqual(matched!.type, 'compression');
    });

    it('should match compression lines', () => {
      const line = 'compress: reducing context window';
      const matched = patterns.find(p => p.regex.test(line));
      assert.ok(matched);
      assert.strictEqual(matched!.type, 'compression');
    });

    it('should match truncation lines', () => {
      const line = 'truncating old messages';
      const matched = patterns.find(p => p.regex.test(line));
      assert.ok(matched);
      assert.strictEqual(matched!.type, 'compression');
    });

    it('should match context reduction lines', () => {
      const line = 'context reduced from 10000 to 5000 tokens';
      const matched = patterns.find(p => p.regex.test(line));
      assert.ok(matched);
      assert.strictEqual(matched!.type, 'compression');
    });

    it('should match content JSON lines', () => {
      const line = '"content": "This is a long message that contains more than ten characters"';
      const matched = patterns.find(p => p.regex.test(line));
      assert.ok(matched);
    });

    it('should match stream chunk lines', () => {
      const line = 'stream chunk received: data';
      const matched = patterns.find(p => p.regex.test(line));
      assert.ok(matched);
      assert.strictEqual(matched!.type, 'assistant_response');
    });

    it('should match delta content lines', () => {
      const line = 'delta content: Hello';
      const matched = patterns.find(p => p.regex.test(line));
      assert.ok(matched);
      assert.strictEqual(matched!.type, 'assistant_response');
    });

    it('should not match random unrelated lines', () => {
      const line = 'INFO: extension loaded successfully';
      const matched = patterns.find(p => p.regex.test(line));
      assert.strictEqual(matched, undefined);
    });
  });
});
