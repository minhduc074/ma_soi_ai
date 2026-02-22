// ==================== CARD ====================
export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  suit: Suit;
  rank: Rank;
  faceUp: boolean; // true = hiển thị, false = úp
}

export const SUIT_EMOJI: Record<Suit, string> = {
  hearts: '♥️',
  diamonds: '♦️',
  clubs: '♣️',
  spades: '♠️',
};

export const RANK_DISPLAY: Record<Rank, string> = {
  A: 'A',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  '10': '10',
  J: 'J',
  Q: 'Q',
  K: 'K',
};

// ==================== CARD VALUE ====================
export function getCardValue(card: Card): number {
  if (card.rank === 'A') return 1; // hoặc 10/11 tùy ngữ cảnh
  if (['J', 'Q', 'K'].includes(card.rank)) return 10;
  return parseInt(card.rank, 10);
}

export function calculateHandValue(cards: Card[]): number {
  let total = 0;
  let aceCount = 0;

  for (const card of cards) {
    if (card.rank === 'A') {
      aceCount++;
      total += 1;
    } else {
      total += getCardValue(card);
    }
  }

  // Xì Dách: Ace có thể là 1 hoặc 10 (để được 21)
  for (let i = 0; i < aceCount; i++) {
    if (total + 9 <= 21) {
      total += 9; // Ace từ 1 -> 10
    }
  }

  return total;
}

// ==================== SPECIAL HANDS ====================
export type SpecialHand =
  | 'xi_dach'        // A + 10/J/Q/K = 21 với 2 lá
  | 'xi_bang'        // 2 Ace
  | 'ngu_linh'       // 5 lá không quá 21
  | 'quac'           // Quá 21
  | 'normal';        // Bình thường

export function getSpecialHand(cards: Card[]): SpecialHand {
  const value = calculateHandValue(cards);

  if (value > 21) return 'quac';

  if (cards.length === 2) {
    const ranks = cards.map((c) => c.rank);
    // Xì Bàng: 2 Ace
    if (ranks.filter((r) => r === 'A').length === 2) return 'xi_bang';
    // Xì Dách: A + 10/J/Q/K
    if (
      ranks.includes('A') &&
      ranks.some((r) => ['10', 'J', 'Q', 'K'].includes(r))
    ) {
      return 'xi_dach';
    }
  }

  if (cards.length === 5 && value <= 21) return 'ngu_linh';

  return 'normal';
}

export const SPECIAL_HAND_INFO: Record<SpecialHand, { name: string; emoji: string; multiplier: number }> = {
  xi_bang: { name: 'Xì Bàng', emoji: '🎴🎴', multiplier: 3 },
  xi_dach: { name: 'Xì Dách', emoji: '🃏✨', multiplier: 2 },
  ngu_linh: { name: 'Ngũ Linh', emoji: '🖐️', multiplier: 2 },
  quac: { name: 'Quắc', emoji: '💥', multiplier: -1 },
  normal: { name: 'Bình thường', emoji: '', multiplier: 1 },
};

// ==================== EXPRESSION ====================
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

// ==================== PLAYER ====================
export type BlackjackPlayerStatus = 'waiting' | 'playing' | 'stood' | 'busted' | 'blackjack';

export type LLMProvider = 'openai' | 'gemini' | 'anthropic' | 'openrouter' | 'cliproxyapi';

export interface BlackjackPlayerConfig {
  id: string;
  name: string;
  provider: LLMProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
  personality?: string;
}

export interface BlackjackPlayer extends BlackjackPlayerConfig {
  isDealer: boolean;
  hand: Card[];
  status: BlackjackPlayerStatus;
  expression: Expression;
  chips: number;
  currentBet: number;
}

// ==================== GAME PHASES ====================
export type BlackjackPhase =
  | 'setup'
  | 'betting'
  | 'dealing'
  | 'player_turns'
  | 'dealer_turn'
  | 'payout'
  | 'round_end'
  | 'game_over';

// ==================== MESSAGES & LOGS ====================
export interface BlackjackChatMessage {
  id: string;
  sender: string;
  content: string;
  expression?: Expression;
  type: 'speech' | 'thought' | 'system' | 'action';
  phase: BlackjackPhase;
  roundCount: number;
  timestamp: number;
}

export interface BlackjackAgentResponse {
  thought?: string;
  speech: string;
  action: 'hit' | 'stand' | '';
  expression: Expression;
  raiseAmount?: number;
}

// ==================== API TRACKING LOG ====================
export interface BlackjackApiLogEntry {
  id: string;
  timestamp: number;
  playerName: string;
  provider: LLMProvider;
  model: string;
  phase: BlackjackPhase;
  roundCount: number;
  systemPrompt: string;
  userPrompt: string;
  response: BlackjackAgentResponse | null;
  error: string | null;
  durationMs: number;
}

// ==================== ROUND RESULT ====================
export interface RoundResult {
  playerResults: {
    playerId: string;
    specialHand: SpecialHand;
    handValue: number;
    won: boolean;
    payout: number;
  }[];
  dealerHandValue: number;
  dealerSpecialHand: SpecialHand;
}

// ==================== GAME STATE ====================
export interface BlackjackGameState {
  players: BlackjackPlayer[];
  dealer: BlackjackPlayer | null;
  deck: Card[];
  phase: BlackjackPhase;
  roundCount: number;
  logs: BlackjackChatMessage[];
  roundResult: RoundResult | null;
  speed: number;
  isRunning: boolean;
  activePlayerId: string | null;
  apiLogs: BlackjackApiLogEntry[];
  ttsEnabled: boolean;
  isSimulating: boolean;
  thoughtProbability: number;
}

// ==================== DECK UTILITIES ====================
export function createDeck(): Card[] {
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck: Card[] = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank, faceUp: true });
    }
  }

  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function formatCard(card: Card): string {
  if (!card.faceUp) return '🂠';
  return `${RANK_DISPLAY[card.rank]}${SUIT_EMOJI[card.suit]}`;
}

export function formatHand(cards: Card[]): string {
  return cards.map(formatCard).join(' ');
}
