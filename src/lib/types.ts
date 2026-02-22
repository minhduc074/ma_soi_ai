// ==================== ROLES ====================
export type Role =
  | 'werewolf'
  | 'villager'
  | 'seer'
  | 'guard'
  | 'witch'
  | 'hunter';

export const ROLE_INFO: Record<Role, { name: string; emoji: string; team: 'wolf' | 'village'; description: string }> = {
  werewolf: {
    name: 'Sói',
    emoji: '🐺',
    team: 'wolf',
    description: 'Mỗi đêm, bạn cùng đồng đội chọn một người để loại bỏ. Ban ngày, hãy ngụy trang thành dân làng.',
  },
  villager: {
    name: 'Dân làng',
    emoji: '👤',
    team: 'village',
    description: 'Bạn không có kỹ năng đặc biệt. Hãy quan sát, phân tích và bỏ phiếu loại sói.',
  },
  seer: {
    name: 'Tiên tri',
    emoji: '🔮',
    team: 'village',
    description: 'Mỗi đêm, bạn có thể soi một người để biết họ là sói hay dân.',
  },
  guard: {
    name: 'Bảo vệ',
    emoji: '🛡️',
    team: 'village',
    description: 'Mỗi đêm, bạn chọn một người để bảo vệ khỏi bị sói loại bỏ. Không được bảo vệ cùng một người 2 đêm liên tiếp.',
  },
  witch: {
    name: 'Phù thủy',
    emoji: '🧙',
    team: 'village',
    description: 'Bạn có 1 bình thuốc cứu và 1 bình thuốc loại bỏ. Mỗi đêm bạn có thể dùng tối đa 1 bình.',
  },
  hunter: {
    name: 'Thợ săn',
    emoji: '🏹',
    team: 'village',
    description: 'Khi bạn bị loại (bởi sói hoặc bị vote), bạn có thể kéo theo một người khác.',
  },
};

// ==================== PLAYER ====================
export type LLMProvider = 'openai' | 'gemini' | 'anthropic' | 'openrouter' | 'cliproxyapi';

export interface PlayerConfig {
  id: string;
  name: string;
  provider: LLMProvider;
  model: string;
  apiKey: string;
  baseUrl?: string; // custom base URL for CLIProxyAPI
  personality?: string; // random personality trait
}

export interface Player extends PlayerConfig {
  role: Role;
  alive: boolean;
  /** Messages this AI has seen / sent (its private memory) */
  memory: ChatMessage[];
}

// ==================== GAME PHASES ====================
export type GamePhase =
  | 'setup'
  | 'night_start'
  | 'night_wolf'
  | 'night_seer'
  | 'night_guard'
  | 'night_witch'
  | 'day_announcement'
  | 'day_discussion'
  | 'day_rebuttal'
  | 'day_voting'
  | 'day_execution'
  | 'day_last_words'
  | 'hunter_shot'
  | 'game_over';

// ==================== MESSAGES & LOGS ====================
export interface ChatMessage {
  id: string;
  sender: string;        // player name or 'system'
  content: string;
  type: 'speech' | 'thought' | 'system' | 'action' | 'vote' | 'whisper';
  phase: GamePhase;
  dayCount: number;
  timestamp: number;
}

export interface AgentResponse {
  thought?: string;   // inner monologue – shown to viewer only
  speech: string;    // public statement – added to shared chat history
  action?: string;   // e.g. target player name for night actions / vote
}

// ==================== API TRACKING LOG ====================
export interface ApiLogEntry {
  id: string;
  timestamp: number;
  playerName: string;
  provider: LLMProvider;
  model: string;
  phase: GamePhase;
  dayCount: number;
  systemPrompt: string;
  userPrompt: string;
  response: AgentResponse | null;
  error: string | null;
  durationMs: number;
}

// ==================== NIGHT RESULTS ====================
export interface NightResult {
  wolfTarget: string | null;
  guardTarget: string | null;
  seerTarget: string | null;
  seerResult: 'wolf' | 'village' | null;
  witchSave: boolean;
  witchKillTarget: string | null;
  deaths: string[];   // player ids who actually died
}

// ==================== VOTE HISTORY ====================
export interface DayVoteRecord {
  dayCount: number;
  votes: Record<string, string>;       // voterId -> targetId
  eliminated: string | null;           // player id who was eliminated
  nightDeaths: string[];               // player ids killed at night
}

// ==================== SAVED GAME (for export/import) ====================
export interface SavedGame {
  version: number;
  createdAt: number;
  players: Player[];
  logs: ChatMessage[];
  voteHistory: DayVoteRecord[];
  winner: 'wolf' | 'village' | null;
  apiLogs: ApiLogEntry[];
}

// ==================== GAME STATE ====================
export interface GameState {
  players: Player[];
  phase: GamePhase;
  dayCount: number;
  logs: ChatMessage[];
  nightResult: NightResult;
  winner: 'wolf' | 'village' | null;
  speed: number;        // delay in ms between actions
  isRunning: boolean;
  // witch consumables
  witchHasHeal: boolean;
  witchHasPoison: boolean;
  // guard memory
  lastGuardTarget: string | null;
  // votes in current round
  votes: Record<string, string>; // voterId -> targetId
  // active player focus
  activePlayerId: string | null;
  isWhispering: boolean;
  // API tracking logs
  apiLogs: ApiLogEntry[];
  // TTS
  ttsEnabled: boolean;
  // Background simulation
  isSimulating: boolean;
  // Replay mode (loaded from saved game)
  isReplayMode: boolean;
  // Thought probability (0-100)
  thoughtProbability: number;
  // Day summary generated at start of each day
  daySummary: string | null;
  // History of votes and eliminations per day
  voteHistory: DayVoteRecord[];
}
