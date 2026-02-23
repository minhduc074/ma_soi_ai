import { useGameStore } from '@/store/gameStore';
import { assignPlayerVoices, getVoice } from '@/lib/tts/voice';
import {
  callAgent,
  buildWolfPrompt,
  buildSeerPrompt,
  buildGuardPrompt,
  buildWitchPrompt,
  buildDiscussionPrompt,
  buildVotePrompt,
  buildHunterPrompt,
  buildSummaryPrompt,
  buildRebuttalPrompt,
  buildLastWordsPrompt,
} from '@/lib/llm/agent';
import { AgentResponse, ChatMessage, Player, ROLE_INFO } from '@/lib/types';

/* helper: background simulation mode flag */
let _backgroundMode = false;

/* helper: wait for `ms` milliseconds (skipped in background mode) */
const delay = (ms: number) => _backgroundMode ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));

/* helper: shuffle array (Fisher-Yates) */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* helper: find and cache the best Vietnamese voice */
const PIPER_TTS_URL = 'http://localhost:5500/tts';
let piperAvailable: boolean | null = null;

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
let cachedViVoice: SpeechSynthesisVoice | null | undefined; // undefined = not yet searched
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
  const { ttsEnabled, setIsSpeakingTTS, setIsThinkingTTS } = useGameStore.getState();
  if (!ttsEnabled || typeof window === 'undefined') return Promise.resolve();
  // Strip role/label prefixes like [🐺 Sói], [🔮 Kết quả soi], etc. and remove emojis
  const cleanText = text.replace(/^\[[^\]]+\]\s*/, '').replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]/gu, '').trim();
  if (!cleanText) return Promise.resolve();

  setIsSpeakingTTS(true);
  setIsThinkingTTS(isThought);

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
              src.onended = () => { setIsSpeakingTTS(false); setIsThinkingTTS(false); ctx.close(); resolve(); };
            });
          });
        })
        .catch(() => {
          piperAvailable = false;
          setIsSpeakingTTS(false);
          setIsThinkingTTS(false);
        });
    }

    if (!window.speechSynthesis) { setIsSpeakingTTS(false); setIsThinkingTTS(false); return; }
    return new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(cleanText);
      u.lang = 'vi-VN';
      const voice = getVietnameseVoice();
      if (voice) u.voice = voice;
      u.rate = 1.25;
      u.onend = () => { setIsSpeakingTTS(false); setIsThinkingTTS(false); resolve(); };
      u.onerror = () => { setIsSpeakingTTS(false); setIsThinkingTTS(false); resolve(); };
      window.speechSynthesis.speak(u);
    });
  });
}

/* helper: find player by name (fuzzy) */
function findPlayerByName(name: string, players: Player[]): Player | undefined {
  const lower = name.trim().toLowerCase();
  return (
    players.find((p) => p.name.toLowerCase() === lower) ??
    players.find((p) => lower.includes(p.name.toLowerCase())) ??
    players.find((p) => p.name.toLowerCase().includes(lower))
  );
}

/**
 * Collect a player's own private actions/knowledge from the current night phase.
 * These are included in day discussion/vote prompts so role players know what they did.
 */
function getPlayerNightNotes(playerName: string): string {
  const { logs, dayCount } = useGameStore.getState();
  const notes = logs
    .filter(
      (m) =>
        m.sender === playerName &&
        m.type === 'thought' &&
        m.phase.startsWith('night') &&
        m.dayCount === dayCount,
    )
    .map((m) => m.content.replace(/^\[.*?\]\s*/, '').trim())
    .filter(Boolean)
    .join('\n');
  return notes;
}

