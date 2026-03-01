// ==================== CHESS TYPES ====================
import { Chess, Square, Move, PieceSymbol, Color } from 'chess.js';
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

// ==================== RE-EXPORT CHESS.JS TYPES ====================
export type { Square, Move, PieceSymbol, Color };
export { Chess };

// ==================== PLAYER ====================
export interface ChessPlayer extends BoardGamePlayer {
  color: 'white' | 'black';
  captures: PieceSymbol[];
  wins: number;
}

// ==================== PHASE ====================
export type ChessPhase = 'setup' | 'playing' | 'check' | 'checkmate' | 'stalemate' | 'draw';

// ==================== GAME STATE ====================
export interface ChessGameState {
  chess: Chess | null; // chess.js instance
  players: [ChessPlayer, ChessPlayer] | null;
  currentTurn: Color;
  phase: ChessPhase;
  moveHistory: MoveRecord[];
  lastMove: Move | null;
  winner: 'white' | 'black' | 'draw' | null;
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
  selectedSquare: Square | null;
  validMoves: Square[];
}

// Re-export for convenience
export type {
  BoardGamePlayerConfig,
  BoardGameChatMessage as ChessChatMessage,
  BoardGameAgentResponse as ChessAgentResponse,
  BoardGameApiLogEntry as ChessApiLogEntry,
  MoveRecord,
  GameMode,
  Expression,
};

// ==================== PIECE INFO ====================
export const PIECE_NAMES: Record<PieceSymbol, { vi: string; en: string; emoji: string; value: number }> = {
  k: { vi: 'Vua', en: 'King', emoji: '♚', value: 0 },
  q: { vi: 'Hậu', en: 'Queen', emoji: '♛', value: 9 },
  r: { vi: 'Xe', en: 'Rook', emoji: '♜', value: 5 },
  b: { vi: 'Tượng', en: 'Bishop', emoji: '♝', value: 3 },
  n: { vi: 'Mã', en: 'Knight', emoji: '♞', value: 3 },
  p: { vi: 'Tốt', en: 'Pawn', emoji: '♟', value: 1 },
};

export const PIECE_UNICODE: Record<string, string> = {
  // White pieces
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  // Black pieces
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

// ==================== HELPERS ====================
export function formatMoveNotation(move: Move): string {
  return move.san;
}

export function parseAiMove(action: string, chess: Chess): Move | null {
  // Try various formats:
  // 1. SAN notation: "e4", "Nf3", "O-O"
  // 2. UCI notation: "e2e4", "g1f3"
  // 3. Verbose: "e2 to e4"
  
  const legalMoves = chess.moves({ verbose: true });
  
  // Clean the action
  const cleaned = action.trim().replace(/[^a-h1-8KQRBNOo\-x=+#]/gi, '');
  
  // Try SAN first
  const sanMatch = legalMoves.find(m => m.san.toLowerCase() === cleaned.toLowerCase());
  if (sanMatch) return sanMatch;
  
  // Try UCI
  if (cleaned.length >= 4) {
    const from = cleaned.slice(0, 2).toLowerCase() as Square;
    const to = cleaned.slice(2, 4).toLowerCase() as Square;
    const promotion = cleaned.length > 4 ? cleaned[4].toLowerCase() as PieceSymbol : undefined;
    
    const uciMatch = legalMoves.find(m => 
      m.from === from && m.to === to && 
      (!promotion || m.promotion === promotion)
    );
    if (uciMatch) return uciMatch;
  }
  
  // Try to find any move that contains the target square
  const squareMatch = cleaned.match(/([a-h][1-8])/i);
  if (squareMatch) {
    const targetSquare = squareMatch[1].toLowerCase() as Square;
    const possibleMoves = legalMoves.filter(m => m.to === targetSquare);
    if (possibleMoves.length === 1) return possibleMoves[0];
  }
  
  return null;
}

export function boardToAscii(chess: Chess): string {
  const board = chess.board();
  const lines: string[] = [];
  
  lines.push('  a b c d e f g h');
  for (let r = 0; r < 8; r++) {
    const row = 8 - r;
    const cells = board[r].map(cell => {
      if (!cell) return '·';
      const piece = cell.type;
      return cell.color === 'w' ? piece.toUpperCase() : piece.toLowerCase();
    }).join(' ');
    lines.push(`${row} ${cells} ${row}`);
  }
  lines.push('  a b c d e f g h');
  
  return lines.join('\n');
}

export function getGameStatus(chess: Chess): { phase: ChessPhase; message: string } {
  if (chess.isCheckmate()) {
    const winner = chess.turn() === 'w' ? 'Đen' : 'Trắng';
    return { phase: 'checkmate', message: `Chiếu hết! ${winner} thắng!` };
  }
  if (chess.isStalemate()) {
    return { phase: 'stalemate', message: 'Hết nước đi! Hòa cờ.' };
  }
  if (chess.isDraw()) {
    return { phase: 'draw', message: 'Ván cờ hòa!' };
  }
  if (chess.isCheck()) {
    return { phase: 'check', message: 'Chiếu!' };
  }
  return { phase: 'playing', message: '' };
}

export function getMaterialAdvantage(chess: Chess): { white: number; black: number; advantage: number } {
  const board = chess.board();
  let white = 0;
  let black = 0;
  
  for (const row of board) {
    for (const cell of row) {
      if (cell) {
        const value = PIECE_NAMES[cell.type].value;
        if (cell.color === 'w') white += value;
        else black += value;
      }
    }
  }
  
  return { white, black, advantage: white - black };
}
