'use client';

import { create } from 'zustand';
import {
  BlackjackApiLogEntry,
  BlackjackChatMessage,
  BlackjackGameState,
  BlackjackPhase,
  BlackjackPlayer,
  BlackjackPlayerConfig,
  Card,
  RoundResult,
  calculateHandValue,
  createDeck,
  getSpecialHand,
  shuffleDeck,
} from '@/lib/blackjack/types';

/* ---------- helpers ---------- */
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/* ---------- store interface ---------- */
interface BlackjackStore extends BlackjackGameState {
  // setup
  initGame: (configs: BlackjackPlayerConfig[]) => void;
  resetGame: () => void;
  
  // deck
  drawCard: (faceUp?: boolean) => Card | null;
  reshuffleDeck: () => void;
  
  // phase control
  setPhase: (phase: BlackjackPhase) => void;
  nextRound: () => void;
  
  // logs
  addLog: (msg: Omit<BlackjackChatMessage, 'id' | 'timestamp'>) => void;
  
  // player actions
  dealCardToPlayer: (playerId: string, faceUp?: boolean) => Card | null;
  dealCardToDealer: (faceUp?: boolean) => Card | null;
  setPlayerStatus: (playerId: string, status: BlackjackPlayer['status']) => void;
  setPlayerExpression: (playerId: string, expression: BlackjackPlayer['expression']) => void;
  setPlayerBet: (playerId: string, bet: number) => void;
  updatePlayerChips: (playerId: string, delta: number) => void;
  
  // round resolution
  resolveRound: () => RoundResult;
  setRoundResult: (result: RoundResult | null) => void;
  
  // control
  setSpeed: (ms: number) => void;
  setRunning: (r: boolean) => void;
  setActivePlayer: (id: string | null) => void;
  addApiLog: (entry: Omit<BlackjackApiLogEntry, 'id'>) => void;
  
  // TTS and settings
  ttsEnabled: boolean;
  setTtsEnabled: (v: boolean) => void;
  isSimulating: boolean;
  setSimulating: (v: boolean) => void;
  isSpeakingTTS: boolean;
  setIsSpeakingTTS: (v: boolean) => void;
  thoughtProbability: number;
  setThoughtProbability: (v: number) => void;
}

const DEFAULT_CHIPS = 500;
const DEFAULT_BET = 50;

