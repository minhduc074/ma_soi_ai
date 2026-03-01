'use client';

import { create } from 'zustand';
import { Chess, Move, Square, Color } from 'chess.js';
import {
  ChessGameState,
  ChessPlayer,
  ChessPhase,
  ChessChatMessage,
  ChessApiLogEntry,
  MoveRecord,
  GameMode,
  BoardGamePlayerConfig,
  getGameStatus,
  PieceSymbol,
} from '@/lib/chess/types';
import { uid } from '@/lib/boardgame/types';

/* ---------- store interface ---------- */
interface ChessStore extends ChessGameState {
  // Setup
  initGame: (player1: BoardGamePlayerConfig, player2: BoardGamePlayerConfig, mode: GameMode) => void;
  resetGame: () => void;
  
  // Game actions
  makeMove: (from: Square, to: Square, promotion?: PieceSymbol) => Move | null;
  makeMoveFromNotation: (notation: string) => Move | null;
  
  // Phase control
  setPhase: (phase: ChessPhase) => void;
  
  // Selection (for human play)
  selectSquare: (square: Square | null) => void;
  
  // Logs
  addLog: (msg: Omit<ChessChatMessage, 'id' | 'timestamp'>) => void;
  addApiLog: (entry: Omit<ChessApiLogEntry, 'id'>) => void;
  
  // Player UI
  setActivePlayer: (id: string | null) => void;
  setPlayerExpression: (playerId: string, expression: string) => void;
  addCapture: (color: 'white' | 'black', piece: PieceSymbol) => void;
  
  // Control
  setSpeed: (ms: number) => void;
  setRunning: (r: boolean) => void;
  
  // TTS and settings
  setTtsEnabled: (v: boolean) => void;
  setSimulating: (v: boolean) => void;
  setIsSpeakingTTS: (v: boolean) => void;
  setThoughtProbability: (v: number) => void;
  
  // Helpers
  getCurrentPlayer: () => ChessPlayer | null;
  getLegalMoves: (square?: Square) => Move[];
  getFen: () => string;
  getPgn: () => string;
  
  // Replay
  replayLogs: ChessChatMessage[];
  replayMoves: MoveRecord[];
  replayIndex: number;
  isReplaying: boolean;
  setReplaying: (v: boolean) => void;
  setReplayIndex: (i: number) => void;
  loadReplay: (logs: ChessChatMessage[], moves: MoveRecord[]) => void;
}

