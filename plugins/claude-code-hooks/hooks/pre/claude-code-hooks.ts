/**
 * Simulated Claude Code hook-runner environment.
 *
 * Lets hook commands written against the Claude hooks protocol run unchanged
 * under omp: parses the hooks section of a Claude Code settings.json, builds
 * the stdin payload Claude Code would send, executes the command with Claude's
 * exit-code contract, and maps outputs onto omp handler results. Payload
 * synthesis, matcher filtering, and the omp-side effect are fixed per Claude
 * hook event, so bindings only declare hook/matcher/command/timeout.
 *
 * Semantics mirrored from Claude Code (src/utils/hooks.ts):
 * - exit 0: stdout starting with "{" parses as hook JSON, otherwise plain
 *   text; plain stdout is model-visible context for SessionStart and
 *   UserPromptSubmit only
 * - exit 2: blocking feedback (stderr, stdout as fallback)
 * - other exit codes: non-blocking error, stderr logged
 * - matcher: empty or "*" matches all; comma/pipe lists of plain words match
 *   exactly; anything else is a regex
 *
 * Support coverage - terminal field paths marked ✅ supported, ⚠️ partial,
 * or ❌ unsupported, in three lists: settings fields, stdin payload fields, and
 * stdout JSON fields. Paths come from claude-code-settings.json and the Claude
 * Code hooks documentation. Realized events: PreToolUse, PostToolUse,
 * PostToolUseFailure, PermissionRequest, SessionStart, UserPromptSubmit, Stop,
 * PreCompact, PostCompact, SessionEnd, MessageDisplay; every other schema event
 * is skipped with a report. All event items share the same $defs/hookMatcher
 * shape, so each settings leaf is shown once on the literal prefix
 * .hooks.PreToolUse[] and behaves identically on every other event.
 *
 * Settings:
 * ⚠️ `.hooks.PreToolUse[].matcher` - comma/pipe word lists match exactly, anything else is a regex; filters by tool name on tool events and by source on SessionStart, never filters PreCompact
 * ⚠️ `.hooks.PreToolUse[].hooks[].type` - only "command" of the five hook types runs
 * ✅ `.hooks.PreToolUse[].hooks[].command` - executed as given, ${CLAUDE_PROJECT_DIR} expands to the working directory
 * ✅ `.hooks.PreToolUse[].hooks[].timeout` - seconds converted to milliseconds, defaulting per event
 * ❌ `.hooks.PreToolUse[].hooks[].async` - ignored
 * ❌ `.hooks.PreToolUse[].hooks[].asyncRewake` - ignored
 * ❌ `.hooks.PreToolUse[].hooks[].shell` - ignored
 * ❌ `.hooks.PreToolUse[].hooks[].args` - ignored
 * ❌ `.hooks.PreToolUse[].hooks[].if` - ignored
 * ❌ `.hooks.PreToolUse[].hooks[].statusMessage` - ignored
 * ❌ `.hooks.PreToolUse[].hooks[].prompt` - prompt and agent hook types, skipped
 * ❌ `.hooks.PreToolUse[].hooks[].model` - prompt and agent hook types, skipped
 * ❌ `.hooks.PreToolUse[].hooks[].continueOnBlock` - prompt hook type, skipped
 * ❌ `.hooks.PreToolUse[].hooks[].url` - http hook type, skipped
 * ❌ `.hooks.PreToolUse[].hooks[].headers` - http hook type, skipped
 * ❌ `.hooks.PreToolUse[].hooks[].allowedEnvVars` - http hook type, skipped
 * ❌ `.hooks.PreToolUse[].hooks[].server` - mcp_tool hook type, skipped
 * ❌ `.hooks.PreToolUse[].hooks[].tool` - mcp_tool hook type, skipped
 * ❌ `.hooks.PreToolUse[].hooks[].input` - mcp_tool hook type, skipped
 *
 * Stdin:
 * ✅ `.hook_event_name` - always the triggering event name
 * ✅ `.cwd` - the handler's working directory
 * ⚠️ `.session_id` - placeholder, always an empty string
 * ⚠️ `.transcript_path` - placeholder, always an empty string
 * ❌ `.prompt_id` - omp exposes no prompt identifier
 * ❌ `.permission_mode` - omp does not report the session permission mode
 * ❌ `.effort.level` - omp does not report the session effort
 * ✅ `.source` - SessionStart, sources startup, clear, compact, resume
 * ❌ `.model` - SessionStart, omp does not report the active model
 * ❌ `.session_title` - SessionStart, no session titles under omp
 * ✅ `.prompt` - UserPromptSubmit prompt
 * ✅ `.tool_name` - capitalized tool name on tool events
 * ⚠️ `.tool_input` - full input on tool events, absent on PermissionRequest since omp exposes no approval input
 * ✅ `.tool_use_id` - omp toolCallId on PreToolUse, PostToolUse, PostToolUseFailure
 * ✅ `.tool_response` - PostToolUse tool output
 * ❌ `.duration_ms` - PostToolUse and PostToolUseFailure, omp events carry no timing
 * ✅ `.error` - PostToolUseFailure, text of the failed result
 * ❌ `.is_interrupt` - PostToolUseFailure, omp does not distinguish interrupts
 * ✅ `.stop_hook_active` - Stop, true when a Stop hook already continued once
 * ✅ `.last_assistant_message` - Stop, text of the final assistant message
 * ❌ `.background_tasks` - Stop, no task registry access
 * ❌ `.session_crons` - Stop, no cron registry access
 * ❌ `.trigger` - PreCompact and PostCompact manual/auto distinction, omp cannot tell
 * ✅ `.custom_instructions` - PreCompact, omp customInstructions, null when absent
 * ✅ `.compact_summary` - PostCompact, omp compaction summary
 * ⚠️ `.reason` - SessionEnd, always "other"
 * ✅ `.delta` - MessageDisplay, full message text in one batch
 * ✅ `.index` - MessageDisplay, always 0, omp fires once per message
 * ✅ `.final` - MessageDisplay, always true
 * ❌ `.turn_id` - MessageDisplay, omp has no turn identifier
 * ❌ `.message_id` - MessageDisplay, omp has no message identifier
 *
 * Stdout:
 * ✅ `.systemMessage` - shown to the user through the logger
 * ✅ `.reason` - block reason, paired with decision "block" or permissionDecision "deny"
 * ❌ `.continue` - ignored
 * ❌ `.stopReason` - ignored
 * ❌ `.suppressOutput` - ignored
 * ❌ `.terminalSequence` - ignored, handlers have no terminal write path
 * ✅ `.hookSpecificOutput.hookEventName` - must match the event or the object is ignored
 * ✅ `.hookSpecificOutput.additionalContext` - context injection, with the Cursor-style top-level additional_context fallback
 * ✅ `.hookSpecificOutput.updatedInput` - replaces the whole tool input, PreToolUse
 * ⚠️ `.hookSpecificOutput.permissionDecision` - only "deny" blocks, allow, ask, and defer are ignored
 * ✅ `.hookSpecificOutput.permissionDecisionReason` - reason for a deny
 * ❌ `.hookSpecificOutput.initialUserMessage` - SessionStart, omp injects context only
 * ❌ `.hookSpecificOutput.sessionTitle` - SessionStart and UserPromptSubmit, no session titles under omp
 * ❌ `.hookSpecificOutput.watchPaths` - SessionStart, no file watcher to seed
 * ❌ `.hookSpecificOutput.reloadSkills` - SessionStart, omp discovers skills before hooks run
 * ❌ `.hookSpecificOutput.suppressOriginalPrompt` - UserPromptSubmit block notice, omp blocks silently
 * ❌ `.hookSpecificOutput.decision.behavior` - PermissionRequest, omp approval handlers cannot decide
 * ❌ `.hookSpecificOutput.decision.updatedInput` - PermissionRequest allow rewrite, handlers cannot decide
 * ❌ `.hookSpecificOutput.decision.updatedPermissions` - PermissionRequest allow rules, handlers cannot decide
 * ❌ `.hookSpecificOutput.decision.message` - PermissionRequest deny feedback, handlers cannot decide
 * ❌ `.hookSpecificOutput.decision.interrupt` - PermissionRequest deny stop, handlers cannot decide
 * ❌ `.hookSpecificOutput.updatedToolOutput` - PostToolUse, omp rewrites content only through additionalContext
 * ❌ `.hookSpecificOutput.updatedMCPToolOutput` - PostToolUse MCP rewrite, unsupported
 * ❌ `.hookSpecificOutput.classifierContext` - PostToolUse auto-mode classifier, omp has no classifier
 * ❌ `.hookSpecificOutput.displayContent` - MessageDisplay, display is observe-only
 * ⚠️ `.decision` - "block" blocks PreToolUse and continues the turn on Stop, PermissionRequest decisions are ignored
 *
 * Environment variables seen by the handler process:
 * ✅ `parent environment` - inherited from the omp process, like Claude Code hooks inherit theirs
 * ⚠️ `CLAUDE_PROJECT_DIR` - set to the handler working directory, Claude Code pins it to the project root where the session started
 * ❌ `CLAUDE_ENV_FILE` - SessionStart, Setup, CwdChanged, and FileChanged only, omp has no env persistence file
 * ✅ `CLAUDE_CODE_REMOTE` - absent, matching the local CLI
 * ✅ `CLAUDE_CODE_BRIDGE_SESSION_ID` - absent, omp has no Remote Control sessions
 * ❌ `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` - not honored, inherited variables are never scrubbed
 * ❌ `OTEL_*` - exporter variables are inherited, not stripped
 * ✅ `CLAUDE_MODEL` - no such variable, matching Claude Code
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** Claude Code's default hook timeout; UserPromptSubmit and MessageDisplay lower it. */
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const USER_PROMPT_TIMEOUT_MS = 30 * 1000;
const MESSAGE_DISPLAY_TIMEOUT_MS = 10 * 1000;
/** SessionEnd runs inside Claude Code's shutdown time budget. */
const SESSION_END_TIMEOUT_MS = 1500;

