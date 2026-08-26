/**
 * DeepSeek Harness Host plugin: the `rtk` tool.
 *
 * RTK is a CLI that compacts noisy command output before it reaches model
 * context — the DSH equivalent of Claude Code's RTK hook, minus the hook,
 * which DSH has no layer for. This host-only bundle registers a first-class
 * `rtk` tool and a system-prompt guidance band. The tool routes `rtk <command>`
 * through the same `ctx.shell` executor the `pwsh` tool uses, so sandbox
 * confinement, approval escalation, `DSH_*` env, and the pwsh rendering
 * contract all keep working. There is deliberately NO pre-tool-use rewrite and
 * NO wrapper around `pwsh`: the model chooses to call `rtk`, and the sandbox
 * and approval stack stay authoritative.
 */

import { isAbsolute, resolve } from "node:path";

export const name = "dsh-rtk";
export const inject = ["tools", "shell", "systemPrompt", "shellEnv"];

const RTK_PREFIX = "rtk ";

/** Closed escalation-target vocabulary, mirrored from dsh-sandbox (`read-only` is the floor). */
const ESCALATION_TARGETS = ["workspace-write", "danger-full-access"];
/** Which modes are strictly wider than each mode, mirrored from dsh-sandbox. */
const WIDER_MODES = {
  "read-only": ["workspace-write", "danger-full-access"],
  "workspace-write": ["danger-full-access"],
};

function sandboxDenialMarker(mode) {
  return `[sandbox: file access denied under ${mode} mode]`;
}

function escalationHintMarker(subject) {
  return `[sandbox: escalation available — retry this exact ${subject} once with sandbox_permissions (the narrowest wider mode that suffices) + justification; the approval prompt asks the user]`;
}

/** Validate the escalation pair a tool schema cannot express, mirrored from dsh-sandbox. */
function validateEscalationArgs(sandboxPermissions, justification) {
  if (sandboxPermissions !== void 0 && justification === void 0) throw new Error("invalid escalation: sandbox_permissions requires a justification");
  if (justification !== void 0 && sandboxPermissions === void 0) throw new Error("invalid escalation: justification is only valid together with sandbox_permissions");
  if (justification !== void 0 && justification.trim().length === 0) throw new Error("invalid justification: expected a non-empty sentence");
}

/**
 * Faithful inline copy of dsh-sandbox's fail-closed escalation decision:
 * strict-widening check, then the approval channel, then outcome mapping.
 * Inlined so the plugin never needs to import a package outside the monorepo's
 * resolvable closure (which would otherwise fail boot).
 */
function approveEscalation(request, approval) {
  const { requestedMode: mode, effectiveMode, justification, subject } = request;
  if (!(WIDER_MODES[effectiveMode] ?? []).includes(mode)) {
    throw new Error(`sandbox escalation to "${mode}" is not strictly wider than this call's current "${effectiveMode}" mode`);
  }
  if (approval.approver === void 0) throw new Error(`sandbox escalation to "${mode}" requires approval, but no approval service is composed`);
  if (approval.agent === void 0) throw new Error(`sandbox escalation to "${mode}" requires approval, but the call has no agent to route it through`);
  return approval.approver.request({
    agent: approval.agent,
    toolName: approval.toolName,
    callId: approval.callId,
    reason: `escalate sandbox to ${mode}: ${justification}`,
    ...approval.signal ? { signal: approval.signal } : {},
  }).then((outcome) => {
    switch (outcome) {
      case "allowed-once": return mode;
      case "rejected": throw new Error(`the user rejected escalating this ${subject} to "${mode}"`);
      case "cancelled": throw new Error(`approval for escalating to "${mode}" was cancelled`);
      case "unavailable": throw new Error(`sandbox escalation to "${mode}" requires approval, but no approval channel is available`);
      default: throw new Error(`unexpected approval outcome: ${String(outcome)}`);
    }
  });
}

