import { useXitoStore } from '@/store/xitoStore';
import {
  callXitoAgent,
  buildBettingPrompt,
  buildDealReactionPrompt,
  buildShowdownPrompt,
  buildFoldWinPrompt,
} from '@/lib/xito/agent';
import {
  XitoPlayer,
  formatCard,
  formatHand,
  evaluateHand,
  getAllCards,
  HAND_RANK_EMOJI,
  HAND_RANK_NAME,
  RANK_VALUE,
  SUIT_RANK,
} from '@/lib/xito/types';

/* helper: background simulation mode flag */
let _backgroundMode = false;

/* helper: wait for `ms` milliseconds (skipped in background mode) */
const delay = (ms: number) => _backgroundMode ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));

/* helper: find and cache the best Vietnamese voice */
let cachedViVoice: SpeechSynthesisVoice | null | undefined;
function getVietnameseVoice(): SpeechSynthesisVoice | null {
  if (cachedViVoice !== undefined) return cachedViVoice;
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    cachedViVoice = null;
    return null;
  }
  const voices = window.speechSynthesis.getVoices();
  cachedViVoice =
    voices.find((v) => v.lang === 'vi-VN') ??
    voices.find((v) => v.lang.startsWith('vi')) ??
    null;
  return cachedViVoice;
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedViVoice = undefined;
  };
}

/* helper: speak text via Web Speech API */
function speakTTS(text: string, isThought = false): Promise<void> {
  if (_backgroundMode) return Promise.resolve();
  const { ttsEnabled, setIsSpeakingTTS } = useXitoStore.getState();
  if (!ttsEnabled || typeof window === 'undefined' || !window.speechSynthesis) {
    return Promise.resolve();
  }
  const cleanText = text.replace(/^\[[^\]]+\]\s*/, '').trim();
  if (!cleanText) return Promise.resolve();
  setIsSpeakingTTS(true);
  return new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(cleanText);
    u.lang = 'vi-VN';
    const voice = getVietnameseVoice();
    if (voice) u.voice = voice;
    u.rate = 1.25;
    u.onend = () => { setIsSpeakingTTS(false); resolve(); };
    u.onerror = () => { setIsSpeakingTTS(false); resolve(); };
    window.speechSynthesis.speak(u);
  });
}

/* ------------------------------------------------------------------ */
/*  MAIN GAME LOOP                                                     */
/* ------------------------------------------------------------------ */
export async function runXitoLoop(backgroundMode = false) {
  _backgroundMode = backgroundMode;
  const store = useXitoStore.getState;

  if (backgroundMode) store().setSimulating(true);

  addSystemLog('🎰 Ván Xì Tố bắt đầu!');
  await delay(store().speed);

  while (store().isRunning && store().phase !== 'game_over') {
    // Check if enough players have chips
    const playersWithChips = store().players.filter((p) => p.chips > 0);
    if (playersWithChips.length < 2) {
      addSystemLog('💸 Không đủ người chơi có chips! Game kết thúc.');
      store().setPhase('game_over');
      break;
    }

    // Deal initial cards (2 face-up + 1 hidden)
    await dealInitialPhase();
    
    // Check if only one player left
    if (checkSinglePlayerLeft()) continue;

    // Betting round 1
    await bettingPhase(1);
    if (checkSinglePlayerLeft()) continue;

    // Reveal second public card
    await dealCardPhase(4);
    if (checkSinglePlayerLeft()) continue;

    // Betting round 2
    await bettingPhase(2);
    if (checkSinglePlayerLeft()) continue;

    // Reveal third/final public card
    await dealCardPhase(5);
    if (checkSinglePlayerLeft()) continue;

    // Betting round 3
    await bettingPhase(3);
    if (checkSinglePlayerLeft()) continue;

    // Showdown
    await showdownPhase();

    // Check remaining players
    const remaining = store().players.filter((p) => p.chips > 0);
    if (remaining.length < 2) {
      addSystemLog('🏆 Chỉ còn 1 người chơi có chips! Game kết thúc.');
      store().setPhase('game_over');
      break;
    }

    // Next round
    await delay(store().speed * 2);
    
    if (store().isRunning) {
      addSystemLog(`🔄 Bắt đầu ván mới...`);
      store().nextRound();
      await delay(store().speed);
    }
  }

  _backgroundMode = false;
  if (backgroundMode) store().setSimulating(false);
}

