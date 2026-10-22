import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import express from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { z } from 'zod';
import type { ServerEvent } from '../../shared/events.ts';
import { config, DEFAULT_RULES_FILE } from './config.ts';
import { humanDesk } from './humanDesk.ts';
import { missions } from './mission.ts';
import { world } from './world.ts';

const StartMissionSchema = z.object({
  testCasesUrl: z.url(),
  rules: z.string().min(1),
  maxAgents: z.number().int().min(1).max(config.maxAgentsCap),
});

const AnswerSchema = z.object({ answer: z.string().min(1) });

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/api/state', (_req, res) => {
  res.json(world.snapshot());
});

app.get('/api/rules/default', async (_req, res) => {
  res.type('text/plain').send(await readFile(DEFAULT_RULES_FILE, 'utf8'));
});

app.post('/api/missions', async (req, res) => {
  const parsed = StartMissionSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: z.prettifyError(parsed.error) });
  if (missions.isRunning()) return void res.status(409).json({ error: 'A mission is already running.' });
  res.status(201).json(await missions.start(parsed.data));
});

app.post('/api/missions/stop', (_req, res) => {
  missions.stop();
  res.status(204).end();
});

app.post('/api/decisions/:id', (req, res) => {
  const parsed = AnswerSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: z.prettifyError(parsed.error) });
  const ok = humanDesk.answer(req.params.id, parsed.data.answer);
  res.status(ok ? 204 : 404).end();
});

const ClientErrorSchema = z.object({
  source: z.string().max(100),
  message: z.string().max(2000),
  stack: z.string().max(8000).optional(),
  componentStack: z.string().max(8000).optional(),
});

/** Browser crashes land in this terminal, so a black screen always leaves a trace. */
app.post('/api/client-errors', (req, res) => {
  const parsed = ClientErrorSchema.safeParse(req.body);
  if (parsed.success) {
    const { source, message, stack, componentStack } = parsed.data;
    console.error(`\n💥 [web crash] ${source}: ${message}\n${stack ?? ''}${componentStack ? `\nComponent stack:${componentStack}` : ''}\n`);
  }
  res.status(204).end();
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const send = (socket: WebSocket, event: ServerEvent) => {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
};

wss.on('connection', (socket) => {
  send(socket, { type: 'snapshot', world: world.snapshot() });
});

world.subscribe((event) => {
  for (const socket of wss.clients) send(socket, event);
});

server.listen(config.port, () => {
  console.log(`🏢 QA office engine on http://localhost:${config.port}`);
});
