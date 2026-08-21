// Evaluation headless driver for Phase A — one-shot agent run composed from a
// frozen agent preset, with run metadata archived to a per-run directory.
//
// This is an EVALUATION-ONLY runner (dsh-researcher/evaluation/runtime).
// It extends the shipped @deepseek-ai/dsh-headless driver with:
//   - preset composition: mounts the preset named by DSH_EVAL_PRESET through
//     agentPresets.mount() in the agent factory setup (the shipped headless
//     runner composes no preset at all);
//   - plan-mode activation: for DSH_EVAL_PLAN=1, activates the plan-mode realm
//     of the composed preset (plan/mode state, same mechanism as /plan);
//   - run archive: writes <DSH_EVAL_OUT>/run.json with run id, preset, session
//     id, task, timestamps, duration and final outcome (the raw session JSONL
//     is archived by the caller from DSH_HOME/sessions).
//
// Env contract (set by the run harness, recorded per run in run.json):
//   DSH_EVAL_PRESET   preset id (standard | plan-condition uses standard +
//                      DSH_EVAL_PLAN=1 | researcher-quick | researcher-deep)
//   DSH_EVAL_PLAN     "1" to activate plan mode after the agent is created
//   DSH_EVAL_RUN_ID   stable run id (e.g. flask-standard-01)
//   DSH_EVAL_OUT      output directory for run.json
//   DSH_EVAL_TASK     the frozen uniform task text (fallback: argv)
//
// The driver reads NO ground truth and writes NOTHING into the workspace: the
// caller runs it with cwd = <snapshot>/workspace/ and the fs sandbox pinned to
// read-only via DSH_PERMISSION_MODE=read-only.

import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { installModelSelection } from "@deepseek-ai/dsh-agent";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";

const name = "eval-headless-runner";
const inject = ["agentDefaultModel", "agents", "sessions"];

const env = (key, fallback = undefined) => {
  const value = process.env[key];
  return value === undefined || value === "" ? fallback : value;
};

function summarize(events, firstSeq) {
  let started = false;
  let text = "";
  let reason;
  let toolCalls = 0;
  for (const event of events) {
    if (event.seq < firstSeq) continue;
    if (event.type === "turn/start") { started = true; continue; }
    if (!started) continue;
    if (event.type === "assistant/message") {
      const joined = event.data.message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      if (joined !== "") text = joined;
    }
    if (event.type === "tool/call") toolCalls += 1;
    if (event.type === "turn/end") reason = event.data.reason;
  }
  return { text, reason, toolCalls };
}

async function run(ctx, io) {
  await ctx.get("loader")?.await();
  const agents = ctx.get("agents");
  const defaultModel = ctx.get("agentDefaultModel");
  const sessions = ctx.get("sessions");
  const presets = ctx.get("agentPresets");
  if (agents === undefined || defaultModel === undefined || sessions === undefined) {
    throw new Error("eval-headless: required services (agents/agentDefaultModel/sessions) unavailable");
  }

  const presetId = env("DSH_EVAL_PRESET");
  if (presetId === undefined) throw new Error("eval-headless: DSH_EVAL_PRESET is required");
  const task = env("DSH_EVAL_TASK");
  if (task === undefined) throw new Error("eval-headless: DSH_EVAL_TASK is required");
  const runId = env("DSH_EVAL_RUN_ID", `run-${Date.now()}`);
  const outDir = env("DSH_EVAL_OUT", "eval-out");
  const wantPlan = env("DSH_EVAL_PLAN", "0") === "1";

  const resolved = presets === undefined ? undefined : await presets.resolve(presetId);
  if (resolved === undefined) throw new Error(`eval-headless: preset "${presetId}" could not be resolved (no agentPresets service)`);

  const selection = defaultModel.currentSelection();
  const sessionId = SessionId(`session-${randomUUID()}`);
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();

  const { agent } = await agents.create({
    sessionId,
    meta: { cwd: process.cwd() },
    agentOptions: { provider: selection.provider, model: selection.model },
    setup: async (agentCtx) => {
      installModelSelection(agentCtx, { current: selection, assembled: undefined });
      if (presets !== undefined) await presets.mount(agentCtx, resolved.id);
    },
  });
  await agent.whenIdle();

  if (wantPlan) {
    const planMode = presets === undefined ? undefined : presets.serviceFor(agent, "planMode");
    if (planMode === undefined || typeof planMode.set !== "function") {
      throw new Error(`eval-headless: plan mode requested but the composed preset provides no planMode service (preset "${resolved.id}")`);
    }
    planMode.set(agent, true);
  }

  const firstSeq = agent.session.seq;
  agent.followup(createUserMessage({
    content: [{ type: "text", text: task }],
    source: { kind: "user" },
  }));
  await agent.whenIdle();
  const durationMs = Date.now() - startedMs;
  await sessions.flush(agent.session);
  const outcome = summarize(agent.session.events, firstSeq);

  const record = {
    schema: "dsh-researcher/eval-run/v1",
    run_id: runId,
    preset: resolved.id,
    plan_mode: wantPlan,
    task: task,
    session_id: String(sessionId),
    model: { provider: selection.provider, model: selection.model },
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    duration_ms: durationMs,
    tool_calls: outcome.toolCalls,
    final_reason: outcome.reason,
    exit: outcome.reason?.kind === "completed" ? 0 : 1,
  };
  await writeFile(join(outDir, "run.json"), JSON.stringify(record, null, 2));

  io.stdout.write(outcome.text + "\n");
  if (outcome.reason?.kind === "error") {
    io.stderr.write(`dsh: ${outcome.reason.error.code}: ${outcome.reason.error.message}\n`);
  }
  io.exit(record.exit);
}

function apply(ctx, config) {
  const exit = ctx.get("appExit");
  if (exit === undefined) throw new Error("eval-headless-runner: the launcher must provide ctx.appExit before the tree mounts");
  const io = { stdout: process.stdout, stderr: process.stderr, exit };
  run(ctx, io).catch((error) => {
    io.stderr.write(`dsh: ${error instanceof Error ? error.message : String(error)}\n`);
    io.exit(1);
  });
}

export { apply, inject, name };
