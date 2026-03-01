'use client';

import { create } from 'zustand';
import {
  CaroGameState,
  CaroPlayer,
  CaroPhase,
  CaroMove,
  CaroChatMessage,
  CaroApiLogEntry,
  CaroBoard,
  MoveRecord,
  GameMode,
  BoardGamePlayerConfig,
  createEmptyBoard,
  checkWin,
  checkDraw,
  formatMove,
  BOARD_SIZE,
} from '@/lib/caro/types';
import { uid } from '@/lib/boardgame/types';

/* ---------- store interface ---------- */
interface CaroStore extends CaroGameState {
  // Setup
  initGame: (player1: BoardGamePlayerConfig, player2: BoardGamePlayerConfig, mode: GameMode) => void;
  resetGame: () => void;
  
  // Game actions
  makeMove: (row: number, col: number) => boolean;
  
  // Phase control
  setPhase: (phase: CaroPhase) => void;
  
  // Logs
  addLog: (msg: Omit<CaroChatMessage, 'id' | 'timestamp'>) => void;
  addApiLog: (entry: Omit<CaroApiLogEntry, 'id'>) => void;
  
  // Player UI
  setActivePlayer: (id: string | null) => void;
  setPlayerExpression: (playerId: string, expression: string) => void;
  
  // Control
  setSpeed: (ms: number) => void;
  setRunning: (r: boolean) => void;
  
  // TTS and settings
  setTtsEnabled: (v: boolean) => void;
  setSimulating: (v: boolean) => void;
  setIsSpeakingTTS: (v: boolean) => void;
  setThoughtProbability: (v: number) => void;
  
  // Replay
  replayLogs: CaroChatMessage[];
  replayMoves: MoveRecord[];
  replayIndex: number;
  isReplaying: boolean;
  setReplaying: (v: boolean) => void;
  setReplayIndex: (i: number) => void;
  loadReplay: (logs: CaroChatMessage[], moves: MoveRecord[]) => void;
}

export const useCaroStore = create<CaroStore>((set, get) => ({
  /* ---- initial state ---- */
  board: createEmptyBoard(),
  players: null,
  currentPlayer: 'X',
  phase: 'setup',
  moveHistory: [],
  lastMove: null,
  winInfo: null,
  winner: null,
  gameMode: 'ai_vs_ai',
  
  logs: [],
  apiLogs: [],
  speed: 1500,
  isRunning: false,
  ttsEnabled: false,
  isSimulating: false,
  isSpeakingTTS: false,
  thoughtProbability: 50,
  activePlayerId: null,
  
  replayLogs: [],
  replayMoves: [],
  replayIndex: 0,
  isReplaying: false,

  /* ---- setup ---- */
  initGame(player1Config, player2Config, mode) {
    const player1: CaroPlayer = {
      ...player1Config,
      color: 'X',
      expression: '😎',
      wins: 0,
    };
    
    const player2: CaroPlayer = {
      ...player2Config,
      color: 'O',
      expression: '😎',
      wins: 0,
    };
    
    set({
      board: createEmptyBoard(),
      players: [player1, player2],
      currentPlayer: 'X',
      phase: 'playing',
      moveHistory: [],
      lastMove: null,
      winInfo: null,
      winner: null,
      gameMode: mode,
      logs: [],
      apiLogs: [],
      isRunning: true,
      activePlayerId: null,
      replayLogs: [],
      replayMoves: [],
      replayIndex: 0,
      isReplaying: false,
    });
  },

  resetGame() {
    set({
      board: createEmptyBoard(),
      players: null,
      currentPlayer: 'X',
      phase: 'setup',
      moveHistory: [],
      lastMove: null,
      winInfo: null,
      winner: null,
      logs: [],
      apiLogs: [],
      isRunning: false,
      activePlayerId: null,
      replayLogs: [],
      replayMoves: [],
      replayIndex: 0,
      isReplaying: false,
    });
  },

  /* ---- game actions ---- */
  makeMove(row, col) {
    const state = get();
    if (state.phase !== 'playing') return false;
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return false;
    if (state.board[row][col] !== null) return false;
    
    const newBoard: CaroBoard = state.board.map(r => [...r]);
    newBoard[row][col] = state.currentPlayer;
    
    const move: CaroMove = { row, col, player: state.currentPlayer };
    const moveRecord: MoveRecord = {
      moveNumber: state.moveHistory.length + 1,
      player: state.currentPlayer,
      notation: formatMove(move),
      timestamp: Date.now(),
    };
    
    // Check for win
    const winInfo = checkWin(newBoard, move);
    
    // Check for draw
    const isDraw = !winInfo && checkDraw(newBoard);
    
    const nextPlayer = state.currentPlayer === 'X' ? 'O' : 'X';
    
    set({
      board: newBoard,
      lastMove: move,
      moveHistory: [...state.moveHistory, moveRecord],
      currentPlayer: winInfo ? state.currentPlayer : nextPlayer,
      winInfo,
      winner: winInfo ? winInfo.winner : isDraw ? 'draw' : null,
      phase: winInfo || isDraw ? 'ended' : 'playing',
    });
    
    return true;
  },

  /* ---- phase ---- */
  setPhase(phase) {
    set({ phase });
  },

  /* ---- logging ---- */
  addLog(msg) {
    const full: CaroChatMessage = { ...msg, id: uid(), timestamp: Date.now() };
    set((s) => ({ logs: [...s.logs, full] }));
  },

  addApiLog(entry) {
    const full: CaroApiLogEntry = { ...entry, id: uid() };
    set((s) => ({ apiLogs: [...s.apiLogs, full] }));
  },

  /* ---- player UI ---- */
  setActivePlayer(id) {
    set({ activePlayerId: id });
  },

  setPlayerExpression(playerId, expression) {
    const state = get();
    if (!state.players) return;
    
    const newPlayers = state.players.map(p => 
      p.id === playerId ? { ...p, expression: expression as CaroPlayer['expression'] } : p
    ) as [CaroPlayer, CaroPlayer];
    
    set({ players: newPlayers });
  },

  /* ---- control ---- */
  setSpeed(ms) {
    set({ speed: ms });
  },

  setRunning(r) {
    set({ isRunning: r });
  },

  /* ---- TTS and settings ---- */
  setTtsEnabled(v) {
    set({ ttsEnabled: v });
  },

  setSimulating(v) {
    set({ isSimulating: v });
  },

  setIsSpeakingTTS(v) {
    set({ isSpeakingTTS: v });
  },

  setThoughtProbability(v) {
    set({ thoughtProbability: v });
  },

  /* ---- replay ---- */
  setReplaying(v) {
    set({ isReplaying: v });
  },

  setReplayIndex(i) {
    set({ replayIndex: i });
  },

  loadReplay(logs, moves) {
    set({
      replayLogs: logs,
      replayMoves: moves,
      replayIndex: 0,
      isReplaying: false,
    });
  },
}));
