'use client';

import { create } from 'zustand';
import {
  ApiLogEntry,
  ChatMessage,
  DayVoteRecord,
  GamePhase,
  GameState,
  NightResult,
  Player,
  PlayerConfig,
  Role,
  ROLE_INFO,
  SavedGame,
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
  loadSavedGame: (saved: SavedGame) => void;
  exportSavedGame: () => SavedGame;
  // replay
  replayLogs: ChatMessage[];
  replayIndex: number;
  replayApiLogs: ApiLogEntry[];
  set_replayStep: (log: ChatMessage) => void;
  startReplay: () => Promise<void>;
  stopReplay: () => void;
  // phase control
  setPhase: (phase: GamePhase) => void;
  nextDay: () => void;
  // logs
  addLog: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  // night actions
  setWolfTarget: (targetId: string) => void;
  setSeerTarget: (targetId: string, result: 'wolf' | 'village') => void;
  setGuardTarget: (targetId: string, targetName: string) => void;
  addSeerHistory: (entry: { targetName: string; result: 'wolf' | 'village'; day: number }) => void;
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
  isSimulating: boolean;
  setSimulating: (v: boolean) => void;
  isReplayMode: boolean;
  setReplayMode: (v: boolean) => void;
  isReplaying: boolean;
  setReplaying: (v: boolean) => void;
  isSpeakingTTS: boolean;
  setIsSpeakingTTS: (v: boolean) => void;
  isThinkingTTS: boolean;
  setIsThinkingTTS: (v: boolean) => void;
  thoughtProbability: number;
  setThoughtProbability: (v: number) => void;
  daySummary: string | null;
  setDaySummary: (summary: string | null) => void;
  // Vote history
  voteHistory: DayVoteRecord[];
  addVoteRecord: (record: DayVoteRecord) => void;
  // Player expressions
  setPlayerExpression: (playerName: string, expression: string) => void;
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
  seerHistory: [],
  votes: {},
  activePlayerId: null,
  isWhispering: false,
  apiLogs: [],
  ttsEnabled: false,
  isSimulating: false,
  isReplayMode: false,
  isReplaying: false,
  isSpeakingTTS: false,
  isThinkingTTS: false,
  thoughtProbability: 40,
  voteHistory: [],
  playerExpressions: {},
  replayLogs: [],
  replayIndex: 0,
  replayApiLogs: [],

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
      seerHistory: [],
      votes: {},
      activePlayerId: null,
      isWhispering: false,
      apiLogs: [],
      daySummary: null,
      isRunning: true,
      voteHistory: [],
      playerExpressions: {},
      isSimulating: false,
      isReplayMode: false,
      isReplaying: false,
      isSpeakingTTS: false,
      isThinkingTTS: false,
      replayLogs: [],
      replayIndex: 0,
      replayApiLogs: [],
    });
  },

  loadSavedGame(saved) {
    // Reset players to alive state initially
    const resetPlayers = saved.players.map((p) => ({ ...p, alive: true }));
    set({
      players: resetPlayers,
      phase: 'night_start',
      dayCount: 1,
      logs: [],
      nightResult: emptyNightResult(),
      winner: null,
      witchHasHeal: true,
      witchHasPoison: true,
      lastGuardTarget: null,
      seerHistory: [],
      votes: {},
      activePlayerId: null,
      isWhispering: false,
      apiLogs: [],
      daySummary: null,
      isRunning: true,
      voteHistory: [],
      playerExpressions: {},
      isSimulating: false,
      isReplayMode: true,
      isReplaying: false,
      isSpeakingTTS: false,
      isThinkingTTS: false,
      replayLogs: saved.logs,
      replayIndex: 0,
      replayApiLogs: saved.apiLogs || [],
    });
  },

  exportSavedGame() {
    const s = get();
    return {
      version: 1,
      createdAt: Date.now(),
      players: s.players,
      logs: s.logs,
      voteHistory: s.voteHistory,
      winner: s.winner,
      apiLogs: s.apiLogs,
    };
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
  setGuardTarget(targetId, targetName) {
    set((s) => ({
      nightResult: { ...s.nightResult, guardTarget: targetId },
      lastGuardTarget: targetName,
    }));
  },
  addSeerHistory(entry) {
    set((s) => ({ seerHistory: [...s.seerHistory, entry] }));
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
    // Allow during replay; block only during background simulation
    if (get().isSimulating) return;
    set({ activePlayerId: id, isWhispering: whispering });
  },
  addApiLog(entry) {
    const full: ApiLogEntry = { ...entry, id: uid() };
    set((s) => ({ apiLogs: [...s.apiLogs, full] }));
  },
  setTtsEnabled(v) {
    set({ ttsEnabled: v });
  },
  setSimulating(v) {
    set({ isSimulating: v });
  },
  setReplayMode(v) {
    set({ isReplayMode: v });
  },
  setReplaying(v) {
    set({ isReplaying: v });
  },
  set_replayStep(log) {
    set((s) => ({
      logs: [...s.logs, log],
      phase: log.phase,
      dayCount: log.dayCount,
      replayIndex: s.replayIndex + 1,
    }));
  },
  async startReplay() {
    const state = get();
    if (state.isReplaying || state.replayIndex >= state.replayLogs.length) return;
    
    set({ isReplaying: true });
    
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    
    while (get().isReplaying && get().replayIndex < get().replayLogs.length) {
      const currentState = get();
      const log = currentState.replayLogs[currentState.replayIndex];
      
      // Update phase and dayCount from log
      set((s) => ({
        logs: [...s.logs, log],
        phase: log.phase,
        dayCount: log.dayCount,
        replayIndex: s.replayIndex + 1,
      }));
      
      // Find player and set active
      if (log.sender !== 'system') {
        const player = currentState.players.find((p) => p.name === log.sender);
        if (player) {
          set({ activePlayerId: player.id, isWhispering: log.type === 'whisper' });
        }
      }
      
      // Handle player deaths from system messages
      if (log.type === 'system' && log.content.includes('đã bị loại')) {
        // Find player names in the death message and mark them dead
        const players = get().players;
        for (const p of players) {
          if (log.content.includes(p.name) && p.alive) {
            set((s) => ({
              players: s.players.map((pl) =>
                pl.id === p.id ? { ...pl, alive: false } : pl
              ),
            }));
          }
        }
      }
      
      // Handle elimination from voting
      if (log.type === 'system' && log.content.includes('bị trục xuất')) {
        const players = get().players;
        for (const p of players) {
          if (log.content.includes(p.name) && p.alive) {
            set((s) => ({
              players: s.players.map((pl) =>
                pl.id === p.id ? { ...pl, alive: false } : pl
              ),
            }));
          }
        }
      }
      
      // Check for winner announcement
      if (log.type === 'system' && log.content.includes('THẮNG')) {
        if (log.content.includes('SÓI')) {
          set({ winner: 'wolf', phase: 'game_over', isRunning: false });
        } else if (log.content.includes('LÀNG')) {
          set({ winner: 'village', phase: 'game_over', isRunning: false });
        }
      }
      
      // Calculate delay based on message type and speed setting
      const speed = currentState.speed;
      let waitTime = speed / 2;
      if (log.type === 'speech') waitTime = speed;
      else if (log.type === 'thought') waitTime = speed / 2;
      else if (log.type === 'system') waitTime = speed / 3;
      else if (log.type === 'vote') waitTime = speed / 4;
      
      await delay(waitTime);
      set({ activePlayerId: null });
    }
    
    set({ isReplaying: false, isRunning: false });
  },
  stopReplay() {
    set({ isReplaying: false });
  },
  setIsSpeakingTTS(v) {
    set({ isSpeakingTTS: v });
  },
  setIsThinkingTTS(v) {
    set({ isThinkingTTS: v });
  },
  setThoughtProbability(v) {
    set({ thoughtProbability: v });
  },
  setDaySummary(summary) {
    set({ daySummary: summary });
  },
  addVoteRecord(record) {
    set((s) => ({ voteHistory: [...s.voteHistory, record] }));
  },
  setPlayerExpression(playerName, expression) {
    set((s) => ({ playerExpressions: { ...s.playerExpressions, [playerName]: expression } }));
  },
}));
