'use client';

import { create } from 'zustand';
import {
  XiangqiGameState,
  XiangqiPlayer,
  XiangqiPhase,
  XiangqiMove,
  XiangqiChatMessage,
  XiangqiApiLogEntry,
  XiangqiBoard,
  XiangqiColor,
  XiangqiPiece,
  MoveRecord,
  GameMode,
  BoardGamePlayerConfig,
  createInitialBoard,
  formatMove,
  BOARD_ROWS,
  BOARD_COLS,
} from '@/lib/xiangqi/types';
import { uid } from '@/lib/boardgame/types';

/* ---------- store interface ---------- */
interface XiangqiStore extends XiangqiGameState {
  // Setup
  initGame: (player1: BoardGamePlayerConfig, player2: BoardGamePlayerConfig, mode: GameMode) => void;
  resetGame: () => void;
  
  // Game actions
  makeMove: (from: { row: number; col: number }, to: { row: number; col: number }) => XiangqiMove | null;
  
  // Phase control
  setPhase: (phase: XiangqiPhase) => void;
  
  // Selection (for human play)
  selectSquare: (square: { row: number; col: number } | null) => void;
  
  // Logs
  addLog: (msg: Omit<XiangqiChatMessage, 'id' | 'timestamp'>) => void;
  addApiLog: (entry: Omit<XiangqiApiLogEntry, 'id'>) => void;
  
  // Player UI
  setActivePlayer: (id: string | null) => void;
  setPlayerExpression: (playerId: string, expression: string) => void;
  addCapture: (color: XiangqiColor, piece: XiangqiPiece) => void;
  
  // Control
  setSpeed: (ms: number) => void;
  setRunning: (r: boolean) => void;
  setInCheck: (v: boolean) => void;
  
  // TTS and settings
  setTtsEnabled: (v: boolean) => void;
  setSimulating: (v: boolean) => void;
  setIsSpeakingTTS: (v: boolean) => void;
  setThoughtProbability: (v: number) => void;
  
  // Helpers
  getCurrentPlayer: () => XiangqiPlayer | null;
  getPieceAt: (row: number, col: number) => XiangqiPiece | null;
  
  // Replay
  replayLogs: XiangqiChatMessage[];
  replayMoves: MoveRecord[];
  replayIndex: number;
  isReplaying: boolean;
  setReplaying: (v: boolean) => void;
  setReplayIndex: (i: number) => void;
  loadReplay: (logs: XiangqiChatMessage[], moves: MoveRecord[]) => void;
}

export const useXiangqiStore = create<XiangqiStore>((set, get) => ({
  /* ---- initial state ---- */
  board: createInitialBoard(),
  players: null,
  currentTurn: 'red',
  phase: 'setup',
  moveHistory: [],
  lastMove: null,
  winner: null,
  gameMode: 'ai_vs_ai',
  inCheck: false,
  
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
    const player1: XiangqiPlayer = {
      ...player1Config,
      color: 'red',
      expression: '😎',
      captures: [],
      wins: 0,
    };
    
    const player2: XiangqiPlayer = {
      ...player2Config,
      color: 'black',
      expression: '😎',
      captures: [],
      wins: 0,
    };
    
    set({
      board: createInitialBoard(),
      players: [player1, player2],
      currentTurn: 'red',
      phase: 'playing',
      moveHistory: [],
      lastMove: null,
      winner: null,
      gameMode: mode,
      inCheck: false,
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
      board: createInitialBoard(),
      players: null,
      currentTurn: 'red',
      phase: 'setup',
      moveHistory: [],
      lastMove: null,
      winner: null,
      inCheck: false,
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
  makeMove(from, to) {
    const state = get();
    if (state.phase !== 'playing' && state.phase !== 'check') return null;
    
    // Validate bounds
    if (from.row < 0 || from.row >= BOARD_ROWS || from.col < 0 || from.col >= BOARD_COLS) return null;
    if (to.row < 0 || to.row >= BOARD_ROWS || to.col < 0 || to.col >= BOARD_COLS) return null;
    
    const piece = state.board[from.row][from.col];
    if (!piece) return null;
    if (piece.color !== state.currentTurn) return null;
    
    // Create new board
    const newBoard: XiangqiBoard = state.board.map(r => r.map(c => c ? { ...c } : null));
    const captured = newBoard[to.row][to.col];
    
    // Execute move
    newBoard[to.row][to.col] = piece;
    newBoard[from.row][from.col] = null;
    
    const move: XiangqiMove = {
      from,
      to,
      piece,
      captured: captured ?? undefined,
    };
    
    const moveRecord: MoveRecord = {
      moveNumber: state.moveHistory.length + 1,
      player: state.currentTurn,
      notation: formatMove(move),
      timestamp: Date.now(),
    };
    
    // Check if captured the king
    const capturedKing = captured?.type === 'K';
    let winner: XiangqiColor | 'draw' | null = null;
    let newPhase: XiangqiPhase = 'playing';
    
    if (capturedKing) {
      winner = state.currentTurn;
      newPhase = 'checkmate';
    }
    
    // Track captured piece
    if (captured && state.players) {
      const capturingColor = state.currentTurn;
      const newPlayers = state.players.map(p => {
        if (p.color === capturingColor) {
          return { ...p, captures: [...p.captures, captured] };
        }
        return p;
      }) as [XiangqiPlayer, XiangqiPlayer];
      set({ players: newPlayers });
    }
    
    const nextTurn: XiangqiColor = state.currentTurn === 'red' ? 'black' : 'red';
    
    set({
      board: newBoard,
      lastMove: move,
      moveHistory: [...state.moveHistory, moveRecord],
      currentTurn: winner ? state.currentTurn : nextTurn,
      phase: newPhase,
      winner,
      selectedSquare: null,
      validMoves: [],
    });
    
    return move;
  },

  /* ---- selection ---- */
  selectSquare(square) {
    const state = get();
    if (!square) {
      set({ selectedSquare: null, validMoves: [] });
      return;
    }
    
    const piece = state.board[square.row][square.col];
    if (!piece || piece.color !== state.currentTurn) {
      set({ selectedSquare: null, validMoves: [] });
      return;
    }
    
    // For now, just highlight the square. Full move validation would use sl-wukong-engine
    // This is a simplified version that allows all moves (validation in makeMove)
    set({ selectedSquare: square, validMoves: [] });
  },

  /* ---- phase ---- */
  setPhase(phase) {
    set({ phase });
  },

  /* ---- logging ---- */
  addLog(msg) {
    const full: XiangqiChatMessage = { ...msg, id: uid(), timestamp: Date.now() };
    set((s) => ({ logs: [...s.logs, full] }));
  },

  addApiLog(entry) {
    const full: XiangqiApiLogEntry = { ...entry, id: uid() };
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
      p.id === playerId ? { ...p, expression: expression as XiangqiPlayer['expression'] } : p
    ) as [XiangqiPlayer, XiangqiPlayer];
    
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
    }) as [XiangqiPlayer, XiangqiPlayer];
    
    set({ players: newPlayers });
  },

  /* ---- control ---- */
  setSpeed(ms) {
    set({ speed: ms });
  },

  setRunning(r) {
    set({ isRunning: r });
  },

  setInCheck(v) {
    set({ inCheck: v });
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
    return state.players.find(p => p.color === state.currentTurn) ?? null;
  },

  getPieceAt(row, col) {
    const state = get();
    if (row < 0 || row >= BOARD_ROWS || col < 0 || col >= BOARD_COLS) return null;
    return state.board[row][col];
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
