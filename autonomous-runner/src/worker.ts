import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options, CanUseTool, McpServerConfig, OutputFormat } from '@anthropic-ai/claude-agent-sdk';
import { evaluateToolUse, evaluateSubagentSpawn, type AgentBudget } from './safety.js';

export interface QueryRunResult {
  resultText: string;
  isError: boolean;
  errors: string[];
  costUsd: number;
  numTurns: number;
  toolCallCount: number;
  structuredOutput?: unknown;
}

export interface RunQueryParams {
  prompt: string;
  systemPrompt: string;
  cwd: string;
  model: string;
  fallbackModel?: string;
  maxTurns: number;
  tools: string[];
  mcpServers?: Record<string, McpServerConfig>;
  mcpAllowlist?: Set<string>;
  outputFormat?: OutputFormat;
  /**
   * Shared, cross-phase Task-tool (subagent) budget. Passed by reference — the same object is
   * reused across Analyze/Plan, Execute, and every Fix iteration so the limit is a true ceiling
   * for the whole run, not reset per phase. Omit (or leave 'Task' out of `tools`) to make
   * subagent creation impossible for this call regardless of budget.
   */
  agentBudget?: AgentBudget;
  onToolCall?: (toolName: string, input: Record<string, unknown>, decision: 'allow' | 'deny', reason?: string) => void;
  abortController?: AbortController;
  verbose?: boolean;
}

/**
 * One bounded round-trip through the Claude Agent SDK. This is the only place the loop
 * talks to the model — everything above (LoopController) treats it as a black box that
 * takes a prompt+role and returns text/tool-call counters/cost, never a self-reported
 * "I'm done" verdict (that determination belongs to the Validator, not the Worker).
 */
export async function runQuery(params: RunQueryParams): Promise<QueryRunResult> {
  let toolCallCount = 0;

  const canUseTool: CanUseTool = async (toolName, input) => {
    toolCallCount++;

    // Task (subagent) spawning is gated separately from evaluateToolUse: it's not a denial
    // pattern, it's a hard budget that must be checked AND incremented atomically here, uniformly
    // for top-level and nested/recursive Task calls (the SDK routes a subagent's own tool use
    // through this same canUseTool, with options.agentID identifying the calling subagent —
    // there is no separate gate to bypass by nesting).
    if (toolName === 'Task') {
      const decision = params.agentBudget ? evaluateSubagentSpawn(params.agentBudget) : { allow: false, reason: 'no agentBudget configured for this phase — subagent creation is not permitted here' };
      params.onToolCall?.(toolName, input, decision.allow ? 'allow' : 'deny', decision.reason);
      if (!decision.allow) {
        return { behavior: 'deny', message: decision.reason ?? 'Denied by autonomous-runner agentLimit policy' };
      }
      params.agentBudget!.used += 1;
      return { behavior: 'allow', updatedInput: input };
    }

    const decision = evaluateToolUse(toolName, input, params.mcpAllowlist);
    params.onToolCall?.(toolName, input, decision.allow ? 'allow' : 'deny', decision.reason);
    if (decision.allow) {
      return { behavior: 'allow', updatedInput: input };
    }
    return { behavior: 'deny', message: decision.reason ?? 'Denied by autonomous-runner safety policy' };
  };

  const options: Options = {
    cwd: params.cwd,
    model: params.model,
    fallbackModel: params.fallbackModel,
    systemPrompt: params.systemPrompt,
    maxTurns: params.maxTurns,
    tools: params.tools,
    permissionMode: 'default',
    canUseTool,
    mcpServers: params.mcpServers,
    outputFormat: params.outputFormat,
    // SDK isolation mode: never inherit the operator's own ~/.claude or project .claude/settings —
    // this run must be fully reproducible from CLI flags/env, not whatever is on the host machine.
    settingSources: [],
    persistSession: false,
    abortController: params.abortController,
    stderr: params.verbose ? (data: string) => process.stderr.write(`[sdk-stderr] ${data}`) : undefined,
  };

  let resultText = '';
  let isError = false;
  let errors: string[] = [];
  let costUsd = 0;
  let numTurns = 0;
  let structuredOutput: unknown;

  for await (const message of query({ prompt: params.prompt, options })) {
    if (message.type === 'result') {
      numTurns = message.num_turns;
      costUsd = message.total_cost_usd;
      isError = message.is_error;
      if (message.subtype === 'success') {
        resultText = message.result;
        structuredOutput = message.structured_output;
      } else {
        errors = message.errors;
      }
    }
  }

  return { resultText, isError, errors, costUsd, numTurns, toolCallCount, structuredOutput };
}