/** Per-event default timeout: 600s generally, 30s UserPromptSubmit, 10s MessageDisplay, SessionEnd on a shutdown budget. */
function defaultTimeoutMs(event: ClaudeHookName): number {
	if (event === "UserPromptSubmit") return USER_PROMPT_TIMEOUT_MS;
	if (event === "MessageDisplay") return MESSAGE_DISPLAY_TIMEOUT_MS;
	if (event === "SessionEnd") return SESSION_END_TIMEOUT_MS;
	return DEFAULT_TIMEOUT_MS;
}

export interface HookContext {
	cwd: string;
}

export type ClaudeHookEvent =
	| { event: "SessionStart"; source: string }
	| { event: "UserPromptSubmit"; prompt: string }
	| { event: "PreToolUse"; toolName: string; toolInput: Record<string, unknown>; toolUseId: string }
	| { event: "PostToolUse"; toolName: string; toolInput: Record<string, unknown>; toolResponse: unknown; toolUseId: string }
	| { event: "PostToolUseFailure"; toolName: string; toolInput: Record<string, unknown>; error: string }
	| { event: "Stop"; stopHookActive: boolean; lastAssistantMessage: string | null }
	| { event: "PreCompact"; customInstructions: string | null }
	| { event: "PostCompact"; compactSummary: string }
	| { event: "SessionEnd"; reason: string }
	| { event: "PermissionRequest"; toolName: string }
	| { event: "MessageDisplay"; delta: string };