/* ------------------------------------------------------------------ */
/*  MAIN GAME LOOP                                                     */
/* ------------------------------------------------------------------ */
export async function runGameLoop(backgroundMode = false) {
  _backgroundMode = backgroundMode;
  const store = useGameStore.getState;

  if (backgroundMode) store().setSimulating(true);

  // Gán giọng cho từng nhân vật dựa theo tên
  await assignPlayerVoices(store().players);

  addSystemLog('🎮 Trò chơi Ma Sói bắt đầu! Đêm đầu tiên đang đến…');

  for (const p of store().players) {
    const ri = ROLE_INFO[p.role];
    await addThought(p.name, `Tôi được giao vai ${ri.emoji} ${ri.name}. ${ri.description}`);
  }

  await delay(store().speed);

  while (store().isRunning && !store().winner) {
    await nightPhase();
    if (checkEnd()) break;

    await dayPhase();
    if (checkEnd()) break;

    useGameStore.getState().nextDay();
  }

  _backgroundMode = false;
  if (backgroundMode) store().setSimulating(false);
}

/* ================================================================== */
/*  REPLAY LOOP — replays saved logs with TTS, respecting pause        */
/* ================================================================== */
export async function runReplay() {
  const store = useGameStore.getState;
  store().setReplaying(true);

  const delayMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  while (store().isReplaying && store().replayIndex < store().replayLogs.length) {
    const s = store();
    const log = s.replayLogs[s.replayIndex];

    // Append log & advance pointer
    store().set_replayStep(log);

    // Highlight active player
    if (log.sender !== 'system') {
      const player = store().players.find((p) => p.name === log.sender);
      if (player) {
        useGameStore.getState().setActivePlayer(player.id, log.type === 'whisper');
      }
    }

    // Speak with TTS (waits until done)
    if (log.type !== 'system' && log.type !== 'vote') {
      await speakTTS(log.content, log.type === 'thought');
    }

    // Handle deaths from system messages — match ONLY specific structured announcements
    // to avoid false-killing players when AI summaries mention names near "bị loại"
    if (log.type === 'system') {
      const players = store().players;

      // Night death:    "☀️ Trời sáng. Đêm qua, NAME (role) đã bị loại!"
      // Vote execution: "⚖️ NAME bị trục xuất! Vai trò: …"
      // Hunter kill:    "🏹 hunterName đã kéo theo TARGETNAME! (role)"
      const isNightDeath =
        log.content.includes('đã bị loại') &&
        (log.content.startsWith('☀️') || log.content.includes('Trời sáng'));
      const isVoteExecution =
        log.content.startsWith('⚖️') && log.content.includes('bị trục xuất');
      const isHunterKill =
        log.content.startsWith('🏹') && log.content.includes('kéo theo');

      if (isNightDeath || isVoteExecution || isHunterKill) {
        for (const p of players) {
          if (p.alive && log.content.includes(p.name)) {
            useGameStore.getState().killPlayer(p.id);
          }
        }
      }

      if (log.content.includes('THẮNG')) {
        if (log.content.includes('SÓI')) useGameStore.getState().setWinner('wolf');
        else if (log.content.includes('LÀNG')) useGameStore.getState().setWinner('village');
      }
    }

    // Delay based on message type
    const speed = store().speed;
    const waitTime =
      log.type === 'speech' ? speed :
      log.type === 'thought' ? speed * 0.6 :
      log.type === 'whisper' ? speed * 0.8 :
      log.type === 'vote'    ? speed * 0.25 :
      speed * 0.35; // system

    await delayMs(waitTime);
    useGameStore.getState().setActivePlayer(null);
  }

  store().setReplaying(false);
}

