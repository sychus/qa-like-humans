import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(here, '../..');
export const RUNS_DIR = path.join(ROOT_DIR, 'runs');
export const DEFAULT_RULES_FILE = path.join(ROOT_DIR, 'rules', 'default-qa-rules.md');

export const config = {
  port: Number(process.env.PORT ?? 8787),
  bossModel: process.env.BOSS_MODEL ?? 'claude-opus-5-5',
  qaModel: process.env.QA_MODEL ?? 'claude-opus-5-5',
  maxAgentsCap: 6,
  /** Max agentic turns per QA task, protects your wallet from runaway loops. */
  qaMaxTurns: Number(process.env.QA_MAX_TURNS ?? 60),
  playwright: {
    cli: path.join(ROOT_DIR, 'server/node_modules/@playwright/mcp/cli.js'),
    browser: process.env.PW_BROWSER ?? 'chrome',
    headless: process.env.PW_HEADED !== '1',
  },
  /** Pacing so the office animation keeps up with the engine (ms). */
  pace: {
    walk: 3200,
    talk: 2200,
  },
} as const;

/** Approximate list prices (USD per 1M tokens) for live estimates; the SDK result replaces them with its own figure. */
export const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};