/** Append the truncation notice (with the full-output spill path) to a stream's text. */
function streamText(output) {
  if (!output.truncated) return output.text;
  return `${output.text}\n[output truncated; full output: ${output.spillPath ?? "(unavailable)"}]`;
}

/** Shape one finished run into the text the model sees, matching the pwsh contract. */
function renderRtkResult(result, escalationModes = []) {
  const out = streamText(result.stdout);
  const err = streamText(result.stderr);
  let body = out;
  if (err.length > 0) {
    if (body.length > 0 && !body.endsWith("\n")) body += "\n";
    body += `[stderr]\n${err}`;
  }
  if (body.length === 0) body = "(no output)";
  const markers = [];
  if (result.sandbox?.denied) {
    markers.push(sandboxDenialMarker(result.sandbox.mode));
    if (escalationModes.length > 0) markers.push(escalationHintMarker("command"));
  }
  if (result.timedOut) markers.push(`[timed out after ${result.timeoutMs}ms]`);
  if (result.signal !== null) markers.push(`[killed by signal: ${result.signal}]`);
  else if (result.exitCode !== 0) markers.push(`[exit code: ${result.exitCode}]`);
  if (markers.length === 0) return body;
  if (!body.endsWith("\n")) body += "\n";
  return body + markers.join("\n");
}

/** Detach the executor result DTO from readonly Service Definition types into plain JSON data. */
function canonicalRtkResult(result) {
  const output = (stream) => ({
    text: stream.text,
    truncated: stream.truncated,
    ...stream.spillPath !== void 0 ? { spillPath: stream.spillPath } : {},
  });
  return {
    kind: "foreground",
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    aborted: result.aborted,
    timeoutMs: result.timeoutMs,
    stdout: output(result.stdout),
    stderr: output(result.stderr),
    ...result.sandbox !== void 0 ? { sandbox: {
      mode: result.sandbox.mode,
      denied: result.sandbox.denied,
      ...result.sandbox.enforcement !== void 0 ? { enforcement: result.sandbox.enforcement } : {},
      ...result.sandbox.runnerFailed !== void 0 ? { runnerFailed: result.sandbox.runnerFailed } : {},
    } } : {},
  };
}

/** Resolve an explicit workdir first (relative = session-workspace-relative), else the session header cwd. */
function resolveWorkdir(modelWorkdir, exec) {
  const headerCwd = exec.agent?.session.header.cwd;
  if (modelWorkdir === void 0) return headerCwd;
  if (headerCwd !== void 0 && !isAbsolute(modelWorkdir)) return resolve(headerCwd, modelWorkdir);
  return modelWorkdir;
}

/** Validate model arguments for the raw-registered tool (the registry does not own input validation). */
function validateRtkArgs(args) {
  if (typeof args.command !== "string" || args.command.trim().length === 0) throw new Error("invalid command: expected a non-empty string");
  if (args.description !== void 0) {
    if (typeof args.description !== "string" || args.description.trim().length === 0) throw new Error("invalid description: expected a non-empty string");
  }
  if (args.timeoutMs !== void 0 && (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0)) {
    throw new Error(`invalid timeoutMs: expected a positive number, got ${JSON.stringify(args.timeoutMs)}`);
  }
  validateEscalationArgs(args.sandbox_permissions, args.justification);
}

/** Split the pwsh-style trailing exit markers off the rendered body for the terminal card. */
function parseExitStatusMin(text) {
  const trimmed = text.replace(/\n+$/, "");
  const lines = trimmed.split("\n");
  const markers = [];
  while (lines.length > 0) {
    const last = lines[lines.length - 1];
    if (!/^\[(?:exit code: -?\d+|killed by signal: .+|timed out after \d+ms)\]$/.test(last)) break;
    markers.unshift(last);
    lines.pop();
  }
  const body = lines.join("\n");
  const exit = {};
  for (const marker of markers) {
    const em = /^\[exit code: (-?\d+)\]$/.exec(marker);
    if (em) { exit.exitCode = Number(em[1]); continue; }
    const sm = /^\[killed by signal: (.+)\]$/.exec(marker);
    if (sm) { exit.signal = sm[1]; continue; }
    const tm = /^\[timed out after (\d+)ms\]$/.exec(marker);
    if (tm) exit.timedOut = true;
  }
  return { body, ...exit };
}