/* ================================================================== */
/*  NIGHT PHASE                                                        */
/* ================================================================== */
async function nightPhase() {
  const store = useGameStore.getState;
  store().resetNight();
  store().setPhase('night_start');
  addSystemLog(`🌙 Đêm ${store().dayCount} bắt đầu. Mọi người nhắm mắt…`);
  await delay(store().speed);

  store().setPhase('night_wolf');
  await wolfTurn();
  await delay(store().speed / 2);

  store().setPhase('night_seer');
  await seerTurn();
  await delay(store().speed / 2);

  store().setPhase('night_guard');
  await guardTurn();
  await delay(store().speed / 2);

  store().setPhase('night_witch');
  await witchTurn();
  await delay(store().speed / 2);

  const deaths = store().resolveNight();
  store().setPhase('day_announcement');

  if (deaths.length === 0) {
    addSystemLog('☀️ Trời sáng. Đêm qua là một đêm bình yên – không ai bị loại!');
  } else {
    const names = deaths.map((id) => {
      const p = store().players.find((pl) => pl.id === id);
      if (!p) return id;
      return `${p.name} (${ROLE_INFO[p.role].emoji} ${ROLE_INFO[p.role].name})`;
    });
    addSystemLog(`☀️ Trời sáng. Đêm qua, ${names.join(' và ')} đã bị loại!`);

    for (const id of deaths) {
      const p = store().players.find((pl) => pl.id === id);
      if (p && p.role === 'hunter') {
        await hunterShot(p);
      }
    }
  }

  await delay(store().speed);
}