/* ================================================================== */
/*  Check if only one player remains                                   */
/* ================================================================== */
function checkSinglePlayerLeft(): boolean {
  const store = useXitoStore.getState;
  const activePlayers = store().players.filter((p) => p.status !== 'folded');
  
  if (activePlayers.length === 1) {
    const winner = activePlayers[0];
    addSystemLog(`🏆 ${winner.name} thắng do tất cả đối thủ bỏ bài!`);
    
    const result = store().resolveFoldWin(winner.id);
    store().setPhase('round_end');
    
    // Get winner reaction
    (async () => {
      const includeThought = Math.random() * 100 < store().thoughtProbability;
      const { system, user } = buildFoldWinPrompt(
        winner,
        result.winAmount,
        store().players.length - 1,
        includeThought,
      );
      
      store().setActivePlayer(winner.id);
      const response = await callXitoAgent(winner, system, user);
      store().setPlayerExpression(winner.id, response.expression);
      
      if (response.thought) {
        await addThought(winner.name, response.thought, response.expression);
      }
      await addSpeech(winner.name, response.speech, response.expression);
      store().setActivePlayer(null);
    })();
    
    return true;
  }
  
  return false;
}

/* ================================================================== */
/*  DEAL INITIAL PHASE - 2 face-up + 1 hidden                          */
/* ================================================================== */
async function dealInitialPhase() {
  const store = useXitoStore.getState;
  store().setPhase('deal_initial');
  
  addSystemLog(`🎴 Ván ${store().roundCount} - Chia bài!`);
  await delay(store().speed / 2);

  const players = store().players.filter((p) => p.chips > 0);

  // Deal hidden card to each player (private)
  for (const player of players) {
    store().setActivePlayer(player.id);
    store().setPlayerStatus(player.id, 'active');
    
    const holeCard = store().dealHoleCard(player.id);
    if (holeCard) {
      addSystemLog(`🂠 ${player.name} nhận lá úp`);
      await delay(store().speed / 3);
      
      // Reaction to hole card
      const includeThought = Math.random() * 100 < store().thoughtProbability;
      const updatedPlayer = store().players.find((p) => p.id === player.id)!;
      const { system, user } = buildDealReactionPrompt(
        updatedPlayer,
        holeCard,
        1,
        includeThought,
      );
      
      const response = await callXitoAgent(updatedPlayer, system, user);
      store().setPlayerExpression(player.id, response.expression);
      
      if (response.thought) {
        await addThought(player.name, response.thought, response.expression);
        await delay(400);
      }
      await addSpeech(player.name, response.speech, response.expression);
    }
    
    store().setActivePlayer(null);
  }

  await delay(store().speed / 2);

  // Deal first face-up card to each player
  for (const player of players) {
    store().setActivePlayer(player.id);
    
    const faceUpCard1 = store().dealFaceUpCard(player.id, true);
    if (faceUpCard1) {
      addSystemLog(`🃏 ${player.name} nhận lá ngửa 1: ${formatCard(faceUpCard1)}`);
      await delay(store().speed / 3);
      
      // Reaction to first face-up card
      const includeThought = Math.random() * 100 < store().thoughtProbability;
      const updatedPlayer = store().players.find((p) => p.id === player.id)!;
      const { system, user } = buildDealReactionPrompt(
        updatedPlayer,
        faceUpCard1,
        2,
        includeThought,
      );
      
      const response = await callXitoAgent(updatedPlayer, system, user);
      store().setPlayerExpression(player.id, response.expression);
      
      if (response.thought) {
        await addThought(player.name, response.thought, response.expression);
        await delay(400);
      }
      await addSpeech(player.name, response.speech, response.expression);
    }
    
    store().setActivePlayer(null);
  }

  await delay(store().speed / 2);

  // Deal second face-up card to each player
  for (const player of players) {
    store().setActivePlayer(player.id);

    const faceUpCard2 = store().dealFaceUpCard(player.id, true);
    if (faceUpCard2) {
      addSystemLog(`🃏 ${player.name} nhận lá ngửa 2: ${formatCard(faceUpCard2)}`);
      await delay(store().speed / 3);

      const includeThought = Math.random() * 100 < store().thoughtProbability;
      const updatedPlayer = store().players.find((p) => p.id === player.id)!;
      const { system, user } = buildDealReactionPrompt(
        updatedPlayer,
        faceUpCard2,
        3,
        includeThought,
      );

      const response = await callXitoAgent(updatedPlayer, system, user);
      store().setPlayerExpression(player.id, response.expression);

      if (response.thought) {
        await addThought(player.name, response.thought, response.expression);
        await delay(400);
      }
      await addSpeech(player.name, response.speech, response.expression);
    }

    store().setActivePlayer(null);
  }

  await delay(store().speed / 2);
}

