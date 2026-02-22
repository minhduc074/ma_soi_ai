// ==================== CARD ====================
export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
// Xì Tố chỉ dùng bộ bài 32 lá: 7, 8, 9, 10, J, Q, K, A
export type Rank = '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
  faceUp: boolean;
}

export const SUIT_EMOJI: Record<Suit, string> = {
  hearts: '♥️',
  diamonds: '♦️',
  clubs: '♣️',
  spades: '♠️',
};

// Thứ tự chất: Bích < Chuồn < Rô < Cơ
export const SUIT_RANK: Record<Suit, number> = {
  spades: 1,   // Bích
  clubs: 2,    // Chuồn
  diamonds: 3, // Rô
  hearts: 4,   // Cơ
};

export const SUIT_NAME: Record<Suit, string> = {
  spades: 'Bích',
  clubs: 'Chuồn',
  diamonds: 'Rô',
  hearts: 'Cơ',
};

export const RANK_DISPLAY: Record<Rank, string> = {
  '7': '7',
  '8': '8',
  '9': '9',
  '10': '10',
  J: 'J',
  Q: 'Q',
  K: 'K',
  A: 'A',
};

// Thứ tự bài: 7 < 8 < 9 < 10 < J < Q < K < A
export const RANK_VALUE: Record<Rank, number> = {
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

// ==================== HAND RANKINGS ====================
export type HandRank =
  | 'royal_flush'    // Sảnh rồng (10-J-Q-K-A cùng chất)
  | 'straight_flush' // Thùng phá sảnh
  | 'four_of_kind'   // Tứ quý
  | 'full_house'     // Cù lũ
  | 'flush'          // Thùng
  | 'straight'       // Sảnh
  | 'three_of_kind'  // Sám chi (xám cô)
  | 'two_pair'       // Thú (2 đôi)
  | 'one_pair'       // Đôi
  | 'high_card';     // Mậu thầu

export const HAND_RANK_ORDER: Record<HandRank, number> = {
  royal_flush: 10,
  straight_flush: 9,
  four_of_kind: 8,
  full_house: 7,
  flush: 6,
  straight: 5,
  three_of_kind: 4,
  two_pair: 3,
  one_pair: 2,
  high_card: 1,
};

export const HAND_RANK_NAME: Record<HandRank, string> = {
  royal_flush: 'Sảnh Rồng',
  straight_flush: 'Thùng Phá Sảnh',
  four_of_kind: 'Tứ Quý',
  full_house: 'Cù Lũ',
  flush: 'Thùng',
  straight: 'Sảnh',
  three_of_kind: 'Sám Chi',
  two_pair: 'Thú (2 Đôi)',
  one_pair: 'Đôi',
  high_card: 'Mậu Thầu',
};

export const HAND_RANK_EMOJI: Record<HandRank, string> = {
  royal_flush: '👑',
  straight_flush: '🌟',
  four_of_kind: '💎',
  full_house: '🏠',
  flush: '🎴',
  straight: '📏',
  three_of_kind: '🔱',
  two_pair: '👯',
  one_pair: '✌️',
  high_card: '🃏',
};

// ==================== HAND EVALUATION ====================
export interface HandEvaluation {
  rank: HandRank;
  rankValue: number;       // Giá trị xếp hạng (1-9)
  highCards: number[];     // Các lá cao nhất để so kè
  highSuit: number;        // Chất cao nhất (dùng khi bằng điểm)
  description: string;     // Mô tả tay bài
}

function sortByRank(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank]);
}

function countRanks(cards: Card[]): Map<Rank, number> {
  const counts = new Map<Rank, number>();
  for (const card of cards) {
    counts.set(card.rank, (counts.get(card.rank) || 0) + 1);
  }
  return counts;
}

function isFlush(cards: Card[]): boolean {
  if (cards.length < 5) return false;
  return cards.every((c) => c.suit === cards[0].suit);
}

function isStraight(cards: Card[]): boolean {
  if (cards.length < 5) return false;
  const sorted = sortByRank(cards);
  const values = sorted.map((c) => RANK_VALUE[c.rank]);
  
  // Check consecutive
  for (let i = 0; i < values.length - 1; i++) {
    if (values[i] - values[i + 1] !== 1) return false;
  }
  return true;
}

function getHighestSuit(cards: Card[]): number {
  return Math.max(...cards.map((c) => SUIT_RANK[c.suit]));
}