/* ================================================================== */
/*  DAY PHASE (with API pipelining)                                    */
/* ================================================================== */
async function dayPhase() {
  const store = useGameStore.getState;
  const dayCount = store().dayCount;

  // ---- Generate public summary for this day (with vote history) ----
  const summaryPlayer = store().players.find((p) => p.alive);
  let daySummary: string | null = null;
  if (summaryPlayer) {
    addSystemLog(`📰 Đang tóm tắt diễn biến ván đấu…`);
    const { system, user } = buildSummaryPrompt(
      store().logs,
      dayCount,
      store().players.filter((p) => !p.alive).map((p) => ({ name: p.name, role: ROLE_INFO[p.role].name })),
      store().voteHistory,
      store().players,
    );
    try {
      const summaryRes = await callAgent(summaryPlayer, system, user);
      daySummary = summaryRes.speech || summaryRes.thought || null;
    } catch {
      daySummary = null;
    }
    if (daySummary) {
      store().setDaySummary(daySummary);
      addSystemLog(`📰 Tóm tắt: ${daySummary}`);
    }
  }

  // ---- Discussion Round 1 ----
  store().setPhase('day_discussion');
  addSystemLog(`💬 Ngày ${dayCount} – Phiên thảo luận bắt đầu.`);
  await delay(store().speed);

  const alivePlayers = store().players.filter((p) => p.alive);
  const deaths = store().nightResult.deaths;
  const deathNames = deaths.map(
    (id) => store().players.find((p) => p.id === id)?.name ?? id,
  );

  // Pipelined discussion: prefetch next player's API call during display delay
  let prefetchPromise: Promise<AgentResponse> | null = null;
  const discussionOrder = shuffle(alivePlayers);

  for (let i = 0; i < discussionOrder.length; i++) {
    if (!store().isRunning) return;
    const player = discussionOrder[i];

    store().setActivePlayer(player.id, true);
    const includeThought = Math.random() * 100 < store().thoughtProbability;

    let response: AgentResponse;
    if (prefetchPromise) {
      response = await prefetchPromise;
      prefetchPromise = null;
    } else {
      const { system, user } = buildDiscussionPrompt(
        player,
        alivePlayers,
        store().logs,
        deathNames,
        dayCount,
        includeThought,
        getPlayerNightNotes(player.name),
        daySummary ?? undefined,
      );
      response = await callAgent(player, system, user);
    }

    if (response.thought) {
      await addThought(player.name, response.thought);
      await delay(600);
    }

    store().setActivePlayer(player.id, false);
    if (response.expression) store().setPlayerExpression(player.name, response.expression);
    await addSpeech(player.name, response.speech);

    // Start prefetching next player during visual delay
    const nextPlayer = discussionOrder[i + 1];
    if (nextPlayer && store().isRunning) {
      const nextIncludeThought = Math.random() * 100 < store().thoughtProbability;
      const { system, user } = buildDiscussionPrompt(
        nextPlayer,
        alivePlayers,
        store().logs,
        deathNames,
        dayCount,
        nextIncludeThought,
        getPlayerNightNotes(nextPlayer.name),
        daySummary ?? undefined,
      );
      prefetchPromise = callAgent(nextPlayer, system, user);
    }

    await delay(store().speed);
    store().setActivePlayer(null);
  }

  // ---- Rebuttal Round (Round 2) ----
  store().setPhase('day_rebuttal');
  addSystemLog(`🔥 Phiên phản biện bắt đầu! Hãy đáp trả và tạo liên minh!`);
  await delay(store().speed);

  prefetchPromise = null;
  const rebuttalOrder = shuffle(alivePlayers);

  for (let i = 0; i < rebuttalOrder.length; i++) {
    if (!store().isRunning) return;
    const player = rebuttalOrder[i];

    store().setActivePlayer(player.id, true);
    const includeThought = Math.random() * 100 < store().thoughtProbability;

    let response: AgentResponse;
    if (prefetchPromise) {
      response = await prefetchPromise;
      prefetchPromise = null;
    } else {
      const { system, user } = buildRebuttalPrompt(
        player,
        alivePlayers,
        store().logs,
        dayCount,
        includeThought,
        getPlayerNightNotes(player.name),
        daySummary ?? undefined,
      );
      response = await callAgent(player, system, user);
    }

    if (response.thought) {
      await addThought(player.name, response.thought);
      await delay(600);
    }

    store().setActivePlayer(player.id, false);
    if (response.expression) store().setPlayerExpression(player.name, response.expression);
    await addSpeech(player.name, response.speech);

    // Prefetch next
    const nextPlayer = rebuttalOrder[i + 1];
    if (nextPlayer && store().isRunning) {
      const nextIncludeThought = Math.random() * 100 < store().thoughtProbability;
      const { system, user } = buildRebuttalPrompt(
        nextPlayer,
        alivePlayers,
        store().logs,
        dayCount,
        nextIncludeThought,
        getPlayerNightNotes(nextPlayer.name),
        daySummary ?? undefined,
      );
      prefetchPromise = callAgent(nextPlayer, system, user);
    }

    await delay(store().speed);
    store().setActivePlayer(null);
  }

  // ---- Voting ----
  store().setPhase('day_voting');
  store().resetVotes();
  addSystemLog(
    '🗳️ Phiên bỏ phiếu bắt đầu! Mỗi người hãy chọn ai sẽ bị trục xuất.',
  );
  await delay(store().speed);

  prefetchPromise = null;
  const voteOrder = shuffle(alivePlayers);

  for (let i = 0; i < voteOrder.length; i++) {
    if (!store().isRunning) return;
    const player = voteOrder[i];

    store().setActivePlayer(player.id, true);
    const includeThought = Math.random() * 100 < store().thoughtProbability;

    let response: AgentResponse;
    if (prefetchPromise) {
      response = await prefetchPromise;
      prefetchPromise = null;
    } else {
      const { system, user } = buildVotePrompt(
        player,
        alivePlayers,
        store().logs,
        includeThought,
        getPlayerNightNotes(player.name),
      );
      response = await callAgent(player, system, user);
    }

    if (response.thought) {
      await addThought(player.name, response.thought);
      await delay(400);
    }

    store().setActivePlayer(player.id, false);
    if (response.expression) store().setPlayerExpression(player.name, response.expression);

    const targetName = response.action?.trim();
    const target = targetName
      ? findPlayerByName(
          targetName,
          alivePlayers.filter((p) => p.id !== player.id),
        )
      : null;

    if (target) {
      store().castVote(player.id, target.id);
      addLog({
        sender: player.name,
        content: `Chọn ${target.name}`,
        type: 'vote',
        phase: 'day_voting',
        dayCount,
      });
      if (response.speech) {
        await addSpeech(player.name, response.speech);
      } else {
        await speakTTS(`Tôi chọn ${target.name}.`);
      }
    } else {
      if (response.speech) {
        await addSpeech(player.name, response.speech);
      } else {
        await speakTTS('Tôi bỏ phiếu trắng.');
      }
    }

    // Prefetch next voter
    const nextPlayer = voteOrder[i + 1];
    if (nextPlayer && store().isRunning) {
      const nextIncludeThought = Math.random() * 100 < store().thoughtProbability;
      const { system, user } = buildVotePrompt(
        nextPlayer,
        alivePlayers,
        store().logs,
        nextIncludeThought,
        getPlayerNightNotes(nextPlayer.name),
      );
      prefetchPromise = callAgent(nextPlayer, system, user);
    }

    await delay(store().speed / 2);
    store().setActivePlayer(null);
  }

  // ---- Record vote history ----
  store().addVoteRecord({
    dayCount,
    votes: { ...store().votes },
    eliminated: null, // will be set after resolveVotes
    nightDeaths: [...deaths],
  });

  // ---- Execution ----
  store().setPhase('day_execution');
  const eliminatedId = store().resolveVotes();

  // Update vote record with elimination result
  const currentVoteHistory = store().voteHistory;
  if (currentVoteHistory.length > 0) {
    const lastRecord = currentVoteHistory[currentVoteHistory.length - 1];
    lastRecord.eliminated = eliminatedId;
  }

  if (eliminatedId) {
    const eliminated = store().players.find((p) => p.id === eliminatedId)!;

    // Show vote tally
    const tally: Record<string, number> = {};
    for (const targetId of Object.values(store().votes)) {
      tally[targetId] = (tally[targetId] || 0) + 1;
    }
    const tallyStr = Object.entries(tally)
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => {
        const p = store().players.find((pl) => pl.id === id);
        return `${p?.name ?? id}: ${count} phiếu`;
      })
      .join(', ');
    addSystemLog(`📊 Kết quả phiếu: ${tallyStr}`);

    addSystemLog(
      `⚖️ ${eliminated.name} bị trục xuất! Vai trò: ${ROLE_INFO[eliminated.role].emoji} ${ROLE_INFO[eliminated.role].name}`,
    );

    // ---- Last Words ----
    store().setPhase('day_last_words');
    store().setActivePlayer(eliminated.id, true);
    addSystemLog(`🪦 ${eliminated.name} được nói lời cuối cùng…`);

    const includeThought = Math.random() * 100 < store().thoughtProbability;
    const { system: lwSystem, user: lwUser } = buildLastWordsPrompt(
      eliminated,
      alivePlayers.filter((p) => p.id !== eliminated.id),
      store().logs,
      includeThought,
    );
    const lwResponse = await callAgent(eliminated, lwSystem, lwUser);
    if (lwResponse.thought) {
      await addThought(eliminated.name, `[💀 Lời cuối] ${lwResponse.thought}`);
      await delay(400);
    }
    await addSpeech(eliminated.name, `[🪦 Lời cuối] ${lwResponse.speech}`);
    store().setActivePlayer(null);
    await delay(store().speed);

    if (eliminated.role === 'hunter') {
      await hunterShot(eliminated);
    }
  } else {
    addSystemLog('⚖️ Kết quả bỏ phiếu: Hòa! Không ai bị loại.');
  }

  await delay(store().speed);
}