function rtkDescription(escalationModes) {
  const base = "Run a read through the `rtk` CLI and get its compact, filtered output instead of the full noisy command output. RTK summarizes supported commands before the output reaches context. Pass what comes AFTER `rtk` in `command` — do not prefix it with `rtk`. Examples: `git status`, `git diff`, `git log --oneline`, `git show <ref>`, `rg <pattern>`, `read <file>`, `test <command>`. It runs through the same PowerShell executor `pwsh` uses, so paths take native Windows form (`C:\\...`), `$env:NAME` reads work, and `DSH_*` harness facts are exposed. Non-zero exits are reported as `[exit code: N]`. Prefer this tool for noisy supported READ commands. Use the native `pwsh` command instead for mutations, interactive commands, exact-output parsing, and diagnosis when filtering hides detail. ";
  if (escalationModes.length === 0) return base;
  return base + "To escalate a sandbox-denied run, retry the exact command once with `sandbox_permissions` (the narrowest wider mode) plus `justification`.";
}

export function apply(ctx) {
  const defaultMode = ctx.shell.sandboxMode;
  const escalationModes = defaultMode === void 0 ? [] : ESCALATION_TARGETS;
  const sandboxPolicy = defaultMode === void 0 ? void 0 : ctx.get("sandboxPolicy");
  if (defaultMode !== void 0 && sandboxPolicy === void 0) {
    throw new Error("dsh-rtk: the mounted shell executor confines but ctx.sandboxPolicy is missing");
  }

  /** Resolve the complete standing policy for this call when a confining executor is mounted. */
  const resolveSandboxPolicy = (exec) => sandboxPolicy?.resolve(exec.agent === void 0 ? {} : { session: exec.agent.session });

  /** Resolve a sandbox-escalation request before anything executes, delegating the fail-closed sequence. */
  const approveRtkEscalation = (mode, justification, exec, standingPolicy) => {
    if (escalationModes.length === 0) throw new Error("sandbox_permissions is not available in this composition (no sandboxing executor to escalate)");
    return approveEscalation({
      requestedMode: mode,
      justification,
      effectiveMode: standingPolicy.mode,
      subject: "command",
    }, {
      approver: ctx.get("approval"),
      agent: exec.agent,
      callId: exec.callId,
      toolName: "rtk",
      signal: exec.signal,
    });
  };

  ctx.systemPrompt.section({
    name: "tool:rtk",
    order: 106,
    text: "Prefer `rtk` for noisy supported reads: `rtk git status`, `rtk git diff`, `rtk git log`, `rtk git show`, `rtk rg`, `rtk read`. Use `rtk test <command>` for failure-focused output and preserve its exit code; rerun the command natively when full successful output is required as evidence. Use native commands for mutations, interactivity, exact-output parsing, and diagnosis when filtering hides detail.",
  });

  ctx.tools.register(defineRtkTool({ ctx, escalationModes, resolveSandboxPolicy, approveRtkEscalation }));
}