export type ClaudeHookOutput = Record<string, unknown>;

export type ClaudeHookName = ClaudeHookEvent["event"];

/** Minimal slice of the omp hook API the bindings need. */
export interface ClaudeHookHost {
	on(event: string, handler: (event: any, ctx: HookContext) => unknown): void;
	sendMessage(message: { customType: string; content: string; display: boolean }): void;
	logger?: { error(message: string): void; warn(message: string): void };
}

export interface ClaudeHookBinding {
	/** Claude hook_event_name simulated by this row. */
	hook: ClaudeHookName;
	/** Filter as in Claude settings: tool names for PreToolUse/PostToolUse, source names for SessionStart. Omit to match all. */
	matcher?: string;
	command: string;
	/** Timeout in milliseconds. */
	timeout: number;
}

function buildPayload(event: ClaudeHookEvent, ctx: HookContext): string {
	const base = { session_id: "", transcript_path: "", cwd: ctx.cwd, hook_event_name: event.event };
	switch (event.event) {
		case "SessionStart":
			return JSON.stringify({ ...base, source: event.source });
		case "UserPromptSubmit":
			return JSON.stringify({ ...base, prompt: event.prompt });
		case "PreToolUse":
			return JSON.stringify({ ...base, tool_name: event.toolName, tool_input: event.toolInput, tool_use_id: event.toolUseId });
		case "PostToolUse":
			return JSON.stringify({ ...base, tool_name: event.toolName, tool_input: event.toolInput, tool_response: event.toolResponse, tool_use_id: event.toolUseId });
		case "PostToolUseFailure":
			return JSON.stringify({ ...base, tool_name: event.toolName, tool_input: event.toolInput, error: event.error });
		case "Stop":
			return JSON.stringify({ ...base, stop_hook_active: event.stopHookActive, ...(event.lastAssistantMessage !== null ? { last_assistant_message: event.lastAssistantMessage } : {}) });
		case "PreCompact":
			return JSON.stringify({ ...base, custom_instructions: event.customInstructions });
		case "PostCompact":
			return JSON.stringify({ ...base, compact_summary: event.compactSummary });
		case "SessionEnd":
			return JSON.stringify({ ...base, reason: event.reason });
		case "PermissionRequest":
			return JSON.stringify({ ...base, tool_name: event.toolName });
		case "MessageDisplay":
			return JSON.stringify({ ...base, delta: event.delta, index: 0, final: true });
	}
}

