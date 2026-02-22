'use client';

import { create } from 'zustand';
import {
  XitoApiLogEntry,
  XitoChatMessage,
  XitoGameState,
  XitoPhase,
  XitoPlayer,
  XitoPlayerConfig,
  XitoRoundResult,
  Card,
  createXitoDeck,
  shuffleDeck,
  evaluateHand,
  compareHands,
  getAllCards,
} from '@/lib/xito/types';

/* ---------- helpers ---------- */
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/* ---------- store interface ---------- */
interface XitoStore extends XitoGameState {
  // setup
  initGame: (configs: XitoPlayerConfig[]) => void;
  resetGame: () => void;
  
  // deck
  drawCard: (faceUp?: boolean) => Card | null;
  reshuffleDeck: () => void;
  
  // phase control
  setPhase: (phase: XitoPhase) => void;
  setBettingRound: (round: number) => void;
  nextRound: () => void;
  
  // logs
  addLog: (msg: Omit<XitoChatMessage, 'id' | 'timestamp'>) => void;
  
  // dealing
  dealHoleCard: (playerId: string) => Card | null;
  dealFaceUpCard: (playerId: string, faceUp?: boolean) => Card | null;
  
  // player state
  setPlayerStatus: (playerId: string, status: XitoPlayer['status']) => void;
  setPlayerExpression: (playerId: string, expression: XitoPlayer['expression']) => void;
  setPlayerBet: (playerId: string, bet: number) => void;
  addToPlayerBet: (playerId: string, amount: number) => void;
  updatePlayerChips: (playerId: string, delta: number) => void;
  setFirstBetter: (playerId: string | null) => void;
  setPlayerAsFirstBetter: (playerId: string) => void;
  
  // betting actions
  playerFold: (playerId: string) => void;
  playerCall: (playerId: string) => void;
  playerRaise: (playerId: string, amount: number) => void;
  playerAllIn: (playerId: string) => void;
  playerCheck: (playerId: string) => void;
  
  // pot management
  addToPot: (amount: number) => void;
  setCurrentBet: (bet: number) => void;
  resetBettingRound: () => void;
  
  // round resolution
  resolveShowdown: () => XitoRoundResult;
  resolveFoldWin: (winnerId: string) => XitoRoundResult;
  setRoundResult: (result: XitoRoundResult | null) => void;
  
  // control
  setSpeed: (ms: number) => void;
  setRunning: (r: boolean) => void;
  setActivePlayer: (id: string | null) => void;
  addApiLog: (entry: Omit<XitoApiLogEntry, 'id'>) => void;
  
  // TTS and settings
  ttsEnabled: boolean;
  setTtsEnabled: (v: boolean) => void;
  isSimulating: boolean;
  setSimulating: (v: boolean) => void;
  isSpeakingTTS: boolean;
  setIsSpeakingTTS: (v: boolean) => void;
  thoughtProbability: number;
  setThoughtProbability: (v: number) => void;
  
  // helpers
  getActivePlayers: () => XitoPlayer[];
  getNextActivePlayer: (currentId: string) => XitoPlayer | null;
  isBettingComplete: () => boolean;
  findHighestFaceUpCard: () => XitoPlayer | null;
}

const DEFAULT_CHIPS = 500;
const DEFAULT_ANTE = 10;
const MIN_RAISE = 20;

