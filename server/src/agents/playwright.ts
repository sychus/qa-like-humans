import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk';
import { config } from '../config.ts';

/** One isolated browser per agent, so testers never share sessions or cookies. */
export function playwrightServer(outputDir: string): McpServerConfig {
  const args = [
    config.playwright.cli,
    '--browser',
    config.playwright.browser,
    '--isolated',
    '--output-dir',
    outputDir,
    '--viewport-size',
    '1366x900',
  ];
  if (config.playwright.headless) args.push('--headless');
  return { type: 'stdio', command: process.execPath, args, alwaysLoad: true };
}