interface CommandResult {
	stdout: string;
	stderr: string;
	/** Process exit code, or null when the command timed out. */
	code: number | null;
}

function runCommand(command: string, stdin: string, ctx: HookContext, timeoutMs: number): Promise<CommandResult> {
	const { promise, resolve } = Promise.withResolvers<CommandResult>();
	const child = spawn(command, {
		shell: true,
		cwd: ctx.cwd,
		env: { ...process.env, CLAUDE_PROJECT_DIR: ctx.cwd },
		stdio: ["pipe", "pipe", "pipe"],
	});
	let stdout = "";
	let stderr = "";
	const timer = setTimeout(() => {
		child.kill();
		resolve({ stdout, stderr, code: null });
	}, timeoutMs);
	child.stdout?.on("data", (chunk: Buffer) => {
		stdout += chunk.toString();
	});
	child.stderr?.on("data", (chunk: Buffer) => {
		stderr += chunk.toString();
	});
	child.on("error", (err) => {
		clearTimeout(timer);
		resolve({ stdout, stderr: stderr || err.message, code: 1 });
	});
	child.on("close", (code) => {
		clearTimeout(timer);
		resolve({ stdout, stderr, code });
	});
	child.stdin.end(stdin);
	return promise;
}

/** What one hook execution means to the triggering flow. */
export interface ClaudeHookRun {
	/** Exit code 2: blocking feedback for the event. */
	blocked?: string;
	/** Parsed stdout JSON (exit 0). */
	json?: ClaudeHookOutput;
	/** Plain stdout text (exit 0). */
	plainText?: string;
}

export interface ClaudeHookEnv {
	run(event: ClaudeHookEvent, command: string, ctx: HookContext, timeoutMs: number): Promise<ClaudeHookRun>;
}

/** Stdout starting with "{" parses as hook JSON; anything else is plain text. */
function parseStdout(stdout: string): { json?: ClaudeHookOutput; plainText?: string } {
	const trimmed = stdout.trim();
	if (!trimmed.startsWith("{")) return { plainText: trimmed || undefined };
	try {
		const json: unknown = JSON.parse(trimmed);
		return json && typeof json === "object" && !Array.isArray(json) ? { json: json as ClaudeHookOutput } : { plainText: trimmed };
	} catch {
		return { plainText: trimmed };
	}
}