/* ================================================================== */
/*  DEAL CARD PHASE - Reveal one public face-up card each round         */
/* ================================================================== */
async function dealCardPhase(cardNumber: number) {
  const store = useXitoStore.getState;
  
  const phaseMap: Record<number, 'deal_4th' | 'deal_5th'> = {
    4: 'deal_4th',
    5: 'deal_5th',
  };
  store().setPhase(phaseMap[cardNumber]);
  
  addSystemLog(`🎴 Lật lá công khai thứ ${cardNumber - 2}...`);
  await delay(store().speed / 2);

  const activePlayers = store().players.filter((p) => p.status !== 'folded' && p.chips >= 0);

  for (const player of activePlayers) {
    store().setActivePlayer(player.id);
    
    const card = store().dealFaceUpCard(player.id);
    if (card) {
      addSystemLog(`🃏 ${player.name} lật: ${formatCard(card)}`);
      await delay(store().speed / 3);
      
      // Reaction to new card
      const includeThought = Math.random() * 100 < store().thoughtProbability;
      const updatedPlayer = store().players.find((p) => p.id === player.id)!;
      const { system, user } = buildDealReactionPrompt(
        updatedPlayer,
        card,
        cardNumber,
        includeThought,
      );
      
      const response = await callXitoAgent(updatedPlayer, system, user);
      store().setPlayerExpression(player.id, response.expression);
      
      if (response.thought) {
        await addThought(player.name, response.thought, response.expression);
        await delay(400);
      }
      await addSpeech(player.name, response.speech, response.expression);
    }
    
    store().setActivePlayer(null);
  }

  await delay(store().speed / 2);
}

