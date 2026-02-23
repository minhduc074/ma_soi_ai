import { useBlackjackStore } from '@/store/blackjackStore';
import { assignPlayerVoices, getVoice } from '@/lib/tts/voice';
import {
  callBlackjackAgent,
  buildBettingPrompt,
  buildPlayerTurnPrompt,
  buildDealerTurnPrompt,
  buildReactionPrompt,
  buildRoundEndPrompt,
} from '@/lib/blackjack/agent';
import {
  BlackjackAgentResponse,
  BlackjackChatMessage,
  BlackjackPlayer,
  calculateHandValue,
  formatCard,
  formatHand,
  getSpecialHand,
  SPECIAL_HAND_INFO,
} from '@/lib/blackjack/types';

/* helper: background simulation mode flag */
let _backgroundMode = false;

/* helper: wait for `ms` milliseconds (skipped in background mode) */
const delay = (ms: number) => _backgroundMode ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));

const PIPER_TTS_URL = 'http://localhost:5500/tts';
let piperAvailable: boolean | null = null; // null = chưa kiểm tra

/* kiểm tra Piper server một lần duy nhất */
async function checkPiper(): Promise<boolean> {
  if (piperAvailable !== null) return piperAvailable;
  try {
    const r = await fetch('http://localhost:5500/health', { signal: AbortSignal.timeout(800) });
    piperAvailable = r.ok;
  } catch {
    piperAvailable = false;
  }
  return piperAvailable;
}

/* helper: find and cache the best Vietnamese voice (fallback) */
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
  window.speechSynthesis.onvoiceschanged = () => { cachedViVoice = undefined; };
}

/* helper: speak text — Piper TTS nếu có, fallback Web Speech API */
function speakTTS(text: string, isThought = false, voice?: string): Promise<void> {
  if (_backgroundMode) return Promise.resolve();
  const { ttsEnabled, setIsSpeakingTTS } = useBlackjackStore.getState();
  if (!ttsEnabled || typeof window === 'undefined') return Promise.resolve();
  const cleanText = text.replace(/^\[[^\]]+\]\s*/, '').replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]/gu, '').trim();
  if (!cleanText) return Promise.resolve();

  setIsSpeakingTTS(true);

  return checkPiper().then((hasPiper) => {
    if (hasPiper) {
      // Edge Neural TTS — phát qua AudioContext (MP3)
      return fetch(PIPER_TTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText, voice }),
      })
        .then((r) => r.arrayBuffer())
        .then((buf) => {
          const ctx = new AudioContext();
          return ctx.decodeAudioData(buf).then((decoded) => {
            const src = ctx.createBufferSource();
            src.buffer = decoded;
            src.connect(ctx.destination);
            src.start();
            return new Promise<void>((resolve) => {
              src.onended = () => { setIsSpeakingTTS(false); ctx.close(); resolve(); };
            });
          });
        })
        .catch(() => {
          piperAvailable = false; // server lỗi → dùng fallback
          setIsSpeakingTTS(false);
        });
    }

    // Fallback: Web Speech API
    if (!window.speechSynthesis) { setIsSpeakingTTS(false); return; }
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
  });
}