export const useBlackjackStore = create<BlackjackStore>((set, get) => ({
  /* ---- state ---- */
  players: [],
  dealer: null,
  deck: [],
  phase: 'setup',
  roundCount: 0,
  logs: [],
  roundResult: null,
  speed: 2000,
  isRunning: false,
  activePlayerId: null,
  apiLogs: [],
  ttsEnabled: false,
  isSimulating: false,
  isSpeakingTTS: false,
  thoughtProbability: 50,

  /* ---- setup ---- */
  initGame(configs) {
    // Người đầu tiên là nhà cái (dealer)
    const [dealerConfig, ...playerConfigs] = configs;
    
    const dealer: BlackjackPlayer = {
      ...dealerConfig,
      isDealer: true,
      hand: [],
      status: 'waiting',
      expression: '😎',
      chips: Infinity,
      currentBet: 0,
    };
    
    const players: BlackjackPlayer[] = playerConfigs.map((c) => ({
      ...c,
      isDealer: false,
      hand: [],
      status: 'waiting',
      expression: '😴',
      chips: DEFAULT_CHIPS,
      currentBet: DEFAULT_BET,
    }));
    
    set({
      players,
      dealer,
      deck: shuffleDeck(createDeck()),
      phase: 'betting',
      roundCount: 1,
      logs: [],
      roundResult: null,
      isRunning: true,
      activePlayerId: null,
      apiLogs: [],
      isSpeakingTTS: false,
    });
  },

  resetGame() {
    set({
      players: [],
      dealer: null,
      deck: [],
      phase: 'setup',
      roundCount: 0,
      logs: [],
      roundResult: null,
      isRunning: false,
      activePlayerId: null,
      apiLogs: [],
      isSpeakingTTS: false,
    });
  },

  /* ---- deck ---- */
  drawCard(faceUp = true) {
    const { deck } = get();
    if (deck.length === 0) return null;
    
    const [card, ...rest] = deck;
    set({ deck: rest });
    return { ...card, faceUp };
  },

  reshuffleDeck() {
    set({ deck: shuffleDeck(createDeck()) });
  },

  /* ---- phase ---- */
  setPhase(phase) {
    set({ phase });
  },

  nextRound() {
    const state = get();
    
    // Reset hands and statuses
    const resetPlayers = state.players.map((p) => ({
      ...p,
      hand: [],
      status: 'waiting' as const,
      expression: '😴' as const,
      currentBet: DEFAULT_BET,
    }));
    
    const resetDealer = state.dealer ? {
      ...state.dealer,
      hand: [],
      status: 'waiting' as const,
      expression: '😎' as const,
    } : null;
    
    set({
      players: resetPlayers,
      dealer: resetDealer,
      deck: shuffleDeck(createDeck()),
      phase: 'betting',
      roundCount: state.roundCount + 1,
      roundResult: null,
      activePlayerId: null,
    });
  },

  /* ---- logging ---- */
  addLog(msg) {
    const full: BlackjackChatMessage = { ...msg, id: uid(), timestamp: Date.now() };
    set((s) => ({ logs: [...s.logs, full] }));
    return full;
  },

  /* ---- player actions ---- */
  dealCardToPlayer(playerId, faceUp = true) {
    const card = get().drawCard(faceUp);
    if (!card) return null;
    
    set((s) => ({
      players: s.players.map((p) =>
        p.id === playerId ? { ...p, hand: [...p.hand, card] } : p
      ),
    }));
    
    return card;
  },

  dealCardToDealer(faceUp = true) {
    const card = get().drawCard(faceUp);
    if (!card) return null;
    
    set((s) => ({
      dealer: s.dealer ? { ...s.dealer, hand: [...s.dealer.hand, card] } : null,
    }));
    
    return card;
  },

  setPlayerStatus(playerId, status) {
    set((s) => ({
      players: s.players.map((p) =>
        p.id === playerId ? { ...p, status } : p
      ),
    }));
  },

  setPlayerExpression(playerId, expression) {
    const state = get();
    
    // Check if it's the dealer
    if (state.dealer?.id === playerId) {
      set((s) => ({
        dealer: s.dealer ? { ...s.dealer, expression } : null,
      }));
      return;
    }
    
    set((s) => ({
      players: s.players.map((p) =>
        p.id === playerId ? { ...p, expression } : p
      ),
    }));
  },

  setPlayerBet(playerId, bet) {
    set((s) => ({
      players: s.players.map((p) =>
        p.id === playerId ? { ...p, currentBet: bet } : p
      ),
    }));
  },

  updatePlayerChips(playerId, delta) {
    set((s) => ({
      players: s.players.map((p) =>
        p.id === playerId ? { ...p, chips: p.chips + delta } : p
      ),
    }));
  },

  /* ---- round resolution ---- */
  resolveRound() {
    const { players, dealer } = get();
    
    if (!dealer) {
      return { playerResults: [], dealerHandValue: 0, dealerSpecialHand: 'normal' };
    }
    
    const dealerValue = calculateHandValue(dealer.hand);
    const dealerSpecial = getSpecialHand(dealer.hand);
    const dealerBusted = dealerValue > 21;
    
    const playerResults = players.map((p) => {
      const playerValue = calculateHandValue(p.hand);
      const specialHand = getSpecialHand(p.hand);
      const playerBusted = playerValue > 21;
      
      let won = false;
      let payout = 0;
      
      if (playerBusted) {
        // Người chơi quắc -> thua
        won = false;
        payout = -p.currentBet;
      } else if (specialHand === 'xi_bang') {
        // Xì Bàng thắng gấp 3
        won = true;
        payout = p.currentBet * 3;
      } else if (specialHand === 'xi_dach') {
        // Xì Dách thắng gấp 2 (trừ khi nhà cái cũng Xì Dách)
        if (dealerSpecial === 'xi_dach' || dealerSpecial === 'xi_bang') {
          won = false;
          payout = -p.currentBet;
        } else {
          won = true;
          payout = p.currentBet * 2;
        }
      } else if (specialHand === 'ngu_linh') {
        // Ngũ Linh thắng gấp 2 (trừ khi nhà cái có bài đặc biệt hoặc Ngũ Linh cao hơn)
        if (dealerSpecial === 'xi_bang' || dealerSpecial === 'xi_dach') {
          won = false;
          payout = -p.currentBet;
        } else if (dealerSpecial === 'ngu_linh' && dealerValue > playerValue) {
          won = false;
          payout = -p.currentBet;
        } else {
          won = true;
          payout = p.currentBet * 2;
        }
      } else if (dealerBusted) {
        // Nhà cái quắc -> người chơi thắng
        won = true;
        payout = p.currentBet;
      } else if (dealerSpecial === 'xi_bang' || dealerSpecial === 'xi_dach' || dealerSpecial === 'ngu_linh') {
        // Nhà cái có bài đặc biệt
        won = false;
        payout = -p.currentBet;
      } else if (playerValue > dealerValue) {
        // Người chơi điểm cao hơn
        won = true;
        payout = p.currentBet;
      } else if (playerValue === dealerValue) {
        // Hòa -> nhà cái thắng
        won = false;
        payout = -p.currentBet;
      } else {
        // Người chơi điểm thấp hơn
        won = false;
        payout = -p.currentBet;
      }
      
      return {
        playerId: p.id,
        specialHand,
        handValue: playerValue,
        won,
        payout,
      };
    });
    
    // Update chips
    for (const result of playerResults) {
      get().updatePlayerChips(result.playerId, result.payout);
    }
    
    const roundResult: RoundResult = {
      playerResults,
      dealerHandValue: dealerValue,
      dealerSpecialHand: dealerSpecial,
    };
    
    set({ roundResult });
    
    return roundResult;
  },

  setRoundResult(result) {
    set({ roundResult: result });
  },

  /* ---- control ---- */
  setSpeed(ms) {
    set({ speed: ms });
  },

  setRunning(r) {
    set({ isRunning: r });
  },

  setActivePlayer(id) {
    if (get().isSimulating) return;
    set({ activePlayerId: id });
  },

  addApiLog(entry) {
    const full: BlackjackApiLogEntry = { ...entry, id: uid() };
    set((s) => ({ apiLogs: [...s.apiLogs, full] }));
  },

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
}));