export function createClaudeHookEnv(onProblem: (message: string) => void = () => {}): ClaudeHookEnv {
	return {
		async run(event, command, ctx, timeoutMs) {
			const { stdout, stderr, code } = await runCommand(
				command.replaceAll("${CLAUDE_PROJECT_DIR}", ctx.cwd),
				buildPayload(event, ctx),
				ctx,
				timeoutMs,
			);
			if (code === null) {
				onProblem("claude hook timed out after " + timeoutMs / 1000 + "s: " + command);
				return {};
			}
			const feedback = (stderr || stdout).trim();
			if (code === 2) return { blocked: feedback || "Blocked by hook" };
			if (code !== 0) {
				onProblem("claude hook exited " + code + ": " + (feedback || command));
				return {};
			}
			const parsed = parseStdout(stdout);
			const systemMessage = parsed.json?.systemMessage;
			if (typeof systemMessage === "string" && systemMessage) onProblem("claude hook: " + systemMessage);
			return parsed;
		},
	};
}

/** hookSpecificOutput for the given event, or undefined when absent or tagged with a different hookEventName. */
function specificOutput(json: ClaudeHookOutput | undefined, event: ClaudeHookName): Record<string, unknown> | undefined {
	const raw = json?.hookSpecificOutput;
	if (!raw || typeof raw !== "object") return undefined;
	const specific = raw as { hookEventName?: unknown };
	return specific.hookEventName === event ? (specific as Record<string, unknown>) : undefined;
}

/** additionalContext from hook JSON, with the Cursor-style top-level fallback. */
function additionalContext(run: ClaudeHookRun, event: ClaudeHookName): string | null {
	const specific = specificOutput(run.json, event)?.additionalContext;
	if (typeof specific === "string" && specific) return specific;
	const topLevel = run.json?.additional_context;
	if (typeof topLevel === "string" && topLevel) return topLevel;
	return null;
}

/** PreToolUse deny: top-level decision "block", or hookSpecificOutput.permissionDecision "deny". */
function denyReason(json: ClaudeHookOutput | undefined): string | null {
	if (json?.decision === "block") return (typeof json.reason === "string" && json.reason) || "Blocked by hook";
	const specific = specificOutput(json, "PreToolUse");
	if (specific?.permissionDecision === "deny") {
		const reason = specific.permissionDecisionReason ?? json?.reason;
		return (typeof reason === "string" && reason) || "Blocked by hook";
	}
	return null;
}

/** updatedInput replaces the whole tool input, as in Claude Code. */
function updatedInput(json: ClaudeHookOutput | undefined): Record<string, unknown> | null {
	const updated = specificOutput(json, "PreToolUse")?.updatedInput;
	return updated && typeof updated === "object" ? (updated as Record<string, unknown>) : null;
}

/** omp tool names are lowercase, Claude's are capitalized. */
function claudeToolName(toolName: string): string {
	return toolName ? toolName[0].toUpperCase() + toolName.slice(1) : toolName;
}

// omp names the subagent field agent, Claude calls it subagent_type
function claudeToolInput(toolName: string, input: Record<string, unknown> | undefined): Record<string, unknown> {
	const normalized = { ...(input ?? {}) };
	if (toolName === "task" && normalized.agent !== undefined && normalized.subagent_type === undefined) {
		normalized.subagent_type = normalized.agent;
	}
	return normalized;
}

function messageText(content: unknown): string | null {
	if (typeof content === "string") return content || null;
	if (!Array.isArray(content)) return null;
	const text = content
		.filter((part): part is { text: string } => typeof part === "object" && part !== null && (part as { type?: string }).type === "text")
		.map(part => part.text)
		.join("");
	return text || null;
}

/** Compile a Claude matcher: empty and "*" match all, word lists match exactly, anything else is a regex. */
function compileMatcher(matcher: string | undefined): ((value: string) => boolean) | undefined {
	if (!matcher || matcher === "*") return undefined;
	if (/^[a-zA-Z0-9_\- ,|]+$/.test(matcher)) {
		const names = matcher.split(/[|,]/).map(part => part.trim()).filter(Boolean);
		return value => names.includes(value);
	}
	try {
		const regex = new RegExp(matcher);
		return value => regex.test(value);
	} catch {
		return () => false;
	}
}