/* ------------------------------------------------------------------ */
/*  MAIN GAME LOOP                                                     */
/* ------------------------------------------------------------------ */
export async function runBlackjackLoop(backgroundMode = false) {
  _backgroundMode = backgroundMode;
  const store = useBlackjackStore.getState;

  if (backgroundMode) store().setSimulating(true);

  // Gán giọng cho từng nhân vật dựa theo tên
  const allPlayers = [
    ...(store().dealer ? [store().dealer!] : []),
    ...store().players,
  ];
  await assignPlayerVoices(allPlayers);

  addSystemLog('🃏 Ván Xì Dách bắt đầu!');
  await delay(store().speed);

  while (store().isRunning && store().phase !== 'game_over') {
    // Only deal to players who still have chips
    const playersWithChips = store().players.filter((p) => p.chips > 0);
    if (playersWithChips.length === 0) {
      addSystemLog('💸 Tất cả người chơi đã hết chips! Game kết thúc.');
      store().setPhase('game_over');
      break;
    }

    await bettingPhase();
    await dealingPhase();
    await playerTurnsPhase();
    await dealerTurnPhase();

    // Track who had chips before payout to detect new eliminations
    const hadChipsBefore = new Set(store().players.filter((p) => p.chips > 0).map((p) => p.id));
    await payoutPhase();

    // Announce players who just ran out of chips this round
    for (const p of store().players) {
      if (hadChipsBefore.has(p.id) && p.chips <= 0) {
        addSystemLog(`💸 ${p.name} đã hết chips và bị loại khỏi bàn!`);
      }
    }

    const remaining = store().players.filter((p) => p.chips > 0);
    if (remaining.length === 0) {
      addSystemLog('💸 Tất cả người chơi đã hết chips! Game kết thúc.');
      store().setPhase('game_over');
      break;
    }

    // Ask if want to continue
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
/*  BETTING PHASE                                                      */
/* ================================================================== */
async function bettingPhase() {
  const store = useBlackjackStore.getState;
  store().setPhase('betting');

  addSystemLog(`💰 Ván ${store().roundCount} - Đặt cược!`);
  await delay(store().speed / 2);

  const players = store().players.filter((p) => p.chips > 0);

  for (const player of players) {
    if (!store().isRunning) return;

    store().setActivePlayer(player.id);

    const includeThought = Math.random() * 100 < store().thoughtProbability;
    const { system, user } = buildBettingPrompt(
      player,
      players,
      store().roundCount,
      includeThought,
    );

    const response = await callBlackjackAgent(player, system, user);

    store().setPlayerExpression(player.id, response.expression);

    if (response.thought) {
      await addThought(player.name, response.thought, response.expression);
      await delay(400);
    }

    const proposedBet = typeof response.raiseAmount === 'number' ? response.raiseAmount : 0;
    const fallbackBet = Math.max(1, Math.min(50, player.chips));
    const finalBet = proposedBet > 0
      ? Math.max(1, Math.min(Math.floor(proposedBet), player.chips))
      : fallbackBet;

    store().setPlayerBet(player.id, finalBet);

    const speech = response.speech?.trim()
      ? `${response.speech} (Cược ${finalBet})`
      : `Tôi cược ${finalBet} chips.`;
    await addSpeech(player.name, speech, response.expression);

    addSystemLog(`💵 ${player.name} cược ${finalBet} chips.`);
    store().setActivePlayer(null);
    await delay(store().speed / 3);
  }
}

/* ================================================================== */
/*  DEALING PHASE                                                      */
/* ================================================================== */
async function dealingPhase() {
  const store = useBlackjackStore.getState;
  store().setPhase('dealing');
  
  addSystemLog(`🎴 Ván ${store().roundCount} - Chia bài!`);
  await delay(store().speed / 2);

  const players = store().players.filter((p) => p.chips > 0);
  const dealer = store().dealer;

  if (!dealer) return;

  // Deal 2 cards to each player
  for (const player of players) {
    store().setActivePlayer(player.id);
    
    // First card
    const card1 = store().dealCardToPlayer(player.id, true);
    if (card1) {
      addSystemLog(`🃏 ${player.name} nhận: ${formatCard(card1)}`);
      await delay(store().speed / 3);
    }
    
    // Second card
    const card2 = store().dealCardToPlayer(player.id, true);
    if (card2) {
      addSystemLog(`🃏 ${player.name} nhận: ${formatCard(card2)}`);
      await delay(store().speed / 3);
    }

    // Check for instant win (Xi Bang or Xi Dach)
    const updatedPlayer = store().players.find((p) => p.id === player.id)!;
    const specialHand = getSpecialHand(updatedPlayer.hand);
    if (specialHand === 'xi_bang' || specialHand === 'xi_dach') {
      const info = SPECIAL_HAND_INFO[specialHand];
      addSystemLog(`🎉 ${player.name} có ${info.emoji} ${info.name}!`);
      store().setPlayerStatus(player.id, 'blackjack');
      store().setPlayerExpression(player.id, '🤑');
    }

    store().setActivePlayer(null);
  }

  // Deal 2 cards to dealer (one face down)
  store().setActivePlayer(dealer.id);
  
  const dealerCard1 = store().dealCardToDealer(true);
  if (dealerCard1) {
    addSystemLog(`🎴 Nhà cái nhận: ${formatCard(dealerCard1)}`);
    await delay(store().speed / 3);
  }
  
  const dealerCard2 = store().dealCardToDealer(false); // Face down
  if (dealerCard2) {
    addSystemLog(`🎴 Nhà cái nhận: 🂠 (úp)`);
    await delay(store().speed / 3);
  }

  store().setActivePlayer(null);
  await delay(store().speed / 2);
}

/* ================================================================== */
/*  PLAYER TURNS PHASE                                                 */
/* ================================================================== */
async function playerTurnsPhase() {
  const store = useBlackjackStore.getState;
  store().setPhase('player_turns');
  
  const players = store().players.filter(
    (p) => p.chips > 0 && p.status !== 'blackjack'
  );
  const dealer = store().dealer;

  if (!dealer) return;

  for (const player of players) {
    if (!store().isRunning) return;
    
    let currentPlayer = store().players.find((p) => p.id === player.id)!;
    
    // Player turn loop
    while (
      currentPlayer.status !== 'stood' &&
      currentPlayer.status !== 'busted' &&
      currentPlayer.hand.length < 5
    ) {
      if (!store().isRunning) return;
      
      store().setActivePlayer(currentPlayer.id);
      store().setPlayerStatus(currentPlayer.id, 'playing');
      
      const handValue = calculateHandValue(currentPlayer.hand);
      const mustHit = handValue < 16;
      
      addSystemLog(`🎯 Lượt của ${currentPlayer.name} (${handValue} điểm)`);
      await delay(store().speed / 2);

      // Call AI for decision
      const includeThought = Math.random() * 100 < store().thoughtProbability;
      const { system, user } = buildPlayerTurnPrompt(
        currentPlayer,
        dealer,
        store().players,
        includeThought,
      );
      
      const response = await callBlackjackAgent(currentPlayer, system, user);
      
      // Update expression
      store().setPlayerExpression(currentPlayer.id, response.expression);
      
      // Show thought if any
      if (response.thought) {
        await addThought(currentPlayer.name, response.thought, response.expression);
        await delay(400);
      }
      
      // Show speech
      await addSpeech(currentPlayer.name, response.speech, response.expression);
      
      // Determine action (enforce rules)
      let action = response.action || '';
      if (mustHit) {
        action = 'hit'; // Force hit if under 16
      }
      if (currentPlayer.hand.length >= 5) {
        action = 'stand'; // Can't hit with 5 cards
      }

      if (action === 'hit') {
        // Draw a card
        const newCard = store().dealCardToPlayer(currentPlayer.id, true);
        if (newCard) {
          addSystemLog(`🃏 ${currentPlayer.name} rút: ${formatCard(newCard)}`);
          await delay(store().speed / 2);
          
          // Get reaction to new card
          currentPlayer = store().players.find((p) => p.id === player.id)!;
          const newHandValue = calculateHandValue(currentPlayer.hand);
          const newSpecialHand = getSpecialHand(currentPlayer.hand);
          
          if (newHandValue > 21) {
            // Busted!
            store().setPlayerStatus(currentPlayer.id, 'busted');
            store().setPlayerExpression(currentPlayer.id, '😱');
            addSystemLog(`💥 ${currentPlayer.name} QUẮC! (${newHandValue} điểm)`);
            
            // Get reaction
            const { system: rSys, user: rUser } = buildReactionPrompt(
              currentPlayer,
              newCard,
              includeThought,
            );
            const reactionRes = await callBlackjackAgent(currentPlayer, rSys, rUser);
            store().setPlayerExpression(currentPlayer.id, reactionRes.expression);
            if (reactionRes.thought) {
              await addThought(currentPlayer.name, reactionRes.thought, reactionRes.expression);
            }
            await addSpeech(currentPlayer.name, reactionRes.speech, reactionRes.expression);
          } else if (newSpecialHand === 'ngu_linh') {
            // Ngu Linh!
            store().setPlayerStatus(currentPlayer.id, 'stood');
            store().setPlayerExpression(currentPlayer.id, '🤑');
            addSystemLog(`🖐️ ${currentPlayer.name} NGŨ LINH! (5 lá, ${newHandValue} điểm)`);
          }
        }
      } else {
        // Stand
        store().setPlayerStatus(currentPlayer.id, 'stood');
        addSystemLog(`✋ ${currentPlayer.name} dằn bài.`);
      }
      
      // Refresh player data
      currentPlayer = store().players.find((p) => p.id === player.id)!;
      await delay(store().speed / 2);
    }
    
    store().setActivePlayer(null);
  }
}

/* ================================================================== */
/*  DEALER TURN PHASE                                                  */
/* ================================================================== */
async function dealerTurnPhase() {
  const store = useBlackjackStore.getState;
  store().setPhase('dealer_turn');
  
  let dealer = store().dealer;
  if (!dealer) return;

  store().setActivePlayer(dealer.id);
  
  // Flip the face-down card
  const updatedHand = dealer.hand.map((c) => ({ ...c, faceUp: true }));
  useBlackjackStore.setState((s) => ({
    dealer: s.dealer ? { ...s.dealer, hand: updatedHand } : null,
  }));
  
  dealer = useBlackjackStore.getState().dealer!;
  const handDisplay = formatHand(dealer.hand);
  addSystemLog(`🎴 Nhà cái lật bài: ${handDisplay}`);
  await delay(store().speed);

  // Check for instant win
  const initialSpecial = getSpecialHand(dealer.hand);
  if (initialSpecial === 'xi_bang' || initialSpecial === 'xi_dach') {
    const info = SPECIAL_HAND_INFO[initialSpecial];
    addSystemLog(`🎉 Nhà cái có ${info.emoji} ${info.name}!`);
    store().setActivePlayer(null);
    return;
  }

  // Dealer turn loop
  while (dealer.hand.length < 5) {
    if (!store().isRunning) return;
    
    const handValue = calculateHandValue(dealer.hand);
    const mustHit = handValue < 16;

    addSystemLog(`🎴 Nhà cái: ${handValue} điểm`);
    await delay(store().speed / 2);

    // Call AI for dealer decision
    const includeThought = Math.random() * 100 < store().thoughtProbability;
    const players = store().players.filter((p) => p.chips > 0);
    const { system, user } = buildDealerTurnPrompt(dealer, players, store().logs, includeThought);
    
    const response = await callBlackjackAgent(dealer, system, user);
    
    // Update expression
    store().setPlayerExpression(dealer.id, response.expression);
    
    if (response.thought) {
      await addThought(dealer.name, response.thought, response.expression);
      await delay(400);
    }
    
    await addSpeech(dealer.name, response.speech, response.expression);
    
    // Determine action
    let action = response.action || '';
    if (mustHit) {
      action = 'hit';
    }
    if (dealer.hand.length >= 5) {
      action = 'stand';
    }

    if (action === 'hit') {
      const newCard = store().dealCardToDealer(true);
      if (newCard) {
        addSystemLog(`🃏 Nhà cái rút: ${formatCard(newCard)}`);
        await delay(store().speed / 2);
        
        dealer = useBlackjackStore.getState().dealer!;
        const newHandValue = calculateHandValue(dealer.hand);
        const newSpecialHand = getSpecialHand(dealer.hand);
        
        if (newHandValue > 21) {
          store().setPlayerExpression(dealer.id, '😱');
          addSystemLog(`💥 Nhà cái QUẮC! (${newHandValue} điểm)`);
          break;
        } else if (newSpecialHand === 'ngu_linh') {
          store().setPlayerExpression(dealer.id, '🤑');
          addSystemLog(`🖐️ Nhà cái NGŨ LINH! (5 lá, ${newHandValue} điểm)`);
          break;
        }
      }
    } else {
      addSystemLog(`✋ Nhà cái dằn bài.`);
      break;
    }
    
    dealer = useBlackjackStore.getState().dealer!;
    await delay(store().speed / 2);
  }

  store().setActivePlayer(null);
}

/* ================================================================== */
/*  PAYOUT PHASE                                                       */
/* ================================================================== */
async function payoutPhase() {
  const store = useBlackjackStore.getState;
  store().setPhase('payout');
  
  const dealer = store().dealer;
  if (!dealer) return;

  addSystemLog(`📊 Kết quả ván ${store().roundCount}:`);
  await delay(store().speed / 2);

  const result = store().resolveRound();
  const dealerValue = result.dealerHandValue;
  const dealerSpecial = result.dealerSpecialHand;
  
  const dealerInfo = dealerSpecial !== 'normal' 
    ? `${SPECIAL_HAND_INFO[dealerSpecial].emoji} ${SPECIAL_HAND_INFO[dealerSpecial].name}`
    : `${dealerValue} điểm`;
  addSystemLog(`🎴 Nhà cái: ${formatHand(dealer.hand)} = ${dealerInfo}`);
  
  for (const playerResult of result.playerResults) {
    const player = store().players.find((p) => p.id === playerResult.playerId);
    if (!player) continue;
    
    const playerInfo = playerResult.specialHand !== 'normal'
      ? `${SPECIAL_HAND_INFO[playerResult.specialHand].emoji} ${SPECIAL_HAND_INFO[playerResult.specialHand].name}`
      : `${playerResult.handValue} điểm`;
    
    const resultEmoji = playerResult.won ? '✅' : '❌';
    const payoutText = playerResult.payout > 0 ? `+${playerResult.payout}` : `${playerResult.payout}`;
    
    addSystemLog(`${resultEmoji} ${player.name}: ${formatHand(player.hand)} = ${playerInfo} | ${payoutText} chips`);
    
    // Get player reaction
    store().setActivePlayer(player.id);
    const includeThought = Math.random() * 100 < store().thoughtProbability;
    const { system, user } = buildRoundEndPrompt(
      player,
      playerResult.won,
      playerResult.payout,
      dealerValue,
      includeThought,
    );
    
    const response = await callBlackjackAgent(player, system, user);
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
  const store = useBlackjackStore.getState();
  store.addLog({
    sender: 'system',
    content,
    type: 'system',
    phase: store.phase,
    roundCount: store.roundCount,
  });
}

async function addThought(playerName: string, content: string, expression?: string) {
  const store = useBlackjackStore.getState();
  store.addLog({
    sender: playerName,
    content,
    expression: expression as any,
    type: 'thought',
    phase: store.phase,
    roundCount: store.roundCount,
  });
  await speakTTS(content, true, getVoice(playerName));
}

async function addSpeech(playerName: string, content: string, expression?: string) {
  const store = useBlackjackStore.getState();
  store.addLog({
    sender: playerName,
    content,
    expression: expression as any,
    type: 'speech',
    phase: store.phase,
    roundCount: store.roundCount,
  });
  await speakTTS(content, false, getVoice(playerName));
}