/* ================================================================== */
/*  Individual role turns (with active player tracking)                */
/* ================================================================== */

async function wolfTurn() {
  const store = useGameStore.getState;
  const wolves = store().players.filter(
    (p) => p.role === 'werewolf' && p.alive,
  );
  const alivePlayers = store().players.filter((p) => p.alive);

  if (wolves.length === 0) return;

  addSystemLog('🐺 Bầy sói thức dậy…');

  const wolfVotes: Record<string, number> = {};

  for (const wolf of wolves) {
    store().setActivePlayer(wolf.id, true);
    const includeThought = Math.random() * 100 < store().thoughtProbability;

    const { system, user } = buildWolfPrompt(
      wolf,
      alivePlayers,
      wolves,
      store().logs,
      includeThought,
    );
    const response = await callAgent(wolf, system, user);

    if (response.thought) {
      await addThought(wolf.name, `[🐺 Sói] ${response.thought}`);
      await delay(400);
    }

    addLog({
      sender: wolf.name,
      content: `[Sói thì thầm] ${response.speech}`,
      type: 'whisper',
      phase: 'night_wolf',
      dayCount: store().dayCount,
    });
    await speakTTS(response.speech);

    if (response.action) {
      const target = findPlayerByName(
        response.action,
        alivePlayers.filter((p) => p.role !== 'werewolf'),
      );
      if (target) {
        wolfVotes[target.id] = (wolfVotes[target.id] || 0) + 1;
      }
    }

    await delay(store().speed / 3);
    store().setActivePlayer(null);
  }

  if (Object.keys(wolfVotes).length > 0) {
    const sorted = Object.entries(wolfVotes).sort((a, b) => b[1] - a[1]);
    const chosenTarget = sorted[0][0];
    store().setWolfTarget(chosenTarget);
    const targetPlayer = store().players.find((p) => p.id === chosenTarget);
    addSystemLog(`🐺 Bầy sói đã chọn mục tiêu: ${targetPlayer?.name}`);
  }
}

