// ==================== XIANGQI (CHINESE CHESS) TYPES ====================
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
export const BOARD_ROWS = 10;
export const BOARD_COLS = 9;

// ==================== PIECE TYPES ====================
export type XiangqiPieceType = 'K' | 'A' | 'E' | 'H' | 'R' | 'C' | 'P';
// K = King (將/帥), A = Advisor (士/仕), E = Elephant (象/相)
// H = Horse (馬), R = Rook/Chariot (車), C = Cannon (砲/炮), P = Pawn (卒/兵)

export type XiangqiColor = 'red' | 'black';

export interface XiangqiPiece {
  type: XiangqiPieceType;
  color: XiangqiColor;
}

export type XiangqiCell = XiangqiPiece | null;
export type XiangqiBoard = XiangqiCell[][];

// ==================== PIECE INFO ====================
export const PIECE_NAMES: Record<XiangqiPieceType, { red: string; black: string; vi: string; value: number }> = {
  K: { red: '帥', black: '將', vi: 'Tướng', value: 0 },
  A: { red: '仕', black: '士', vi: 'Sĩ', value: 2 },
  E: { red: '相', black: '象', vi: 'Tượng', value: 2 },
  H: { red: '馬', black: '馬', vi: 'Mã', value: 4 },
  R: { red: '車', black: '車', vi: 'Xe', value: 9 },
  C: { red: '炮', black: '砲', vi: 'Pháo', value: 4.5 },
  P: { red: '兵', black: '卒', vi: 'Tốt', value: 1 },
};

// ==================== MOVE ====================
export interface XiangqiMove {
  from: { row: number; col: number };
  to: { row: number; col: number };
  piece: XiangqiPiece;
  captured?: XiangqiPiece;
}

// ==================== PLAYER ====================
export interface XiangqiPlayer extends BoardGamePlayer {
  color: 'red' | 'black';
  captures: XiangqiPiece[];
  wins: number;
}

// ==================== PHASE ====================
export type XiangqiPhase = 'setup' | 'playing' | 'check' | 'checkmate' | 'stalemate' | 'draw';

// ==================== GAME STATE ====================
export interface XiangqiGameState {
  board: XiangqiBoard;
  players: [XiangqiPlayer, XiangqiPlayer] | null;
  currentTurn: XiangqiColor;
  phase: XiangqiPhase;
  moveHistory: MoveRecord[];
  lastMove: XiangqiMove | null;
  winner: 'red' | 'black' | 'draw' | null;
  gameMode: GameMode;
  inCheck: boolean;
  
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
  selectedSquare: { row: number; col: number } | null;
  validMoves: Array<{ row: number; col: number }>;
}

// Re-export for convenience
export type {
  BoardGamePlayerConfig,
  BoardGameChatMessage as XiangqiChatMessage,
  BoardGameAgentResponse as XiangqiAgentResponse,
  BoardGameApiLogEntry as XiangqiApiLogEntry,
  MoveRecord,
  GameMode,
  Expression,
};

// ==================== INITIAL BOARD ====================
export function createInitialBoard(): XiangqiBoard {
  const board: XiangqiBoard = Array(BOARD_ROWS).fill(null).map(() => Array(BOARD_COLS).fill(null));
  
  // Black pieces (top, rows 0-4)
  board[0][0] = { type: 'R', color: 'black' };
  board[0][1] = { type: 'H', color: 'black' };
  board[0][2] = { type: 'E', color: 'black' };
  board[0][3] = { type: 'A', color: 'black' };
  board[0][4] = { type: 'K', color: 'black' };
  board[0][5] = { type: 'A', color: 'black' };
  board[0][6] = { type: 'E', color: 'black' };
  board[0][7] = { type: 'H', color: 'black' };
  board[0][8] = { type: 'R', color: 'black' };
  board[2][1] = { type: 'C', color: 'black' };
  board[2][7] = { type: 'C', color: 'black' };
  board[3][0] = { type: 'P', color: 'black' };
  board[3][2] = { type: 'P', color: 'black' };
  board[3][4] = { type: 'P', color: 'black' };
  board[3][6] = { type: 'P', color: 'black' };
  board[3][8] = { type: 'P', color: 'black' };
  
  // Red pieces (bottom, rows 5-9)
  board[9][0] = { type: 'R', color: 'red' };
  board[9][1] = { type: 'H', color: 'red' };
  board[9][2] = { type: 'E', color: 'red' };
  board[9][3] = { type: 'A', color: 'red' };
  board[9][4] = { type: 'K', color: 'red' };
  board[9][5] = { type: 'A', color: 'red' };
  board[9][6] = { type: 'E', color: 'red' };
  board[9][7] = { type: 'H', color: 'red' };
  board[9][8] = { type: 'R', color: 'red' };
  board[7][1] = { type: 'C', color: 'red' };
  board[7][7] = { type: 'C', color: 'red' };
  board[6][0] = { type: 'P', color: 'red' };
  board[6][2] = { type: 'P', color: 'red' };
  board[6][4] = { type: 'P', color: 'red' };
  board[6][6] = { type: 'P', color: 'red' };
  board[6][8] = { type: 'P', color: 'red' };
  
  return board;
}