/** Loose shape of the omp events the bindings subscribe to. */
interface OmpHookEvent {
	text?: string;
	toolName?: string;
	toolCallId?: string;
	input?: Record<string, unknown>;
	content?: Array<{ type: string; text: string }>;
	isError?: boolean;
	/** session_switch reason: "new" | "fork" | "resume" */
	reason?: string;
	/** session_before_compact user-provided summary focus */
	customInstructions?: string;
	/** session_compact compaction entry */
	compactionEntry?: { summary?: string };
	/** session_stop final assistant message */
	last_assistant_message?: { content?: unknown };
	stop_hook_active?: boolean;
	/** assistant message on message_end */
	message?: { content?: unknown };
}

/** Claude hook name -> omp events realizing it, with per-event payload synthesis and filtering. */
const HOOK_REALIZATIONS: Record<ClaudeHookName, (binding: ClaudeHookBinding) => Array<{ ompEvent: string; payload(event: OmpHookEvent): ClaudeHookEvent | null }>> = {
	SessionStart: (binding) => {
		const matcher = compileMatcher(binding.matcher);
		return [
			{ ompEvent: "session_start", payload: () =>
				!matcher || matcher("startup") ? { event: "SessionStart", source: "startup" } : null },
			{ ompEvent: "session_compact", payload: () =>
				!matcher || matcher("compact") ? { event: "SessionStart", source: "compact" } : null },
			// /clear keeps the session in place and emits no omp event; /new and
			// session resume surface as session_switch. Claude's fresh-conversation
			// source after /clear maps to reason "new", resuming a session to "resume".
			{ ompEvent: "session_switch", payload: (event) => {
				const source = event.reason === "new" ? "clear" : event.reason === "resume" ? "resume" : null;
				return source && (!matcher || matcher(source)) ? { event: "SessionStart", source } : null;
			} },
		];
	},
	UserPromptSubmit: () => [
		{ ompEvent: "input", payload: (event) =>
			typeof event.text === "string" && !event.text.startsWith("/")
				? { event: "UserPromptSubmit", prompt: event.text }
				: null },
	],
	PreToolUse: (binding) => {
		const matcher = compileMatcher(binding.matcher);
		return [
			{ ompEvent: "tool_call", payload: (event) => {
				const toolName = claudeToolName(event.toolName ?? "");
				if (matcher && !matcher(toolName)) return null;
				return { event: "PreToolUse", toolName, toolInput: claudeToolInput(event.toolName ?? "", event.input), toolUseId: event.toolCallId ?? "" };
			} },
		];
	},
	PostToolUse: (binding) => {
		const matcher = compileMatcher(binding.matcher);
		return [
			{ ompEvent: "tool_result", payload: (event) => {
				if (event.isError) return null;
				const toolName = claudeToolName(event.toolName ?? "");
				if (matcher && !matcher(toolName)) return null;
				return { event: "PostToolUse", toolName, toolInput: claudeToolInput(event.toolName ?? "", event.input), toolResponse: event.content, toolUseId: event.toolCallId ?? "" };
			} },
		];
	},
	PostToolUseFailure: (binding) => {
		const matcher = compileMatcher(binding.matcher);
		return [
			{ ompEvent: "tool_result", payload: (event) => {
				if (!event.isError) return null;
				const toolName = claudeToolName(event.toolName ?? "");
				if (matcher && !matcher(toolName)) return null;
				return { event: "PostToolUseFailure", toolName, toolInput: claudeToolInput(event.toolName ?? "", event.input), error: messageText(event.content) ?? "" };
			} },
		];
	},
	Stop: () => [
		{ ompEvent: "session_stop", payload: (event) => ({ event: "Stop", stopHookActive: event.stop_hook_active === true, lastAssistantMessage: messageText(event.last_assistant_message?.content) }) },
	],
	// omp does not expose whether a compaction is manual or automatic, so a
	// PreCompact matcher never filters and every compaction runs the hook
	PreCompact: () => [
			{ ompEvent: "session_before_compact", payload: (event) => ({ event: "PreCompact", customInstructions: typeof event.customInstructions === "string" ? event.customInstructions : null }) },
		],
	PostCompact: () => [
			{ ompEvent: "session_compact", payload: (event) => ({ event: "PostCompact", compactSummary: typeof event.compactionEntry?.summary === "string" ? event.compactionEntry.summary : "" }) },
		],
	SessionEnd: () => [{ ompEvent: "session_shutdown", payload: () => ({ event: "SessionEnd", reason: "other" }) }],
	PermissionRequest: (binding) => {
		const matcher = compileMatcher(binding.matcher);
		return [
			// observe-only under omp: the approval event carries no tool input
			// and its handlers cannot allow or deny, so hook output is logged only
			{ ompEvent: "tool_approval_requested", payload: (event) => {
				const toolName = claudeToolName(event.toolName ?? "");
				return !matcher || matcher(toolName) ? { event: "PermissionRequest", toolName } : null;
			} },
		];
	},
	MessageDisplay: () => [
		{ ompEvent: "message_end", payload: (event) => {
			const text = messageText(event.message?.content);
			return text ? { event: "MessageDisplay", delta: text } : null;
		} },
	],
};

