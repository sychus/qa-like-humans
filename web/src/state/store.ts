import { useSyncExternalStore } from 'react';
import type { ServerEvent, World } from '../../../shared/events.ts';

type Listener = () => void;
type EventListener = (event: ServerEvent) => void;

export type LightMode = 'auto' | 'day' | 'night';

const emptyWorld = (): World => ({ mission: null, agents: [], tasks: [], bugs: [], decisions: [], chat: [] });

/**
 * Client mirror of the server world. React reads it through hooks;
 * the canvas game listens to raw events for one-shot effects (bubbles, flying bug cards).
 */
class Store {
  world: World = emptyWorld();
  connected = false;
  lightMode: LightMode = 'auto';
  private listeners = new Set<Listener>();
  private eventListeners = new Set<EventListener>();

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  setConnected(connected: boolean) {
    this.connected = connected;
    this.notify();
  }

  setLightMode(mode: LightMode) {
    this.lightMode = mode;
    this.notify();
  }

  apply(event: ServerEvent) {
    const w = { ...this.world };
    switch (event.type) {
      case 'snapshot':
        this.world = event.world;
        break;
      case 'reset':
        this.world = emptyWorld();
        break;
      case 'mission':
        this.world = { ...w, mission: event.mission };
        break;
      case 'agent': {
        const exists = w.agents.some((a) => a.id === event.agent.id);
        this.world = {
          ...w,
          agents: exists ? w.agents.map((a) => (a.id === event.agent.id ? event.agent : a)) : [...w.agents, event.agent],
        };
        break;
      }
      case 'tasks':
        this.world = { ...w, tasks: event.tasks };
        break;
      case 'bug':
        this.world = { ...w, bugs: [...w.bugs, event.bug] };
        break;
      case 'decision': {
        const exists = w.decisions.some((d) => d.id === event.decision.id);
        this.world = {
          ...w,
          decisions: exists ? w.decisions.map((d) => (d.id === event.decision.id ? event.decision : d)) : [...w.decisions, event.decision],
        };
        break;
      }
      case 'chat':
        this.world = { ...w, chat: [...w.chat.slice(-399), event.line] };
        break;
      case 'say':
        break;
    }
    for (const listener of this.eventListeners) listener(event);
    this.notify();
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }
}

export const store = new Store();

export function useWorld(): World {
  return useSyncExternalStore(store.subscribe, () => store.world);
}

export function useConnected(): boolean {
  return useSyncExternalStore(store.subscribe, () => store.connected);
}

export function useLightMode(): LightMode {
  return useSyncExternalStore(store.subscribe, () => store.lightMode);
}

export function connectSocket(): () => void {
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const open = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(`${proto}://${location.host}/ws`);
    socket.onopen = () => store.setConnected(true);
    socket.onmessage = (msg) => store.apply(JSON.parse(msg.data) as ServerEvent);
    socket.onclose = () => {
      store.setConnected(false);
      if (!closed) retry = setTimeout(open, 1500);
    };
  };

  open();
  return () => {
    closed = true;
    clearTimeout(retry);
    // Closing mid-handshake aborts the TCP connection and the Vite proxy logs ECONNRESET
    // (StrictMode does this on every dev mount), so wait for the handshake to finish.
    if (socket?.readyState === WebSocket.CONNECTING) {
      const pending = socket;
      pending.onmessage = null;
      pending.onclose = null;
      pending.onopen = () => pending.close();
    } else {
      socket?.close();
    }
  };
}