export function evaluateHand(cards: Card[]): HandEvaluation {
  if (cards.length === 0) {
    return {
      rank: 'high_card',
      rankValue: 0,
      highCards: [],
      highSuit: 0,
      description: 'Chưa có bài',
    };
  }

  const sorted = sortByRank(cards);
  const counts = countRanks(cards);
  const countValues = Array.from(counts.values()).sort((a, b) => b - a);
  const flush = isFlush(cards);
  const straight = isStraight(cards);
  const highSuit = getHighestSuit(cards);
  
  // Get high cards for comparison
  const highCards = sorted.map((c) => RANK_VALUE[c.rank]);
  
  // Sảnh rồng: 10-J-Q-K-A cùng chất
  if (flush && straight && highCards.join(',') === '14,13,12,11,10') {
    return {
      rank: 'royal_flush',
      rankValue: HAND_RANK_ORDER.royal_flush,
      highCards,
      highSuit,
      description: HAND_RANK_NAME.royal_flush,
    };
  }

  // Thùng phá sảnh
  if (flush && straight) {
    return {
      rank: 'straight_flush',
      rankValue: HAND_RANK_ORDER.straight_flush,
      highCards,
      highSuit,
      description: `${HAND_RANK_NAME.straight_flush} - ${RANK_DISPLAY[sorted[0].rank]} cao`,
    };
  }
  
  // Tứ quý
  if (countValues[0] === 4) {
    const quadRank = Array.from(counts.entries()).find(([_, v]) => v === 4)?.[0];
    return {
      rank: 'four_of_kind',
      rankValue: HAND_RANK_ORDER.four_of_kind,
      highCards: [RANK_VALUE[quadRank!], ...highCards.filter((v) => v !== RANK_VALUE[quadRank!])],
      highSuit,
      description: `${HAND_RANK_NAME.four_of_kind} ${RANK_DISPLAY[quadRank!]}`,
    };
  }
  
  // Cù lũ
  if (countValues[0] === 3 && countValues[1] === 2) {
    const tripRank = Array.from(counts.entries()).find(([_, v]) => v === 3)?.[0];
    const pairRank = Array.from(counts.entries()).find(([_, v]) => v === 2)?.[0];
    return {
      rank: 'full_house',
      rankValue: HAND_RANK_ORDER.full_house,
      highCards: [RANK_VALUE[tripRank!], RANK_VALUE[pairRank!]],
      highSuit,
      description: `${HAND_RANK_NAME.full_house} ${RANK_DISPLAY[tripRank!]} full ${RANK_DISPLAY[pairRank!]}`,
    };
  }
  
  // Thùng
  if (flush) {
    return {
      rank: 'flush',
      rankValue: HAND_RANK_ORDER.flush,
      highCards,
      highSuit,
      description: `${HAND_RANK_NAME.flush} ${SUIT_NAME[sorted[0].suit]}`,
    };
  }
  
  // Sảnh
  if (straight) {
    return {
      rank: 'straight',
      rankValue: HAND_RANK_ORDER.straight,
      highCards,
      highSuit,
      description: `${HAND_RANK_NAME.straight} ${RANK_DISPLAY[sorted[0].rank]} cao`,
    };
  }
  
  // Sám chi
  if (countValues[0] === 3) {
    const tripRank = Array.from(counts.entries()).find(([_, v]) => v === 3)?.[0];
    return {
      rank: 'three_of_kind',
      rankValue: HAND_RANK_ORDER.three_of_kind,
      highCards: [RANK_VALUE[tripRank!], ...highCards.filter((v) => v !== RANK_VALUE[tripRank!])],
      highSuit,
      description: `${HAND_RANK_NAME.three_of_kind} ${RANK_DISPLAY[tripRank!]}`,
    };
  }
  
  // Thú (2 đôi)
  if (countValues[0] === 2 && countValues[1] === 2) {
    const pairs = Array.from(counts.entries())
      .filter(([_, v]) => v === 2)
      .map(([r]) => RANK_VALUE[r])
      .sort((a, b) => b - a);
    return {
      rank: 'two_pair',
      rankValue: HAND_RANK_ORDER.two_pair,
      highCards: [...pairs, ...highCards.filter((v) => !pairs.includes(v))],
      highSuit,
      description: `${HAND_RANK_NAME.two_pair}`,
    };
  }
  
  // Đôi
  if (countValues[0] === 2) {
    const pairRank = Array.from(counts.entries()).find(([_, v]) => v === 2)?.[0];
    return {
      rank: 'one_pair',
      rankValue: HAND_RANK_ORDER.one_pair,
      highCards: [RANK_VALUE[pairRank!], ...highCards.filter((v) => v !== RANK_VALUE[pairRank!])],
      highSuit,
      description: `${HAND_RANK_NAME.one_pair} ${RANK_DISPLAY[pairRank!]}`,
    };
  }
  
  // Mậu thầu
  return {
    rank: 'high_card',
    rankValue: HAND_RANK_ORDER.high_card,
    highCards,
    highSuit,
    description: `${HAND_RANK_NAME.high_card} ${RANK_DISPLAY[sorted[0].rank]}`,
  };
}