function defineRtkTool(deps) {
  const { ctx, escalationModes } = deps;
  const parameters = {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The rtk arguments, after the `rtk` prefix (e.g. `git status`, `git diff`, `rg <pattern>`, `read <file>`).",
      },
      description: {
        type: "string",
        description: "Clear, concise description of what this read does in active voice, 5-10 words (shown in the UI).",
      },
      timeoutMs: {
        type: "number",
        description: "Timeout in milliseconds. The executor applies its configured default and cap, and kills the command on expiry.",
      },
      workdir: {
        type: "string",
        description: "Working directory for this command. Defaults to the session workspace; a relative path is resolved against it.",
      },
      ...escalationModes.length > 0 ? {
        sandbox_permissions: {
          type: "string",
          enum: [...escalationModes],
          description: "The wider sandbox mode this command needs. Only valid as a one-shot retry of a command the sandbox just denied; requires justification and user approval.",
        },
        justification: {
          type: "string",
          description: "Required with sandbox_permissions: one sentence for the user explaining why this exact command needs the wider access.",
        },
      } : {},
    },
    required: ["command"],
  };
  return {
    name: "rtk",
    description: rtkDescription(escalationModes),
    parameters,
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string", const: "foreground" },
          exitCode: { oneOf: [{ type: "integer" }, { type: "null" }] },
          signal: { oneOf: [{ type: "string" }, { type: "null" }] },
          timedOut: { type: "boolean" },
          aborted: { type: "boolean" },
          timeoutMs: { type: "number" },
          stdout: {
            type: "object",
            additionalProperties: false,
            required: ["text", "truncated"],
            properties: {
              text: { type: "string" },
              truncated: { type: "boolean" },
              spillPath: { type: "string" },
            },
          },
          stderr: {
            type: "object",
            additionalProperties: false,
            required: ["text", "truncated"],
            properties: {
              text: { type: "string" },
              truncated: { type: "boolean" },
              spillPath: { type: "string" },
            },
          },
          sandbox: {
            type: "object",
            additionalProperties: false,
            properties: {
              mode: { type: "string" },
              denied: { type: "boolean" },
              enforcement: { type: "string" },
              runnerFailed: { type: "boolean" },
            },
          },
        },
        required: ["kind", "exitCode", "signal", "timedOut", "aborted", "timeoutMs", "stdout", "stderr"],
      },
      render: (_args, value) => [{
        type: "text",
        text: renderRtkResult(value, escalationModes),
      }],
    },
    async execute(args, exec) {
      validateRtkArgs(args);
      const standingPolicy = deps.resolveSandboxPolicy(exec);
      const approvedMode = args.sandbox_permissions !== void 0 && args.justification !== void 0
        ? await deps.approveRtkEscalation(args.sandbox_permissions, args.justification, exec, standingPolicy)
        : void 0;
      const policy = approvedMode === void 0 ? standingPolicy : { ...standingPolicy, mode: approvedMode };
      const workdir = resolveWorkdir(args.workdir, exec);
      const request = {
        command: `${RTK_PREFIX}${args.command}`,
        ...workdir !== void 0 ? { workdir } : {},
        ...args.timeoutMs !== void 0 ? { timeoutMs: args.timeoutMs } : {},
        dshEnv: ctx.shellEnv.collect(exec),
        ...policy !== void 0 ? { sandboxPolicy: policy } : {},
      };
      const result = await ctx.shell.run(ctx.shell.resolve({
        ...request,
        signal: exec.signal,
      }));
      if (result.aborted) {
        const error = new Error("tool call aborted");
        error.name = "AbortError";
        throw error;
      }
      return canonicalRtkResult(result);
    },
    presentCall: (args) => {
      if (typeof args !== "object" || args === null || typeof args.command !== "string") return void 0;
      return {
        card: "terminal",
        title: args.command,
        ...typeof args.description === "string" && args.description !== "" ? { description: args.description } : {},
        ...typeof args.workdir === "string" ? { cwd: args.workdir } : {},
      };
    },
    presentResult: (args, result) => {
      const block = result.content.length === 1 ? result.content[0] : void 0;
      if (block === void 0 || block.type !== "text") return void 0;
      const raw = block.text;
      if (result.isError) {
        return {
          card: "generic",
          content: [{ type: "text", text: `\`\`\`console\n${raw.replace(/\n+$/, "")}\n\`\`\`` }],
        };
      }
      const { body, ...exit } = parseExitStatusMin(raw);
      return { card: "terminal", output: body, ...exit };
    },
  };
}