// ==================== HELPERS ====================
export function formatPosition(row: number, col: number): string {
  // Use traditional notation: column letter (a-i) + row number (0-9)
  const colLetter = String.fromCharCode(97 + col); // a-i
  return `${colLetter}${row}`;
}

export function parsePosition(notation: string): { row: number; col: number } | null {
  const match = notation.match(/^([a-i])(\d)$/i);
  if (!match) return null;
  const col = match[1].toLowerCase().charCodeAt(0) - 97;
  const row = parseInt(match[2], 10);
  if (row < 0 || row >= BOARD_ROWS || col < 0 || col >= BOARD_COLS) return null;
  return { row, col };
}

export function formatMove(move: XiangqiMove): string {
  const from = formatPosition(move.from.row, move.from.col);
  const to = formatPosition(move.to.row, move.to.col);
  return `${from}${to}`;
}

export function parseMove(notation: string): { from: { row: number; col: number }; to: { row: number; col: number } } | null {
  // Format: "a0a1" or "a0-a1" or "a0 a1"
  const cleaned = notation.replace(/[\s\-]/g, '');
  if (cleaned.length !== 4) return null;
  
  const from = parsePosition(cleaned.slice(0, 2));
  const to = parsePosition(cleaned.slice(2, 4));
  
  if (!from || !to) return null;
  return { from, to };
}

export function getPieceChar(piece: XiangqiPiece): string {
  return PIECE_NAMES[piece.type][piece.color];
}

export function boardToAscii(board: XiangqiBoard, lastMove?: XiangqiMove | null): string {
  const lines: string[] = [];
  lines.push('   a b c d e f g h i');
  
  for (let r = 0; r < BOARD_ROWS; r++) {
    const cells: string[] = [];
    for (let c = 0; c < BOARD_COLS; c++) {
      const piece = board[r][c];
      const isLastFrom = lastMove && lastMove.from.row === r && lastMove.from.col === c;
      const isLastTo = lastMove && lastMove.to.row === r && lastMove.to.col === c;
      
      if (piece) {
        const char = getPieceChar(piece);
        if (isLastTo) {
          cells.push(`[${char}]`);
        } else {
          cells.push(` ${char}`);
        }
      } else {
        if (isLastFrom) {
          cells.push(' ○');
        } else if (r === 4 || r === 5) {
          cells.push(' ~'); // River
        } else {
          cells.push(' ·');
        }
      }
    }
    
    const rowNum = r.toString();
    lines.push(`${rowNum} ${cells.join('')} ${rowNum}`);
    
    // Add river indicator
    if (r === 4) {
      lines.push('  ═══════楚河  漢界═══════');
    }
  }
  
  lines.push('   a b c d e f g h i');
  return lines.join('\n');
}

// ==================== MOVE VALIDATION ====================
// Basic move validation (simplified - full validation would use sl-wukong-engine)

export function isInPalace(row: number, col: number, color: XiangqiColor): boolean {
  const palaceCols = [3, 4, 5];
  const palaceRows = color === 'red' ? [7, 8, 9] : [0, 1, 2];
  return palaceCols.includes(col) && palaceRows.includes(row);
}

export function hasCrossedRiver(row: number, color: XiangqiColor): boolean {
  return color === 'red' ? row <= 4 : row >= 5;
}

export function isValidPosition(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS;
}

// Find the king position for a given color
export function findKing(board: XiangqiBoard, color: XiangqiColor): { row: number; col: number } | null {
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const piece = board[r][c];
      if (piece && piece.type === 'K' && piece.color === color) {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

// Check if two kings are facing each other (flying general rule)
export function kingsAreFacing(board: XiangqiBoard): boolean {
  const redKing = findKing(board, 'red');
  const blackKing = findKing(board, 'black');
  
  if (!redKing || !blackKing) return false;
  if (redKing.col !== blackKing.col) return false;
  
  // Check if there are any pieces between them
  const minRow = Math.min(redKing.row, blackKing.row);
  const maxRow = Math.max(redKing.row, blackKing.row);
  
  for (let r = minRow + 1; r < maxRow; r++) {
    if (board[r][redKing.col] !== null) return false;
  }
  
  return true;
}