/* ================================================================== */
/*  BETTING PHASE                                                      */
/* ================================================================== */
async function bettingPhase(roundNumber: number) {
  const store = useXitoStore.getState;
  
  const phaseMap: Record<number, 'betting_round_1' | 'betting_round_2' | 'betting_round_3'> = {
    1: 'betting_round_1',
    2: 'betting_round_2',
    3: 'betting_round_3',
  };
  store().setPhase(phaseMap[roundNumber]);
  store().setBettingRound(roundNumber);
  store().resetBettingRound();
  
  addSystemLog(`💰 Vòng cược ${roundNumber} bắt đầu!`);
  await delay(store().speed / 2);

  // Find player with highest face up card to start
  const firstBetter = store().findHighestFaceUpCard();
  if (!firstBetter) return;
  
  store().setPlayerAsFirstBetter(firstBetter.id);
  addSystemLog(`👑 ${firstBetter.name} có lá ngửa cao nhất, nói trước!`);
  await delay(store().speed / 3);

  // Betting loop
  let currentPlayerId = firstBetter.id;
  let consecutiveCalls = 0;
  const maxIterations = store().players.length * 10; // Safety limit
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;
    
    if (!store().isRunning) return;
    
    // Get current player
    const currentPlayer = store().players.find((p) => p.id === currentPlayerId);
    if (!currentPlayer || currentPlayer.status === 'folded' || currentPlayer.status === 'all_in') {
      // Skip to next player
      const nextPlayer = getNextPlayer(currentPlayerId);
      if (!nextPlayer) break;
      currentPlayerId = nextPlayer.id;
      continue;
    }
    
    // Check if betting is complete
    const activePlayers = store().players.filter((p) => p.status !== 'folded' && p.status !== 'all_in');
    if (activePlayers.length === 0) break;
    
    // Check if everyone has matched the current bet
    const allMatched = activePlayers.every((p) => p.roundBet >= store().currentBet);
    if (allMatched && consecutiveCalls >= activePlayers.length) {
      break;
    }
    
    store().setActivePlayer(currentPlayerId);
    
    // Get AI decision
    const includeThought = Math.random() * 100 < store().thoughtProbability;
    const { system, user } = buildBettingPrompt(
      currentPlayer,
      store().players,
      store().pot,
      store().currentBet,
      store().minRaise,
      roundNumber,
      includeThought,
    );
    
    const response = await callXitoAgent(currentPlayer, system, user);
    store().setPlayerExpression(currentPlayerId, response.expression);
    
    if (response.thought) {
      await addThought(currentPlayer.name, response.thought, response.expression);
      await delay(400);
    }
    await addSpeech(currentPlayer.name, response.speech, response.expression);
    
    // Execute action
    const toCall = store().currentBet - currentPlayer.roundBet;
    
    switch (response.action) {
      case 'fold':
        store().playerFold(currentPlayerId);
        addSystemLog(`❌ ${currentPlayer.name} bỏ bài!`);
        consecutiveCalls = 0;
        break;
        
      case 'check':
        if (toCall === 0) {
          store().playerCheck(currentPlayerId);
          addSystemLog(`✋ ${currentPlayer.name} xem bài`);
          consecutiveCalls++;
        } else {
          // Can't check, must call
          store().playerCall(currentPlayerId);
          addSystemLog(`📞 ${currentPlayer.name} theo ${toCall} chips`);
          consecutiveCalls++;
        }
        break;
        
      case 'call':
        store().playerCall(currentPlayerId);
        if (toCall > 0) {
          addSystemLog(`📞 ${currentPlayer.name} theo ${toCall} chips`);
        } else {
          addSystemLog(`✋ ${currentPlayer.name} xem bài`);
        }
        consecutiveCalls++;
        break;
        
      case 'raise':
        const raiseAmount = response.raiseAmount || store().minRaise;
        const validRaise = Math.max(store().minRaise, Math.min(raiseAmount, currentPlayer.chips - toCall));
        store().playerRaise(currentPlayerId, validRaise);
        addSystemLog(`📈 ${currentPlayer.name} tố ${validRaise} chips!`);
        consecutiveCalls = 0;
        break;
        
      case 'all_in':
        store().playerAllIn(currentPlayerId);
        addSystemLog(`🔥 ${currentPlayer.name} ALL-IN ${currentPlayer.chips} chips!`);
        consecutiveCalls = 0;
        break;
        
      default:
        // Default to call
        store().playerCall(currentPlayerId);
        addSystemLog(`📞 ${currentPlayer.name} theo ${toCall} chips`);
        consecutiveCalls++;
    }
    
    await delay(store().speed / 2);
    
    // Check if only one player left
    const remainingActive = store().players.filter((p) => p.status !== 'folded');
    if (remainingActive.length === 1) {
      store().setActivePlayer(null);
      return;
    }
    
    // Move to next player
    const nextPlayer = getNextPlayer(currentPlayerId);
    if (!nextPlayer) break;
    currentPlayerId = nextPlayer.id;
    
    store().setActivePlayer(null);
  }
  
  addSystemLog(`💰 Pot: ${store().pot} chips`);
  await delay(store().speed / 2);
}

