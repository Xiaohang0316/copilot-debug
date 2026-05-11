import * as assert from 'assert';
import { initI18n, t } from '../i18n';

describe('i18n', () => {
  before(() => {
    initI18n();
  });

  describe('t() basic lookup', () => {
    it('should return the English string for known keys', () => {
      const result = t('statusbar.idle');
      // The actual value is defined in i18n.ts en bundle
      assert.ok(result !== 'statusbar.idle', 'Should resolve to a translated string, not the key');
      assert.strictEqual(typeof result, 'string');
    });

    it('should return the key itself for unknown keys', () => {
      const result = t('nonexistent.key');
      assert.strictEqual(result, 'nonexistent.key');
    });
  });

  describe('t() placeholder substitution', () => {
    it('should substitute {0} with the first argument', () => {
      const result = t('export.done', '/tmp/test.json');
      assert.strictEqual(result, 'Session exported to /tmp/test.json');
    });

    it('should substitute multiple placeholders', () => {
      const result = t('chat.debug_summary', 100, 50, 1200, 'gpt-4o');
      assert.strictEqual(result, 'Debug: 100 input tok | 50 output tok | 1200ms | model: gpt-4o');
    });

    it('should handle numeric arguments', () => {
      const result = t('import.steps_done', 42);
      assert.strictEqual(result, 'Imported 42 steps');
    });

    it('should leave placeholders if no args provided', () => {
      const result = t('export.done');
      assert.strictEqual(result, 'Session exported to {0}');
    });
  });

  describe('all step type keys exist', () => {
    const stepTypes = [
      'user_prompt', 'system_prompt', 'assistant_response',
      'tool_call', 'tool_result', 'context_injection',
      'compression', 'unknown',
    ];

    for (const type of stepTypes) {
      it(`should have a translation for step.${type}`, () => {
        const key = `step.${type}`;
        const result = t(key);
        assert.notStrictEqual(result, key, `Missing translation for ${key}`);
      });
    }
  });

  describe('all stats keys exist', () => {
    const statsKeys = [
      'stats.no_session', 'stats.token_usage', 'stats.input_tokens',
      'stats.output_tokens', 'stats.total_tokens', 'stats.context',
      'stats.peak_context', 'stats.compression_events', 'stats.avg_compression',
      'stats.execution', 'stats.total_steps', 'stats.duration', 'stats.tool_calls',
    ];

    for (const key of statsKeys) {
      it(`should have a translation for ${key}`, () => {
        const result = t(key);
        assert.notStrictEqual(result, key, `Missing translation for ${key}`);
      });
    }
  });

  describe('all detail panel keys exist', () => {
    const detailKeys = [
      'detail.metrics', 'detail.token_count', 'detail.context_size',
      'detail.timestamp', 'detail.step_id', 'detail.compression_info',
      'detail.original_size', 'detail.compressed_size', 'detail.ratio',
      'detail.method', 'detail.metadata', 'detail.content',
      'detail.overview', 'detail.context_over_time', 'detail.tool_distribution',
    ];

    for (const key of detailKeys) {
      it(`should have a translation for ${key}`, () => {
        const result = t(key);
        assert.notStrictEqual(result, key, `Missing translation for ${key}`);
      });
    }
  });

  describe('all capture/session keys exist', () => {
    const keys = [
      'capture.started', 'capture.stopped', 'capture.log_started', 'capture.log_stopped',
      'clear.confirm', 'clear.button', 'clear.done',
      'export.no_sessions', 'export.select', 'export.done',
      'import.steps_done', 'import.log_done',
      'session.debug_chat', 'session.log_watch',
      'statusbar.idle', 'statusbar.idle_tooltip', 'statusbar.capturing_tooltip',
      'chat.no_model', 'chat.debug_summary',
      'logwatch.no_paths',
    ];

    for (const key of keys) {
      it(`should have a translation for ${key}`, () => {
        const result = t(key);
        assert.notStrictEqual(result, key, `Missing translation for ${key}`);
      });
    }
  });
});
