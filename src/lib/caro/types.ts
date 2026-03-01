// ==================== CARO (GOMOKU) TYPES ====================
import {
  BoardGamePlayerConfig,
  BoardGamePlayer,
  BoardGameChatMessage,
  BoardGameAgentResponse,
  BoardGameApiLogEntry,
  MoveRecord,
  GameMode,
  Expression,
} from '@/lib/boardgame/types';

// ==================== BOARD ====================
export const BOARD_SIZE = 15; // Standard Gomoku 15x15
export const WIN_LENGTH = 5;  // 5 in a row to win

export type CaroCell = 'X' | 'O' | null;
export type CaroBoard = CaroCell[][];

// ==================== PLAYER ====================
export interface CaroPlayer extends BoardGamePlayer {
  color: 'X' | 'O';
  wins: number;
}

// ==================== MOVE ====================
export interface CaroMove {
  row: number;
  col: number;
  player: 'X' | 'O';
}

// ==================== PHASE ====================
export type CaroPhase = 'setup' | 'playing' | 'ended';

// ==================== WIN INFO ====================
export interface WinInfo {
  winner: 'X' | 'O';
  cells: Array<{ row: number; col: number }>;
  direction: 'horizontal' | 'vertical' | 'diagonal_down' | 'diagonal_up';
}

// ==================== GAME STATE ====================
export interface CaroGameState {
  board: CaroBoard;
  players: [CaroPlayer, CaroPlayer] | null;
  currentPlayer: 'X' | 'O';
  phase: CaroPhase;
  moveHistory: MoveRecord[];
  lastMove: CaroMove | null;
  winInfo: WinInfo | null;
  winner: 'X' | 'O' | 'draw' | null;
  gameMode: GameMode;
  
  // UI
  logs: BoardGameChatMessage[];
  apiLogs: BoardGameApiLogEntry[];
  speed: number;
  isRunning: boolean;
  ttsEnabled: boolean;
  isSimulating: boolean;
  isSpeakingTTS: boolean;
  thoughtProbability: number;
  activePlayerId: string | null;
}

// Re-export for convenience
export type {
  BoardGamePlayerConfig,
  BoardGameChatMessage as CaroChatMessage,
  BoardGameAgentResponse as CaroAgentResponse,
  BoardGameApiLogEntry as CaroApiLogEntry,
  MoveRecord,
  GameMode,
  Expression,
};

// ==================== HELPERS ====================
export function createEmptyBoard(): CaroBoard {
  return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
}

export function formatMove(move: CaroMove): string {
  const colLetter = String.fromCharCode(65 + move.col); // A-O
  return `${colLetter}${move.row + 1}`;
}

export function parseMove(notation: string): { row: number; col: number } | null {
  const match = notation.match(/^([A-Oa-o])(\d+)$/);
  if (!match) {
    // Try parsing "row,col" format
    const parts = notation.split(',').map(s => parseInt(s.trim(), 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      const { row, col } = { row: parts[0], col: parts[1] };
      // Validate bounds for "row,col" format too
      if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return null;
      return { row, col };
    }
    return null;
  }
  const col = match[1].toUpperCase().charCodeAt(0) - 65;
  const row = parseInt(match[2], 10) - 1;
  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return null;
  return { row, col };
}

export function boardToAscii(board: CaroBoard, lastMove?: CaroMove | null): string {
  const header = '   ' + Array(BOARD_SIZE).fill(0).map((_, i) => String.fromCharCode(65 + i)).join(' ');
  const rows = board.map((row, r) => {
    const rowNum = String(r + 1).padStart(2, ' ');
    const cells = row.map((cell, c) => {
      const isLast = lastMove && lastMove.row === r && lastMove.col === c;
      if (cell === 'X') return isLast ? '⊗' : 'X';
      if (cell === 'O') return isLast ? '⊙' : 'O';
      return '·';
    }).join(' ');
    return `${rowNum} ${cells}`;
  });
  return [header, ...rows].join('\n');
}

export function getValidMoves(board: CaroBoard): Array<{ row: number; col: number }> {
  const moves: Array<{ row: number; col: number }> = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === null) {
        moves.push({ row: r, col: c });
      }
    }
  }
  return moves;
}

// Get moves near existing pieces (for smarter AI suggestions)
export function getStrategicMoves(board: CaroBoard): Array<{ row: number; col: number }> {
  const moves: Array<{ row: number; col: number }> = [];
  const visited = new Set<string>();
  
  // Check if board is empty
  let hasAnyPiece = false;
  for (let r = 0; r < BOARD_SIZE && !hasAnyPiece; r++) {
    for (let c = 0; c < BOARD_SIZE && !hasAnyPiece; c++) {
      if (board[r][c] !== null) hasAnyPiece = true;
    }
  }
  
  // If empty, return center
  if (!hasAnyPiece) {
    return [{ row: Math.floor(BOARD_SIZE / 2), col: Math.floor(BOARD_SIZE / 2) }];
  }
  
  // Find all cells adjacent to existing pieces
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] !== null) {
        // Check 8 directions
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && board[nr][nc] === null) {
              const key = `${nr},${nc}`;
              if (!visited.has(key)) {
                visited.add(key);
                moves.push({ row: nr, col: nc });
              }
            }
          }
        }
      }
    }
  }
  
  return moves.length > 0 ? moves : getValidMoves(board);
}

// ==================== WIN DETECTION ====================
export function checkWin(board: CaroBoard, lastMove: CaroMove): WinInfo | null {
  const { row, col, player } = lastMove;
  
  const directions: Array<{ dr: number; dc: number; name: WinInfo['direction'] }> = [
    { dr: 0, dc: 1, name: 'horizontal' },
    { dr: 1, dc: 0, name: 'vertical' },
    { dr: 1, dc: 1, name: 'diagonal_down' },
    { dr: 1, dc: -1, name: 'diagonal_up' },
  ];
  
  for (const { dr, dc, name } of directions) {
    const cells: Array<{ row: number; col: number }> = [{ row, col }];
    
    // Count in positive direction
    for (let i = 1; i < WIN_LENGTH; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) break;
      if (board[r][c] !== player) break;
      cells.push({ row: r, col: c });
    }
    
    // Count in negative direction
    for (let i = 1; i < WIN_LENGTH; i++) {
      const r = row - dr * i;
      const c = col - dc * i;
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) break;
      if (board[r][c] !== player) break;
      cells.unshift({ row: r, col: c });
    }
    
    if (cells.length >= WIN_LENGTH) {
      return { winner: player, cells, direction: name };
    }
  }
  
  return null;
}

export function checkDraw(board: CaroBoard): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === null) return false;
    }
  }
  return true;
}