/* ================================================================== */
/*  Get next player in order                                           */
/* ================================================================== */
function getNextPlayer(currentId: string): XitoPlayer | null {
  const store = useXitoStore.getState;
  const players = store().players;
  const activePlayers = players.filter((p) => p.status !== 'folded');
  
  if (activePlayers.length === 0) return null;
  
  const currentIndex = players.findIndex((p) => p.id === currentId);
  if (currentIndex === -1) return activePlayers[0];
  
  // Find next active player
  for (let i = 1; i <= players.length; i++) {
    const nextIndex = (currentIndex + i) % players.length;
    const nextPlayer = players[nextIndex];
    if (nextPlayer.status !== 'folded') {
      return nextPlayer;
    }
  }
  
  return null;
}

/* ================================================================== */
/*  SHOWDOWN PHASE                                                     */
/* ================================================================== */
async function showdownPhase() {
  const store = useXitoStore.getState;
  store().setPhase('showdown');
  
  addSystemLog(`🎯 SHOWDOWN - Lật bài!`);
  await delay(store().speed);

  const activePlayers = store().players.filter((p) => p.status !== 'folded');
  
  // Show all hands
  for (const player of activePlayers) {
    const allCards = getAllCards(player);
    // Flip hole card for display
    const handDisplay = allCards.map((c) => formatCard({ ...c, faceUp: true })).join(' ');
    const handEval = evaluateHand(allCards);
    
    addSystemLog(`${player.expression} ${player.name}: ${handDisplay} → ${HAND_RANK_EMOJI[handEval.rank]} ${handEval.description}`);
    await delay(store().speed / 2);
  }

  // Resolve winner
  const result = store().resolveShowdown();
  
  await delay(store().speed);
  const isTie = result.winnerIds.length > 1;
  if (isTie) {
    addSystemLog(`🤝 Đồng hạng: ${result.winnerName} với ${HAND_RANK_EMOJI[result.handEvaluation.rank]} ${result.handEvaluation.description}`);
    addSystemLog(`💰 Chia pot ${result.winAmount} chips cho ${result.winnerIds.length} người thắng`);
  } else {
    addSystemLog(`🏆 ${result.winnerName} THẮNG với ${HAND_RANK_EMOJI[result.handEvaluation.rank]} ${result.handEvaluation.description}!`);
    addSystemLog(`💰 Thắng ${result.winAmount} chips!`);
  }
  
  // Get reactions from all players
  for (const playerResult of result.playerResults) {
    if (playerResult.folded) continue;
    
    const player = store().players.find((p) => p.id === playerResult.playerId);
    if (!player) continue;
    
    store().setActivePlayer(player.id);
    
    const won = playerResult.chipsWon > 0;
    const includeThought = Math.random() * 100 < store().thoughtProbability;
    const { system, user } = buildShowdownPrompt(
      player,
      won,
      playerResult.chipsWon,
      includeThought,
    );
    
    const response = await callXitoAgent(player, system, user);
    store().setPlayerExpression(player.id, response.expression);
    
    if (response.thought) {
      await addThought(player.name, response.thought, response.expression);
    }
    await addSpeech(player.name, response.speech, response.expression);
    
    store().setActivePlayer(null);
    await delay(store().speed / 2);
  }

  store().setPhase('round_end');
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function addSystemLog(content: string) {
  const store = useXitoStore.getState();
  store.addLog({
    sender: 'system',
    content,
    type: 'system',
    phase: store.phase,
    roundCount: store.roundCount,
  });
}

async function addThought(playerName: string, content: string, expression?: string) {
  const store = useXitoStore.getState();
  store.addLog({
    sender: playerName,
    content,
    expression: expression as any,
    type: 'thought',
    phase: store.phase,
    roundCount: store.roundCount,
  });
  await speakTTS(content, true);
}

async function addSpeech(playerName: string, content: string, expression?: string) {
  const store = useXitoStore.getState();
  store.addLog({
    sender: playerName,
    content,
    expression: expression as any,
    type: 'speech',
    phase: store.phase,
    roundCount: store.roundCount,
  });
  await speakTTS(content, false);
}
