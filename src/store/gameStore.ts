'use client';

import { create } from 'zustand';
import {
  ApiLogEntry,
  ChatMessage,
  GamePhase,
  GameState,
  NightResult,
  Player,
  PlayerConfig,
  Role,
  ROLE_INFO,
} from '@/lib/types';

/* ---------- helpers ---------- */
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  let seed = Date.now();
  const next = () => {
    seed = (seed * 1664525 + 1013904223) | 0;
    return (seed >>> 0) / 0x100000000;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Decide role distribution based on player count.
 * Returns array of roles with length === playerCount.
 */
function distributeRoles(count: number): Role[] {
  if (count < 6) {
    // minimal: 1 wolf, 1 seer, rest villagers
    const roles: Role[] = ['werewolf', 'seer'];
    while (roles.length < count) roles.push('villager');
    return shuffleArray(roles);
  }
  if (count <= 8) {
    // 2 wolves, seer, guard, witch, rest villagers
    const roles: Role[] = ['werewolf', 'werewolf', 'seer', 'guard', 'witch'];
    while (roles.length < count) roles.push('villager');
    return shuffleArray(roles);
  }
  // 9+: 3 wolves, seer, guard, witch, hunter, rest villagers
  const roles: Role[] = [
    'werewolf',
    'werewolf',
    'werewolf',
    'seer',
    'guard',
    'witch',
    'hunter',
  ];
  while (roles.length < count) roles.push('villager');
  return shuffleArray(roles);
}

/* ---------- initial night result ---------- */
function emptyNightResult(): NightResult {
  return {
    wolfTarget: null,
    guardTarget: null,
    seerTarget: null,
    seerResult: null,
    witchSave: false,
    witchKillTarget: null,
    deaths: [],
  };
}

/* ---------- store interface ---------- */
interface GameStore extends GameState {
  // setup
  initGame: (configs: PlayerConfig[]) => void;
  // phase control
  setPhase: (phase: GamePhase) => void;
  nextDay: () => void;
  // logs
  addLog: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  // night actions
  setWolfTarget: (targetId: string) => void;
  setSeerTarget: (targetId: string, result: 'wolf' | 'village') => void;
  setGuardTarget: (targetId: string) => void;
  setWitchSave: (save: boolean) => void;
  setWitchKill: (targetId: string | null) => void;
  resolveNight: () => string[]; // returns death ids
  // day actions
  castVote: (voterId: string, targetId: string) => void;
  resolveVotes: () => string | null; // returns eliminated id or null (tie)
  // player state
  killPlayer: (playerId: string) => void;
  addPlayerMemory: (playerId: string, msg: ChatMessage) => void;
  // game end
  checkWinCondition: () => 'wolf' | 'village' | null;
  setWinner: (w: 'wolf' | 'village') => void;
  // control
  setSpeed: (ms: number) => void;
  setRunning: (r: boolean) => void;
  resetNight: () => void;
  resetVotes: () => void;
  setActivePlayer: (id: string | null, whispering?: boolean) => void;
  addApiLog: (entry: Omit<ApiLogEntry, 'id'>) => void;
  ttsEnabled: boolean;
  setTtsEnabled: (v: boolean) => void;
  isSpeakingTTS: boolean;
  setIsSpeakingTTS: (v: boolean) => void;
  daySummary: string | null;
  setDaySummary: (summary: string | null) => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  /* ---- state ---- */
  players: [],
  phase: 'setup',
  dayCount: 0,
  logs: [],
  nightResult: emptyNightResult(),
  winner: null,
  speed: 2000,
  isRunning: false,
  daySummary: null,
  witchHasHeal: true,
  witchHasPoison: true,
  lastGuardTarget: null,
  votes: {},
  activePlayerId: null,
  isWhispering: false,
  apiLogs: [],
  ttsEnabled: false,
  isSpeakingTTS: false,

  /* ---- setup ---- */
  initGame(configs) {
    const roles = distributeRoles(configs.length);
    const players: Player[] = configs.map((c, i) => ({
      ...c,
      role: roles[i],
      alive: true,
      memory: [],
    }));
    set({
      players,
      phase: 'night_start',
      dayCount: 1,
      logs: [],
      nightResult: emptyNightResult(),
      winner: null,
      witchHasHeal: true,
      witchHasPoison: true,
      lastGuardTarget: null,
      votes: {},
      activePlayerId: null,
      isWhispering: false,
      apiLogs: [],
      daySummary: null,
      isRunning: true,
    });
  },

  /* ---- phase ---- */
  setPhase(phase) {
    set({ phase });
  },
  nextDay() {
    set((s) => ({ dayCount: s.dayCount + 1 }));
  },

  /* ---- logging ---- */
  addLog(msg) {
    const full: ChatMessage = { ...msg, id: uid(), timestamp: Date.now() };
    set((s) => ({ logs: [...s.logs, full] }));
    return full;
  },

  /* ---- night ---- */
  setWolfTarget(targetId) {
    set((s) => ({ nightResult: { ...s.nightResult, wolfTarget: targetId } }));
  },
  setSeerTarget(targetId, result) {
    set((s) => ({
      nightResult: { ...s.nightResult, seerTarget: targetId, seerResult: result },
    }));
  },
  setGuardTarget(targetId) {
    set((s) => ({
      nightResult: { ...s.nightResult, guardTarget: targetId },
      lastGuardTarget: targetId,
    }));
  },
  setWitchSave(save) {
    set((s) => ({
      nightResult: { ...s.nightResult, witchSave: save },
      witchHasHeal: save ? false : s.witchHasHeal,
    }));
  },
  setWitchKill(targetId) {
    set((s) => ({
      nightResult: { ...s.nightResult, witchKillTarget: targetId },
      witchHasPoison: targetId ? false : s.witchHasPoison,
    }));
  },

  resolveNight() {
    const { nightResult, players } = get();
    const deaths: string[] = [];

    // wolf kill – unless guarded or witch saved
    if (nightResult.wolfTarget) {
      const guarded = nightResult.guardTarget === nightResult.wolfTarget;
      const saved = nightResult.witchSave;
      if (!guarded && !saved) {
        deaths.push(nightResult.wolfTarget);
      }
    }

    // witch poison
    if (nightResult.witchKillTarget) {
      if (!deaths.includes(nightResult.witchKillTarget)) {
        deaths.push(nightResult.witchKillTarget);
      }
    }

    // apply deaths
    const updatedPlayers = players.map((p) =>
      deaths.includes(p.id) ? { ...p, alive: false } : p,
    );

    set({
      players: updatedPlayers,
      nightResult: { ...nightResult, deaths },
    });

    return deaths;
  },

  /* ---- day ---- */
  castVote(voterId, targetId) {
    set((s) => ({ votes: { ...s.votes, [voterId]: targetId } }));
  },

  resolveVotes() {
    const { votes, players } = get();
    // tally
    const tally: Record<string, number> = {};
    for (const targetId of Object.values(votes)) {
      tally[targetId] = (tally[targetId] || 0) + 1;
    }
    if (Object.keys(tally).length === 0) return null;

    const maxVotes = Math.max(...Object.values(tally));
    const topCandidates = Object.keys(tally).filter((id) => tally[id] === maxVotes);

    // tie → no elimination
    if (topCandidates.length > 1) return null;

    const eliminatedId = topCandidates[0];
    const updatedPlayers = players.map((p) =>
      p.id === eliminatedId ? { ...p, alive: false } : p,
    );
    set({ players: updatedPlayers });
    return eliminatedId;
  },

  /* ---- player state ---- */
  killPlayer(playerId) {
    set((s) => ({
      players: s.players.map((p) =>
        p.id === playerId ? { ...p, alive: false } : p,
      ),
    }));
  },

  addPlayerMemory(playerId, msg) {
    set((s) => ({
      players: s.players.map((p) =>
        p.id === playerId ? { ...p, memory: [...p.memory, msg] } : p,
      ),
    }));
  },

  /* ---- win condition ---- */
  checkWinCondition() {
    const { players } = get();
    const alive = players.filter((p) => p.alive);
    const wolves = alive.filter((p) => p.role === 'werewolf');
    const villagers = alive.filter((p) => p.role !== 'werewolf');

    if (wolves.length === 0) return 'village';
    if (wolves.length >= villagers.length) return 'wolf';
    return null;
  },

  setWinner(w) {
    set({ winner: w, phase: 'game_over', isRunning: false });
  },

  /* ---- control ---- */
  setSpeed(ms) {
    set({ speed: ms });
  },
  setRunning(r) {
    set({ isRunning: r });
  },
  resetNight() {
    set({ nightResult: emptyNightResult() });
  },
  resetVotes() {
    set({ votes: {} });
  },
  setActivePlayer(id, whispering = false) {
    set({ activePlayerId: id, isWhispering: whispering });
  },
  addApiLog(entry) {
    const full: ApiLogEntry = { ...entry, id: uid() };
    set((s) => ({ apiLogs: [...s.apiLogs, full] }));
  },
  setTtsEnabled(v) {
    set({ ttsEnabled: v });
  },
  setIsSpeakingTTS(v) {
    set({ isSpeakingTTS: v });
  },
  setDaySummary(summary) {
    set({ daySummary: summary });
  },
}));
