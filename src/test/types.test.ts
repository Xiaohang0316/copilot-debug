import * as assert from 'assert';
import { CopilotSession, CopilotStep, CompressionInfo, StepMetadata, SessionStats, StepType } from '../types';

/**
 * Tests that the type interfaces are structurally correct
 * and can be instantiated as expected.
 */
describe('Types', () => {
  describe('CopilotSession', () => {
    it('should allow creating a minimal session', () => {
      const session: CopilotSession = {
        id: 'test_1',
        startTime: Date.now(),
        steps: [],
        totalInputTokens: 0,
        totalOutputTokens: 0,
        label: 'Test',
      };
      assert.strictEqual(session.id, 'test_1');
      assert.strictEqual(session.endTime, undefined);
    });

    it('should allow optional endTime', () => {
      const session: CopilotSession = {
        id: 'test_2',
        startTime: 1000,
        endTime: 2000,
        steps: [],
        totalInputTokens: 0,
        totalOutputTokens: 0,
        label: 'Test',
      };
      assert.strictEqual(session.endTime, 2000);
    });
  });

  describe('CopilotStep', () => {
    it('should allow creating a complete step', () => {
      const step: CopilotStep = {
        id: 'step_1',
        sessionId: 'session_1',
        timestamp: Date.now(),
        type: 'user_prompt',
        direction: 'input',
        content: 'Hello',
        tokenCount: 10,
        contextSize: 100,
        metadata: {},
      };
      assert.strictEqual(step.type, 'user_prompt');
      assert.strictEqual(step.compressionInfo, undefined);
      assert.strictEqual(step.duration, undefined);
    });

    it('should allow optional compressionInfo', () => {
      const step: CopilotStep = {
        id: 'step_2',
        sessionId: 'session_1',
        timestamp: Date.now(),
        type: 'compression',
        direction: 'input',
        content: 'compressed',
        tokenCount: 50,
        contextSize: 300,
        compressionInfo: {
          originalSize: 1000,
          compressedSize: 300,
          ratio: 0.3,
          method: 'truncation',
        },
        metadata: {},
      };
      assert.ok(step.compressionInfo);
      assert.strictEqual(step.compressionInfo!.ratio, 0.3);
    });

    it('should allow optional duration', () => {
      const step: CopilotStep = {
        id: 'step_3',
        sessionId: 'session_1',
        timestamp: Date.now(),
        type: 'assistant_response',
        direction: 'output',
        content: 'response',
        tokenCount: 50,
        contextSize: 200,
        duration: 1500,
        metadata: {},
      };
      assert.strictEqual(step.duration, 1500);
    });
  });

  describe('StepType', () => {
    it('should include all expected types', () => {
      const types: StepType[] = [
        'user_prompt',
        'system_prompt',
        'assistant_response',
        'tool_call',
        'tool_result',
        'context_injection',
        'compression',
        'unknown',
      ];
      assert.strictEqual(types.length, 8);
    });
  });

  describe('CompressionInfo', () => {
    it('should hold compression details', () => {
      const info: CompressionInfo = {
        originalSize: 5000,
        compressedSize: 2000,
        ratio: 0.4,
        method: 'summarization',
      };
      assert.strictEqual(info.originalSize, 5000);
      assert.strictEqual(info.compressedSize, 2000);
      assert.strictEqual(info.ratio, 0.4);
      assert.strictEqual(info.method, 'summarization');
    });
  });

  describe('StepMetadata', () => {
    it('should allow known fields', () => {
      const meta: StepMetadata = {
        model: 'gpt-4o',
        toolName: 'readFile',
        filePath: '/test.ts',
        lineRange: '1-10',
      };
      assert.strictEqual(meta.model, 'gpt-4o');
    });

    it('should allow arbitrary extra fields via index signature', () => {
      const meta: StepMetadata = {
        customField: 42,
        anotherField: [1, 2, 3],
      };
      assert.strictEqual(meta.customField, 42);
    });
  });

  describe('SessionStats', () => {
    it('should hold all computed stat fields', () => {
      const stats: SessionStats = {
        totalSteps: 10,
        totalInputTokens: 5000,
        totalOutputTokens: 3000,
        totalContextSize: 20000,
        peakContextSize: 8000,
        compressionEvents: 2,
        avgCompressionRatio: 0.65,
        duration: 120000,
        toolCalls: [
          { name: 'readFile', count: 5 },
          { name: 'writeFile', count: 2 },
        ],
      };
      assert.strictEqual(stats.totalSteps, 10);
      assert.strictEqual(stats.toolCalls.length, 2);
      assert.strictEqual(stats.toolCalls[0].name, 'readFile');
    });
  });
});