/** Fixed omp-side effect for each Claude hook event. */
const HOOK_APPLY: Record<ClaudeHookName, (run: ClaudeHookRun, event: OmpHookEvent, pi: ClaudeHookHost) => unknown> = {
	SessionStart: (run, _event, pi) => {
		// Blocking errors are ignored for SessionStart; plain stdout is context
		const text = additionalContext(run, "SessionStart") ?? run.plainText ?? null;
		if (text) pi.sendMessage({ customType: "claude-session-start", content: text, display: false });
		return undefined;
	},
	UserPromptSubmit: (run, event, pi) => {
		if (run.blocked !== undefined) {
			pi.logger?.error("claude hook blocked prompt: " + run.blocked);
			return { handled: true };
		}
		const text = additionalContext(run, "UserPromptSubmit") ?? run.plainText ?? null;
		return text ? { text: text + "\n\n" + event.text } : undefined;
	},
	PreToolUse: (run, _event, pi) => {
		if (run.blocked !== undefined) return { block: true, reason: run.blocked };
		const deny = denyReason(run.json);
		if (deny) return { block: true, reason: deny };
		const updated = updatedInput(run.json);
		if (updated) return { input: updated };
		const text = additionalContext(run, "PreToolUse");
		if (text) pi.sendMessage({ customType: "claude-pre-tool-use", content: text, display: false });
		return undefined;
	},
	PostToolUse: (run, event) => {
		// Exit 2 shows stderr to the model; additionalContext is prepended to the result
		const text = run.blocked ?? additionalContext(run, "PostToolUse");
		return text ? { content: [{ type: "text", text }, ...(event.content ?? [])] } : undefined;
	},
	PostToolUseFailure: (run, event) => {
		// Same contract as PostToolUse
		const text = run.blocked ?? additionalContext(run, "PostToolUseFailure");
		return text ? { content: [{ type: "text", text }, ...(event.content ?? [])] } : undefined;
	},
	Stop: (run) => {
		// A blocked stop continues the turn with the hook feedback, as in Claude Code
		const reason = run.blocked ?? denyReason(run.json);
		if (reason) return { decision: "block", reason };
		return undefined;
	},
	PreCompact: run => (run.blocked !== undefined ? { cancel: true } : undefined),
	// PostCompact, SessionEnd, PermissionRequest, MessageDisplay are
	// observability-only here; problems already surface through the logger
	PostCompact: () => undefined,
	SessionEnd: () => undefined,
	PermissionRequest: () => undefined,
	MessageDisplay: () => undefined,
};

/**
 * Extract command bindings from a Claude Code settings object's hooks section.
 * Unsupported events and non-command hooks are skipped; timeouts convert from
 * Claude's seconds to milliseconds.
 */
