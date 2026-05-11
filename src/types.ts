export interface CopilotSession {
  id: string;
  startTime: number;
  endTime?: number;
  steps: CopilotStep[];
  totalInputTokens: number;
  totalOutputTokens: number;
  label: string;
}

export interface CopilotStep {
  id: string;
  sessionId: string;
  timestamp: number;
  type: StepType;
  direction: 'input' | 'output';
  content: string;
  tokenCount: number;
  contextSize: number;
  compressionInfo?: CompressionInfo;
  metadata: StepMetadata;
  duration?: number;
}

export type StepType =
  | 'user_prompt'
  | 'system_prompt'
  | 'assistant_response'
  | 'tool_call'
  | 'tool_result'
  | 'context_injection'
  | 'compression'
  | 'unknown';

export interface CompressionInfo {
  originalSize: number;
  compressedSize: number;
  ratio: number;
  method: string;
}

export interface StepMetadata {
  model?: string;
  toolName?: string;
  filePath?: string;
  lineRange?: string;
  [key: string]: unknown;
}

export interface SessionStats {
  totalSteps: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalContextSize: number;
  peakContextSize: number;
  compressionEvents: number;
  avgCompressionRatio: number;
  duration: number;
  toolCalls: { name: string; count: number }[];
}