// So sánh 2 tay bài: return > 0 nếu hand1 thắng, < 0 nếu hand2 thắng, 0 nếu bằng
export function compareHands(eval1: HandEvaluation, eval2: HandEvaluation): number {
  // So sánh rank
  if (eval1.rankValue !== eval2.rankValue) {
    return eval1.rankValue - eval2.rankValue;
  }
  
  // So sánh high cards
  for (let i = 0; i < Math.max(eval1.highCards.length, eval2.highCards.length); i++) {
    const c1 = eval1.highCards[i] || 0;
    const c2 = eval2.highCards[i] || 0;
    if (c1 !== c2) return c1 - c2;
  }
  
  // So sánh chất (Bích < Chuồn < Rô < Cơ)
  return eval1.highSuit - eval2.highSuit;
}

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
  | '🤑'  // Tham lam/Hào hứng

export const EXPRESSIONS: Expression[] = ['😎', '😰', '🤔', '😏', '😤', '😱', '😈', '🥶', '😴', '🤑'];

// ==================== PLAYER ====================
export type XitoPlayerStatus = 'waiting' | 'active' | 'folded' | 'all_in';
export type XitoAction = 'fold' | 'call' | 'raise' | 'all_in' | 'check';

export type LLMProvider = 'openai' | 'gemini' | 'anthropic' | 'openrouter' | 'cliproxyapi';

export interface XitoPlayerConfig {
  id: string;
  name: string;
  provider: LLMProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
  personality?: string;
}

export interface XitoPlayer extends XitoPlayerConfig {
  holeCard: Card | null;    // Lá úp (chỉ chủ sở hữu biết)
  faceUpCards: Card[];      // Các lá ngửa công khai trên bàn
  chips: number;
  currentBet: number;       // Số tiền đã đặt trong ván này
  roundBet: number;         // Số tiền đã đặt trong vòng cược này
  status: XitoPlayerStatus;
  expression: Expression;
  isFirstBetter: boolean;   // Người nói đầu tiên trong vòng
}

// ==================== GAME PHASES ====================
export type XitoPhase =
  | 'setup'
  | 'deal_initial'      // Chia 3 lá đầu (2 ngửa + 1 úp)
  | 'betting_round_1'   // Vòng cược 1
  | 'deal_4th'          // Chia lá thứ 4 (ngửa)
  | 'betting_round_2'   // Vòng cược 2
  | 'deal_5th'          // Chia lá thứ 5
  | 'betting_round_3'   // Vòng cược 3
  | 'showdown'          // Lật bài
  | 'round_end'         // Kết thúc ván
  | 'game_over';

// ==================== MESSAGES & LOGS ====================
export interface XitoChatMessage {
  id: string;
  sender: string;
  content: string;
  expression?: Expression;
  type: 'speech' | 'thought' | 'system' | 'action';
  phase: XitoPhase;
  roundCount: number;
  timestamp: number;
}

export interface XitoAgentResponse {
  thought?: string;
  speech: string;
  action: XitoAction;
  raiseAmount?: number;
  expression: Expression;
}

// ==================== API TRACKING LOG ====================
export interface XitoApiLogEntry {
  id: string;
  timestamp: number;
  playerName: string;
  provider: LLMProvider;
  model: string;
  phase: XitoPhase;
  roundCount: number;
  systemPrompt: string;
  userPrompt: string;
  response: XitoAgentResponse | null;
  error: string | null;
  durationMs: number;
}

// ==================== ROUND RESULT ====================
export interface XitoRoundResult {
  winnerIds: string[];
  winnerId: string;
  winnerName: string;
  winAmount: number; // Total pot distributed among winners
  handEvaluation: HandEvaluation;
  playerResults: {
    playerId: string;
    playerName: string;
    handEvaluation: HandEvaluation;
    chipsWon: number;
    folded: boolean;
  }[];
}

// ==================== GAME STATE ====================
export interface XitoGameState {
  players: XitoPlayer[];
  deck: Card[];
  pot: number;
  currentBet: number;         // Mức cược cao nhất hiện tại
  minRaise: number;           // Mức raise tối thiểu
  phase: XitoPhase;
  roundCount: number;
  bettingRound: number;       // Vòng cược hiện tại (1-3)
  logs: XitoChatMessage[];
  roundResult: XitoRoundResult | null;
  speed: number;
  isRunning: boolean;
  activePlayerId: string | null;
  firstBetterId: string | null;  // Người nói đầu trong vòng cược
  apiLogs: XitoApiLogEntry[];
  ttsEnabled: boolean;
  isSimulating: boolean;
  thoughtProbability: number;
}

// ==================== DECK UTILITIES ====================
export function createXitoDeck(): Card[] {
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks: Rank[] = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck: Card[] = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank, faceUp: true });
    }
  }

  return deck; // 32 lá
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

export function getAllCards(player: XitoPlayer): Card[] {
  const cards: Card[] = [];
  if (player.holeCard) cards.push(player.holeCard);
  cards.push(...player.faceUpCards);
  return cards;
}

export function getVisibleCards(player: XitoPlayer): Card[] {
  return player.faceUpCards.filter((c) => c.faceUp);
}