export function parseClaudeHookSettings(settings: unknown, onError: (message: string) => void = () => {}): ClaudeHookBinding[] {
	const bindings: ClaudeHookBinding[] = [];
	const root = settings as { hooks?: unknown } | null | undefined;
	const groupsByEvent = root && typeof root === "object" ? root.hooks : undefined;
	if (!groupsByEvent || typeof groupsByEvent !== "object") return bindings;
	for (const [event, groups] of Object.entries(groupsByEvent)) {
		if (!(event in HOOK_APPLY)) {
			onError("skipping unsupported event " + event);
			continue;
		}
		if (!Array.isArray(groups)) continue;
		for (const group of groups) {
			if (!group || typeof group !== "object") continue;
			const { matcher, hooks } = group as { matcher?: unknown; hooks?: unknown };
			const pattern = typeof matcher === "string" && matcher.trim() ? matcher : undefined;
			if (!Array.isArray(hooks)) continue;
			for (const hook of hooks) {
				if (!hook || typeof hook !== "object") continue;
				const { type, command, timeout } = hook as { type?: unknown; command?: unknown; timeout?: unknown };
				if (type !== "command" || typeof command !== "string" || !command) continue;
				bindings.push({
					hook: event as ClaudeHookName,
					matcher: pattern,
					command,
						timeout:
						typeof timeout === "number" && timeout > 0
							? timeout * 1000
							: defaultTimeoutMs(event as ClaudeHookName),
				});
			}
		}
	}
	return bindings;
}

/** Read Claude Code settings files (~ expands to home, relative to cwd) and bind their hooks. Missing files are skipped. */
export function bindClaudeHooksFromFile(pi: ClaudeHookHost, paths: string[]): ClaudeHookBinding[] {
	const bindings: ClaudeHookBinding[] = [];
	for (const raw of paths) {
		const file = raw.startsWith("~") ? path.join(os.homedir(), raw.slice(1)) : path.resolve(raw);
		let text: string;
		try {
			text = fs.readFileSync(file, "utf8");
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== "ENOENT") pi.logger?.error("claude hooks: " + file + ": " + (err as Error).message);
			continue;
		}
		const report = (message: string) => pi.logger?.error("claude hooks: " + file + ": " + message);
		try {
			bindings.push(...parseClaudeHookSettings(JSON.parse(text), report));
		} catch (err) {
			report((err as Error).message);
		}
	}
	bindClaudeHooks(pi, bindings);
	return bindings;
}

export function bindClaudeHooks(pi: ClaudeHookHost, bindings: ClaudeHookBinding[]): void {
	const env = createClaudeHookEnv(message => pi.logger?.error(message));
	for (const binding of bindings) {
		const apply = HOOK_APPLY[binding.hook];
		for (const realization of HOOK_REALIZATIONS[binding.hook](binding)) {
			pi.on(realization.ompEvent, async (event, ctx) => {
				const claudeEvent = realization.payload(event);
				if (!claudeEvent) return;
				const run = await env.run(claudeEvent, binding.command, ctx, binding.timeout);
				return apply(run, event, pi);
			});
		}
	}
}

// ===...
// omp plugin entry
// =============================================================================

const PLUGIN_NAME = "claude-code-hooks";
const DEFAULT_CLAUDE_SETTINGS_PATHS = "~/.claude/settings.json,.claude/settings.json,.claude/settings.local.json";

/**
 * Settings paths from omp plugin settings (lock file plus project overrides),
 * mirroring getPluginSettings without importing omp internals.
 */
async function claudeSettingsPaths(cwd: string): Promise<string[]> {
	const scoped = async (file: string): Promise<Record<string, unknown>> => {
		try {
			const parsed = (await Bun.file(file).json()) as { settings?: Record<string, Record<string, unknown>> };
			return parsed.settings?.[PLUGIN_NAME] ?? {};
		} catch {
			return {};
		}
	};
	const configRoot = process.env.PI_CONFIG_DIR ?? path.join(os.homedir(), ".omp");
	const global = await scoped(path.join(configRoot, "plugins", "omp-plugins.lock.json"));
	let project: Record<string, unknown> = {};
	for (const dir of [".omp", ".pi"]) {
		const settings = await scoped(path.join(cwd, dir, "plugin-overrides.json"));
		if (Object.keys(settings).length > 0) {
			project = settings;
			break;
		}
	}
	const raw = project.claudeSettingsPaths ?? global.claudeSettingsPaths ?? DEFAULT_CLAUDE_SETTINGS_PATHS;
	return typeof raw === "string" ? raw.split(",").map(s => s.trim()).filter(Boolean) : [];
}

export default async function (pi: ClaudeHookHost): Promise<void> {
	bindClaudeHooksFromFile(pi, await claudeSettingsPaths(process.cwd()));
}