async function seerTurn() {
  const store = useGameStore.getState;
  const seer = store().players.find((p) => p.role === 'seer' && p.alive);
  if (!seer) return;

  addSystemLog('🔮 Tiên tri thức dậy…');
  store().setActivePlayer(seer.id, true);
  const includeThought = Math.random() * 100 < store().thoughtProbability;

  const alivePlayers = store().players.filter((p) => p.alive);
  const { system, user } = buildSeerPrompt(
    seer,
    alivePlayers,
    store().logs,
    store().seerHistory.map((h) => ({ target: h.targetName, result: h.result === 'wolf' ? '🐺 Sói' : '👤 Dân làng', day: h.day })),
    includeThought,
  );
  const response = await callAgent(seer, system, user);

  if (response.thought) {
    await addThought(seer.name, `[🔮 Tiên tri] ${response.thought}`);
  }

  if (response.action) {
    const target = findPlayerByName(
      response.action,
      alivePlayers.filter((p) => p.id !== seer.id),
    );
    if (target) {
      const result = target.role === 'werewolf' ? 'wolf' : 'village';
      store().setSeerTarget(target.id, result);
      store().addSeerHistory({ targetName: target.name, result, day: store().dayCount });
      await delay(400);
      await addThought(
        seer.name,
        `[🔮 Kết quả soi] ${target.name} là ${result === 'wolf' ? '🐺 SÓI!' : '👤 Dân làng.'}`,
      );
    }
  }

  store().setActivePlayer(null);
}

async function guardTurn() {
  const store = useGameStore.getState;
  const guard = store().players.find((p) => p.role === 'guard' && p.alive);
  if (!guard) return;

  addSystemLog('🛡️ Bảo vệ thức dậy…');
  store().setActivePlayer(guard.id, true);
  const includeThought = Math.random() * 100 < store().thoughtProbability;

  const alivePlayers = store().players.filter((p) => p.alive);
  const { system, user } = buildGuardPrompt(
    guard,
    alivePlayers,
    store().lastGuardTarget,
    includeThought,
  );
  const response = await callAgent(guard, system, user);

  if (response.thought) {
    await addThought(guard.name, `[🛡️ Bảo vệ] ${response.thought}`);
  }

  if (response.action) {
    const target = findPlayerByName(response.action, alivePlayers);
    if (target && target.name !== store().lastGuardTarget) {
      store().setGuardTarget(target.id, target.name);
      await delay(400);
      await addThought(guard.name, `[🛡️] Đã bảo vệ ${target.name}.`);
    }
  }

  store().setActivePlayer(null);
}