export const useXitoStore = create<XitoStore>((set, get) => ({
  /* ---- state ---- */
  players: [],
  deck: [],
  pot: 0,
  currentBet: 0,
  minRaise: MIN_RAISE,
  phase: 'setup',
  roundCount: 0,
  bettingRound: 0 as number,
  logs: [],
  roundResult: null,
  speed: 2000,
  isRunning: false,
  activePlayerId: null,
  firstBetterId: null,
  apiLogs: [],
  ttsEnabled: false,
  isSimulating: false,
  isSpeakingTTS: false,
  thoughtProbability: 50,

  /* ---- setup ---- */
  initGame(configs) {
    const players: XitoPlayer[] = configs.map((c) => ({
      ...c,
      holeCard: null,
      faceUpCards: [],
      status: 'waiting',
      expression: '😴',
      chips: DEFAULT_CHIPS,
      currentBet: 0,
      roundBet: 0,
      isFirstBetter: false,
    }));
    
    // Ante - mỗi người đặt tiền cửa
    let pot = 0;
    for (const p of players) {
      p.chips -= DEFAULT_ANTE;
      p.currentBet = DEFAULT_ANTE;
      pot += DEFAULT_ANTE;
    }
    
    set({
      players,
      deck: shuffleDeck(createXitoDeck()),
      pot,
      currentBet: 0,
      minRaise: MIN_RAISE,
      phase: 'deal_initial',
      roundCount: 1,
      bettingRound: 0,
      logs: [],
      roundResult: null,
      isRunning: true,
      activePlayerId: null,
      firstBetterId: null,
      apiLogs: [],
      isSpeakingTTS: false,
    });
  },

  resetGame() {
    set({
      players: [],
      deck: [],
      pot: 0,
      currentBet: 0,
      minRaise: MIN_RAISE,
      phase: 'setup',
      roundCount: 0,
      bettingRound: 0,
      logs: [],
      roundResult: null,
      isRunning: false,
      activePlayerId: null,
      firstBetterId: null,
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
    set({ deck: shuffleDeck(createXitoDeck()) });
  },

  /* ---- phase ---- */
  setPhase(phase) {
    set({ phase });
  },

  setBettingRound(round) {
    set({ bettingRound: round });
  },

  nextRound() {
    const state = get();
    
    // Reset hands and statuses
    const resetPlayers = state.players.map((p) => ({
      ...p,
      holeCard: null,
      faceUpCards: [],
      status: 'waiting' as const,
      expression: '😴' as const,
      currentBet: DEFAULT_ANTE,
      roundBet: 0,
      isFirstBetter: false,
      chips: p.chips - DEFAULT_ANTE,
    }));
    
    // Calculate new pot from antes
    const newPot = resetPlayers.length * DEFAULT_ANTE;
    
    set({
      players: resetPlayers,
      deck: shuffleDeck(createXitoDeck()),
      pot: newPot,
      currentBet: 0,
      minRaise: MIN_RAISE,
      phase: 'deal_initial',
      roundCount: state.roundCount + 1,
      bettingRound: 0,
      roundResult: null,
      activePlayerId: null,
      firstBetterId: null,
    });
  },

  /* ---- logging ---- */
  addLog(msg) {
    const full: XitoChatMessage = { ...msg, id: uid(), timestamp: Date.now() };
    set((s) => ({ logs: [...s.logs, full] }));
    return full;
  },

  /* ---- dealing ---- */
  dealHoleCard(playerId) {
    const card = get().drawCard(false); // Face down
    if (!card) return null;
    
    set((s) => ({
      players: s.players.map((p) =>
        p.id === playerId ? { ...p, holeCard: card } : p
      ),
    }));
    
    return card;
  },

  dealFaceUpCard(playerId, faceUp = true) {
    const card = get().drawCard(faceUp);
    if (!card) return null;
    
    set((s) => ({
      players: s.players.map((p) =>
        p.id === playerId ? { ...p, faceUpCards: [...p.faceUpCards, card] } : p
      ),
    }));
    
    return card;
  },

  /* ---- player state ---- */
  setPlayerStatus(playerId, status) {
    set((s) => ({
      players: s.players.map((p) =>
        p.id === playerId ? { ...p, status } : p
      ),
    }));
  },

  setPlayerExpression(playerId, expression) {
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

  addToPlayerBet(playerId, amount) {
    set((s) => ({
      players: s.players.map((p) =>
        p.id === playerId 
          ? { ...p, currentBet: p.currentBet + amount, roundBet: p.roundBet + amount } 
          : p
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

  setFirstBetter(playerId) {
    set({ firstBetterId: playerId });
  },

  setPlayerAsFirstBetter(playerId) {
    set((s) => ({
      players: s.players.map((p) => ({
        ...p,
        isFirstBetter: p.id === playerId,
      })),
      firstBetterId: playerId,
    }));
  },

  /* ---- betting actions ---- */
  playerFold(playerId) {
    set((s) => ({
      players: s.players.map((p) =>
        p.id === playerId ? { ...p, status: 'folded' } : p
      ),
    }));
  },

  playerCall(playerId) {
    const state = get();
    const player = state.players.find((p) => p.id === playerId);
    if (!player) return;
    
    const callAmount = state.currentBet - player.roundBet;
    const actualCall = Math.min(callAmount, player.chips);
    
    set((s) => ({
      players: s.players.map((p) =>
        p.id === playerId
          ? {
              ...p,
              chips: p.chips - actualCall,
              currentBet: p.currentBet + actualCall,
              roundBet: p.roundBet + actualCall,
              status: actualCall >= player.chips ? 'all_in' : 'active',
            }
          : p
      ),
      pot: s.pot + actualCall,
    }));
  },

  playerRaise(playerId, amount) {
    const state = get();
    const player = state.players.find((p) => p.id === playerId);
    if (!player) return;
    
    const callAmount = state.currentBet - player.roundBet;
    const totalBet = callAmount + amount;
    const actualBet = Math.min(totalBet, player.chips);
    
    set((s) => ({
      players: s.players.map((p) =>
        p.id === playerId
          ? {
              ...p,
              chips: p.chips - actualBet,
              currentBet: p.currentBet + actualBet,
              roundBet: p.roundBet + actualBet,
              status: actualBet >= player.chips ? 'all_in' : 'active',
            }
          : p
      ),
      pot: s.pot + actualBet,
      currentBet: s.currentBet + amount,
      minRaise: amount,
    }));
  },

  playerAllIn(playerId) {
    const state = get();
    const player = state.players.find((p) => p.id === playerId);
    if (!player) return;
    
    const allInAmount = player.chips;
    const newRoundBet = player.roundBet + allInAmount;
    
    set((s) => ({
      players: s.players.map((p) =>
        p.id === playerId
          ? {
              ...p,
              chips: 0,
              currentBet: p.currentBet + allInAmount,
              roundBet: newRoundBet,
              status: 'all_in',
            }
          : p
      ),
      pot: s.pot + allInAmount,
      currentBet: Math.max(s.currentBet, newRoundBet),
    }));
  },

  playerCheck(playerId) {
    // Just mark as active, no chips moved
    set((s) => ({
      players: s.players.map((p) =>
        p.id === playerId ? { ...p, status: 'active' } : p
      ),
    }));
  },

  /* ---- pot management ---- */
  addToPot(amount) {
    set((s) => ({ pot: s.pot + amount }));
  },

  setCurrentBet(bet) {
    set({ currentBet: bet });
  },

  resetBettingRound() {
    set((s) => ({
      currentBet: 0,
      players: s.players.map((p) => ({
        ...p,
        roundBet: 0,
        status: p.status === 'folded' || p.status === 'all_in' ? p.status : 'waiting',
      })),
    }));
  },

  /* ---- round resolution ---- */
  resolveShowdown() {
    const { players, pot } = get();
    
    // Get players who haven't folded
    const activePlayers = players.filter((p) => p.status !== 'folded');
    
    if (activePlayers.length === 0) {
      // Shouldn't happen, but handle gracefully
      return {
        winnerIds: [],
        winnerId: '',
        winnerName: 'Không có',
        winAmount: 0,
        handEvaluation: evaluateHand([]),
        playerResults: [],
      };
    }
    
    // Evaluate all hands
    const evaluations = activePlayers.map((p) => ({
      player: p,
      evaluation: evaluateHand(getAllCards(p)),
    }));
    
    // Find strongest hand
    let winner = evaluations[0];
    for (let i = 1; i < evaluations.length; i++) {
      if (compareHands(evaluations[i].evaluation, winner.evaluation) > 0) {
        winner = evaluations[i];
      }
    }

    // Split pot if multiple tied winners
    const winners = evaluations.filter(
      (e) => compareHands(e.evaluation, winner.evaluation) === 0,
    );
    const payoutBase = Math.floor(pot / winners.length);
    const payoutRemainder = pot % winners.length;
    const winnerPayout = new Map<string, number>();

    winners.forEach((w, idx) => {
      const amount = payoutBase + (idx < payoutRemainder ? 1 : 0);
      winnerPayout.set(w.player.id, amount);
      get().updatePlayerChips(w.player.id, amount);
    });
    
    const result: XitoRoundResult = {
      winnerIds: winners.map((w) => w.player.id),
      winnerId: winner.player.id,
      winnerName: winners.map((w) => w.player.name).join(', '),
      winAmount: pot,
      handEvaluation: winner.evaluation,
      playerResults: players.map((p) => ({
        playerId: p.id,
        playerName: p.name,
        handEvaluation: evaluateHand(getAllCards(p)),
        chipsWon: winnerPayout.get(p.id) ?? 0,
        folded: p.status === 'folded',
      })),
    };
    
    set({ roundResult: result, pot: 0 });
    return result;
  },

  resolveFoldWin(winnerId) {
    const { players, pot } = get();
    const winner = players.find((p) => p.id === winnerId);
    
    if (!winner) {
      return {
        winnerIds: [],
        winnerId: '',
        winnerName: 'Không có',
        winAmount: 0,
        handEvaluation: evaluateHand([]),
        playerResults: [],
      };
    }
    
    // Update winner's chips
    get().updatePlayerChips(winnerId, pot);
    
    const result: XitoRoundResult = {
      winnerIds: [winner.id],
      winnerId: winner.id,
      winnerName: winner.name,
      winAmount: pot,
      handEvaluation: evaluateHand(getAllCards(winner)),
      playerResults: players.map((p) => ({
        playerId: p.id,
        playerName: p.name,
        handEvaluation: evaluateHand(getAllCards(p)),
        chipsWon: p.id === winnerId ? pot : 0,
        folded: p.status === 'folded',
      })),
    };
    
    set({ roundResult: result, pot: 0 });
    return result;
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
    const full: XitoApiLogEntry = { ...entry, id: uid() };
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

  /* ---- helpers ---- */
  getActivePlayers() {
    return get().players.filter((p) => p.status !== 'folded' && p.chips > 0);
  },

  getNextActivePlayer(currentId) {
    const { players } = get();
    const activePlayers = players.filter((p) => p.status !== 'folded' && (p.status !== 'all_in' || p.id === currentId));
    
    if (activePlayers.length === 0) return null;
    
    const currentIndex = activePlayers.findIndex((p) => p.id === currentId);
    if (currentIndex === -1) return activePlayers[0];
    
    const nextIndex = (currentIndex + 1) % activePlayers.length;
    return activePlayers[nextIndex];
  },

  isBettingComplete() {
    const { players, currentBet, firstBetterId } = get();
    const activePlayers = players.filter((p) => p.status !== 'folded' && p.status !== 'all_in');
    
    // If only one player left (not all-in), betting is complete
    if (activePlayers.length <= 1) return true;
    
    // Check if all active players have matched the current bet
    return activePlayers.every((p) => p.roundBet >= currentBet);
  },

  findHighestFaceUpCard() {
    const { players } = get();
    const activePlayers = players.filter(
      (p) => p.status !== 'folded' && p.faceUpCards.some((c) => c.faceUp),
    );
    
    if (activePlayers.length === 0) return null;
    
    let highest = activePlayers[0];
    let highestValue = 0;
    let highestSuit = 0;
    
    for (const player of activePlayers) {
      const visibleCards = player.faceUpCards.filter((c) => c.faceUp);
      const lastCard = visibleCards[visibleCards.length - 1];
      if (!lastCard) continue;
      
      const { RANK_VALUE, SUIT_RANK } = require('@/lib/xito/types');
      const cardValue = RANK_VALUE[lastCard.rank];
      const cardSuit = SUIT_RANK[lastCard.suit];
      
      if (cardValue > highestValue || (cardValue === highestValue && cardSuit > highestSuit)) {
        highest = player;
        highestValue = cardValue;
        highestSuit = cardSuit;
      }
    }
    
    return highest;
  },
}));