export const useChessStore = create<ChessStore>((set, get) => ({
  /* ---- initial state ---- */
  chess: null,
  players: null,
  currentTurn: 'w',
  phase: 'setup',
  moveHistory: [],
  lastMove: null,
  winner: null,
  gameMode: 'ai_vs_ai',
  
  logs: [],
  apiLogs: [],
  speed: 2000,
  isRunning: false,
  ttsEnabled: false,
  isSimulating: false,
  isSpeakingTTS: false,
  thoughtProbability: 50,
  activePlayerId: null,
  selectedSquare: null,
  validMoves: [],
  
  replayLogs: [],
  replayMoves: [],
  replayIndex: 0,
  isReplaying: false,

  /* ---- setup ---- */
  initGame(player1Config, player2Config, mode) {
    const chess = new Chess();
    
    const player1: ChessPlayer = {
      ...player1Config,
      color: 'white',
      expression: '😎',
      captures: [],
      wins: 0,
    };
    
    const player2: ChessPlayer = {
      ...player2Config,
      color: 'black',
      expression: '😎',
      captures: [],
      wins: 0,
    };
    
    set({
      chess,
      players: [player1, player2],
      currentTurn: 'w',
      phase: 'playing',
      moveHistory: [],
      lastMove: null,
      winner: null,
      gameMode: mode,
      logs: [],
      apiLogs: [],
      isRunning: true,
      activePlayerId: null,
      selectedSquare: null,
      validMoves: [],
      replayLogs: [],
      replayMoves: [],
      replayIndex: 0,
      isReplaying: false,
    });
  },

  resetGame() {
    set({
      chess: null,
      players: null,
      currentTurn: 'w',
      phase: 'setup',
      moveHistory: [],
      lastMove: null,
      winner: null,
      logs: [],
      apiLogs: [],
      isRunning: false,
      activePlayerId: null,
      selectedSquare: null,
      validMoves: [],
      replayLogs: [],
      replayMoves: [],
      replayIndex: 0,
      isReplaying: false,
    });
  },

  /* ---- game actions ---- */
  makeMove(from, to, promotion) {
    const state = get();
    const terminalPhases: ChessPhase[] = ['checkmate', 'stalemate', 'draw'];
    if (!state.chess || terminalPhases.includes(state.phase) || state.phase === 'setup') return null;
    
    try {
      const move = state.chess.move({ from, to, promotion });
      if (!move) return null;
      
      const moveRecord: MoveRecord = {
        moveNumber: state.moveHistory.length + 1,
        player: move.color === 'w' ? 'white' : 'black',
        notation: move.san,
        timestamp: Date.now(),
      };
      
      // Check game status
      const status = getGameStatus(state.chess);
      let winner: 'white' | 'black' | 'draw' | null = null;
      
      if (status.phase === 'checkmate') {
        winner = state.chess.turn() === 'w' ? 'black' : 'white';
      } else if (status.phase === 'stalemate' || status.phase === 'draw') {
        winner = 'draw';
      }
      
      // Track captured piece
      if (move.captured && state.players) {
        const capturingColor = move.color === 'w' ? 'white' : 'black';
        const newPlayers = state.players.map(p => {
          if (p.color === capturingColor) {
            return { ...p, captures: [...p.captures, move.captured as PieceSymbol] };
          }
          return p;
        }) as [ChessPlayer, ChessPlayer];
        set({ players: newPlayers });
      }
      
      set({
        lastMove: move,
        moveHistory: [...state.moveHistory, moveRecord],
        currentTurn: state.chess.turn(),
        phase: status.phase === 'playing' || status.phase === 'check' ? 'playing' : status.phase,
        winner,
        selectedSquare: null,
        validMoves: [],
      });
      
      return move;
    } catch {
      return null;
    }
  },

  makeMoveFromNotation(notation) {
    const state = get();
    const terminalPhases: ChessPhase[] = ['checkmate', 'stalemate', 'draw'];
    if (!state.chess || terminalPhases.includes(state.phase) || state.phase === 'setup') return null;
    
    try {
      const move = state.chess.move(notation);
      if (!move) return null;
      
      const moveRecord: MoveRecord = {
        moveNumber: state.moveHistory.length + 1,
        player: move.color === 'w' ? 'white' : 'black',
        notation: move.san,
        timestamp: Date.now(),
      };
      
      const status = getGameStatus(state.chess);
      let winner: 'white' | 'black' | 'draw' | null = null;
      
      if (status.phase === 'checkmate') {
        winner = state.chess.turn() === 'w' ? 'black' : 'white';
      } else if (status.phase === 'stalemate' || status.phase === 'draw') {
        winner = 'draw';
      }
      
      // Track captured piece
      if (move.captured && state.players) {
        const capturingColor = move.color === 'w' ? 'white' : 'black';
        const newPlayers = state.players.map(p => {
          if (p.color === capturingColor) {
            return { ...p, captures: [...p.captures, move.captured as PieceSymbol] };
          }
          return p;
        }) as [ChessPlayer, ChessPlayer];
        set({ players: newPlayers });
      }
      
      set({
        lastMove: move,
        moveHistory: [...state.moveHistory, moveRecord],
        currentTurn: state.chess.turn(),
        phase: status.phase === 'playing' || status.phase === 'check' ? 'playing' : status.phase,
        winner,
        selectedSquare: null,
        validMoves: [],
      });
      
      return move;
    } catch {
      return null;
    }
  },

  /* ---- selection ---- */
  selectSquare(square) {
    const state = get();
    if (!state.chess || !square) {
      set({ selectedSquare: null, validMoves: [] });
      return;
    }
    
    const moves = state.chess.moves({ square, verbose: true });
    const validSquares = moves.map(m => m.to);
    
    set({ selectedSquare: square, validMoves: validSquares });
  },

  /* ---- phase ---- */
  setPhase(phase) {
    set({ phase });
  },

  /* ---- logging ---- */
  addLog(msg) {
    const full: ChessChatMessage = { ...msg, id: uid(), timestamp: Date.now() };
    set((s) => ({ logs: [...s.logs, full] }));
  },

  addApiLog(entry) {
    const full: ChessApiLogEntry = { ...entry, id: uid() };
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
      p.id === playerId ? { ...p, expression: expression as ChessPlayer['expression'] } : p
    ) as [ChessPlayer, ChessPlayer];
    
    set({ players: newPlayers });
  },

  addCapture(color, piece) {
    const state = get();
    if (!state.players) return;
    
    const newPlayers = state.players.map(p => {
      if (p.color === color) {
        return { ...p, captures: [...p.captures, piece] };
      }
      return p;
    }) as [ChessPlayer, ChessPlayer];
    
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

  /* ---- helpers ---- */
  getCurrentPlayer() {
    const state = get();
    if (!state.players) return null;
    const color = state.currentTurn === 'w' ? 'white' : 'black';
    return state.players.find(p => p.color === color) ?? null;
  },

  getLegalMoves(square) {
    const state = get();
    if (!state.chess) return [];
    return state.chess.moves({ square, verbose: true });
  },

  getFen() {
    const state = get();
    return state.chess?.fen() ?? '';
  },

  getPgn() {
    const state = get();
    return state.chess?.pgn() ?? '';
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