async function witchTurn() {
  const store = useGameStore.getState;
  const witch = store().players.find((p) => p.role === 'witch' && p.alive);
  if (!witch) return;

  addSystemLog('🧙 Phù thủy thức dậy…');
  store().setActivePlayer(witch.id, true);
  const includeThought = Math.random() * 100 < store().thoughtProbability;

  const alivePlayers = store().players.filter((p) => p.alive);
  const wolfTargetId = store().nightResult.wolfTarget;
  const wolfTargetName = wolfTargetId
    ? (store().players.find((p) => p.id === wolfTargetId)?.name ?? null)
    : null;

  const { system, user } = buildWitchPrompt(
    witch,
    alivePlayers,
    wolfTargetName,
    store().witchHasHeal,
    store().witchHasPoison,
    includeThought,
  );
  const response = await callAgent(witch, system, user);

  if (response.thought) {
    await addThought(witch.name, `[🧙 Phù thủy] ${response.thought}`);
  }

  const action = response.action?.trim().toLowerCase() ?? '';

  if (action === 'save' && store().witchHasHeal && wolfTargetId) {
    store().setWitchSave(true);
    await delay(400);
    await addThought(witch.name, `[🧙] Đã dùng thuốc cứu để cứu ${wolfTargetName}.`);
  } else if (action.startsWith('poison:') && store().witchHasPoison) {
    const targetName = action.replace('poison:', '').trim();
    const target = findPlayerByName(
      targetName,
      alivePlayers.filter((p) => p.id !== witch.id),
    );
    if (target) {
      store().setWitchKill(target.id);
      await delay(400);
      await addThought(witch.name, `[🧙] Đã dùng bình loại bỏ lên ${target.name}.`);
    }
  } else {
    await addThought(witch.name, '[🧙] Không dùng thuốc đêm nay.');
  }

  store().setActivePlayer(null);
}

async function hunterShot(hunter: Player) {
  const store = useGameStore.getState;
  store().setPhase('hunter_shot');
  store().setActivePlayer(hunter.id, true);

  addSystemLog(
    `🏹 ${hunter.name} là Thợ Săn! Được phép kéo theo 1 người trước khi bị loại.`,
  );

  const includeThought = Math.random() * 100 < store().thoughtProbability;
  const alivePlayers = store().players.filter(
    (p) => p.alive && p.id !== hunter.id,
  );
  const { system, user } = buildHunterPrompt(hunter, alivePlayers, includeThought);
  const response = await callAgent(hunter, system, user);

  if (response.thought) {
    await addThought(hunter.name, `[🏹 Thợ Săn] ${response.thought}`);
  }

  if (response.action) {
    const target = findPlayerByName(response.action, alivePlayers);
    if (target) {
      store().killPlayer(target.id);
      addSystemLog(
        `🏹 ${hunter.name} đã kéo theo ${target.name}! (${ROLE_INFO[target.role].emoji} ${ROLE_INFO[target.role].name})`,
      );
    }
  }

  store().setActivePlayer(null);
  await delay(store().speed);
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function checkEnd(): boolean {
  const store = useGameStore.getState;
  const result = store().checkWinCondition();
  if (result) {
    store().setWinner(result);
    if (result === 'wolf') {
      addSystemLog('🐺 BẦY SÓI THẮNG! Sói đã thống trị ngôi làng.');
    } else {
      addSystemLog('👥 DÂN LÀNG THẮNG! Tất cả sói đã bị loại.');
    }
    return true;
  }
  return false;
}

function addSystemLog(content: string) {
  const store = useGameStore.getState();
  store.addLog({
    sender: 'system',
    content,
    type: 'system',
    phase: store.phase,
    dayCount: store.dayCount,
  });
}

async function addThought(playerName: string, content: string) {
  const store = useGameStore.getState();
  store.addLog({
    sender: playerName,
    content,
    type: 'thought',
    phase: store.phase,
    dayCount: store.dayCount,
  });
  await speakTTS(content, true, getVoice(playerName));
}

async function addSpeech(playerName: string, content: string) {
  const store = useGameStore.getState();
  store.addLog({
    sender: playerName,
    content,
    type: 'speech',
    phase: store.phase,
    dayCount: store.dayCount,
  });
  await speakTTS(content, false, getVoice(playerName));
}

function addLog(msg: Omit<ChatMessage, 'id' | 'timestamp'>) {
  useGameStore.getState().addLog(msg);
}
