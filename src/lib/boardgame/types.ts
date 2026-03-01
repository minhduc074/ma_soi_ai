// ==================== SHARED BOARD GAME TYPES ====================
import { LLMProvider } from '@/lib/types';

// ==================== EXPRESSION (reuse from blackjack) ====================
export type Expression =
  | '😎'  // Tự tin
  | '😰'  // Lo lắng
  | '🤔'  // Suy nghĩ
  | '😏'  // Bí ẩn/Mỉm cười
  | '😤'  // Thách thức
  | '😱'  // Sợ hãi
  | '😈'  // Lừa gạt
  | '🥶'  // Run sợ
  | '😴'  // Bình tĩnh/Chán
  | '🤑'  // Tham lam/Hào hứng;

export const EXPRESSIONS: Expression[] = ['😎', '😰', '🤔', '😏', '😤', '😱', '😈', '🥶', '😴', '🤑'];

// ==================== GAME MODE ====================
export type GameMode = 'ai_vs_ai' | 'human_vs_ai';

// ==================== PLAYER CONFIG ====================
export interface BoardGamePlayerConfig {
  id: string;
  name: string;
  provider: LLMProvider;
  model: string;
  baseUrl?: string;
  personality?: string;
  isHuman?: boolean;
}

// ==================== BASE PLAYER ====================
export interface BoardGamePlayer extends BoardGamePlayerConfig {
  expression: Expression;
  color: 'white' | 'black' | 'red' | 'X' | 'O'; // Chess: white/black, Xiangqi: red/black, Caro: X/O
}

// ==================== MOVE HISTORY ====================
export interface MoveRecord {
  moveNumber: number;
  player: string;
  notation: string; // Human-readable notation
  timestamp: number;
}

// ==================== CHAT MESSAGE ====================
export interface BoardGameChatMessage {
  id: string;
  sender: string;
  content: string;
  expression?: Expression;
  type: 'speech' | 'thought' | 'system' | 'move';
  moveNumber: number;
  timestamp: number;
}

// ==================== AGENT RESPONSE ====================
export interface BoardGameAgentResponse {
  thought?: string;
  speech: string;
  action: string; // Move notation (e.g., "7,7" for Caro, "e2e4" for Chess)
  expression: Expression;
}

// ==================== API LOG ENTRY ====================
export interface BoardGameApiLogEntry {
  id: string;
  timestamp: number;
  playerName: string;
  provider: LLMProvider;
  model: string;
  moveNumber: number;
  systemPrompt: string;
  userPrompt: string;
  response: BoardGameAgentResponse | null;
  error: string | null;
  durationMs: number;
}

// ==================== HELPER: UID ====================
export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}
