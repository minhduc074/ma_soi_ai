import { useGameStore } from '@/store/gameStore';
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
} from '@/lib/llm/agent';
import { AgentResponse, ChatMessage, Player, ROLE_INFO } from '@/lib/types';

/* helper: wait for `ms` milliseconds */
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* helper: find and cache the best Vietnamese voice */
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
  if (cachedViVoice) {
    console.log('[TTS] Using Vietnamese voice:', cachedViVoice.name, cachedViVoice.lang);
  } else {
    console.warn('[TTS] No Vietnamese voice found. Available voices:', voices.map((v) => `${v.name} (${v.lang})`).join(', '));
  }
  return cachedViVoice;
}

// Reset voice cache when voices list changes (loaded async on some browsers)
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedViVoice = undefined;
  };
}

/* helper: speak text via Web Speech API and wait for it to finish */
function speakTTS(text: string): Promise<void> {
  const { ttsEnabled } = useGameStore.getState();
  if (!ttsEnabled || typeof window === 'undefined' || !window.speechSynthesis) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'vi-VN';
    const voice = getVietnameseVoice();
    if (voice) u.voice = voice;
    u.rate = 1.25;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
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
export async function runGameLoop() {
  const store = useGameStore.getState;

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
    addSystemLog('☀️ Trời sáng. Đêm qua là một đêm bình yên – không ai bị giết!');
  } else {
    const names = deaths.map((id) => {
      const p = store().players.find((pl) => pl.id === id);
      if (!p) return id;
      return `${p.name} (${ROLE_INFO[p.role].emoji} ${ROLE_INFO[p.role].name})`;
    });
    addSystemLog(`☀️ Trời sáng. Đêm qua, ${names.join(' và ')} đã bị giết!`);

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

  // ---- Generate public summary for this day ----
  const summaryPlayer = store().players.find((p) => p.alive);
  let daySummary: string | null = null;
  if (summaryPlayer) {
    addSystemLog(`📰 Đang tóm tắt diễn biến ván đấu…`);
    const { system, user } = buildSummaryPrompt(
      store().logs,
      dayCount,
      store().players.filter((p) => !p.alive).map((p) => ({ name: p.name, role: ROLE_INFO[p.role].name })),
    );
    try {
      const summaryRes = await callAgent(summaryPlayer, system, user);
      // summary model returns plain text in speech field (no JSON action needed)
      daySummary = summaryRes.speech || summaryRes.thought || null;
    } catch {
      daySummary = null;
    }
    if (daySummary) {
      store().setDaySummary(daySummary);
      addSystemLog(`📰 Tóm tắt: ${daySummary}`);
    }
  }

  // ---- Discussion ----
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

  for (let i = 0; i < alivePlayers.length; i++) {
    if (!store().isRunning) return;
    const player = alivePlayers[i];

    store().setActivePlayer(player.id, true);

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
        getPlayerNightNotes(player.name),
        daySummary ?? undefined,
      );
      response = await callAgent(player, system, user);
    }

    await addThought(player.name, response.thought);
    await delay(600);

    store().setActivePlayer(player.id, false);
    await addSpeech(player.name, response.speech);

    // Start prefetching next player during visual delay
    const nextPlayer = alivePlayers[i + 1];
    if (nextPlayer && store().isRunning) {
      const { system, user } = buildDiscussionPrompt(
        nextPlayer,
        alivePlayers,
        store().logs,
        deathNames,
        dayCount,
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
    '🗳️ Phiên bỏ phiếu bắt đầu! Mỗi người hãy chọn ai sẽ bị treo cổ.',
  );
  await delay(store().speed);

  prefetchPromise = null;

  for (let i = 0; i < alivePlayers.length; i++) {
    if (!store().isRunning) return;
    const player = alivePlayers[i];

    store().setActivePlayer(player.id, true);

    let response: AgentResponse;
    if (prefetchPromise) {
      response = await prefetchPromise;
      prefetchPromise = null;
    } else {
      const { system, user } = buildVotePrompt(
        player,
        alivePlayers,
        store().logs,
        getPlayerNightNotes(player.name),
        daySummary ?? undefined,
      );
      response = await callAgent(player, system, user);
    }

    await addThought(player.name, response.thought);
    await delay(400);

    store().setActivePlayer(player.id, false);

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
        content: `Vote: ${target.name}`,
        type: 'vote',
        phase: 'day_voting',
        dayCount,
      });
      await addSpeech(
        player.name,
        response.speech || `Tôi vote cho ${target.name}.`,
      );
    } else {
      await addSpeech(player.name, response.speech || 'Tôi bỏ phiếu trắng.');
    }

    // Prefetch next voter
    const nextPlayer = alivePlayers[i + 1];
    if (nextPlayer && store().isRunning) {
      const { system, user } = buildVotePrompt(
        nextPlayer,
        alivePlayers,
        store().logs,
        getPlayerNightNotes(nextPlayer.name),
        daySummary ?? undefined,
      );
      prefetchPromise = callAgent(nextPlayer, system, user);
    }

    await delay(store().speed / 2);
    store().setActivePlayer(null);
  }

  // ---- Execution ----
  store().setPhase('day_execution');
  const eliminatedId = store().resolveVotes();

  if (eliminatedId) {
    const eliminated = store().players.find((p) => p.id === eliminatedId)!;
    addSystemLog(
      `⚖️ Kết quả bỏ phiếu: ${eliminated.name} bị treo cổ! Vai trò: ${ROLE_INFO[eliminated.role].emoji} ${ROLE_INFO[eliminated.role].name}`,
    );

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

    const { system, user } = buildWolfPrompt(
      wolf,
      alivePlayers,
      wolves,
      store().logs,
    );
    const response = await callAgent(wolf, system, user);

    await addThought(wolf.name, `[🐺 Sói] ${response.thought}`);
    await delay(400);

    addLog({
      sender: wolf.name,
      content: `[Sói thì thầm] ${response.speech}`,
      type: 'whisper',
      phase: 'night_wolf',
      dayCount: store().dayCount,
    });
    await speakTTS(`${wolf.name} thì thầm: ${response.speech}`);

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

  const alivePlayers = store().players.filter((p) => p.alive);
  const { system, user } = buildSeerPrompt(seer, alivePlayers, store().logs, []);
  const response = await callAgent(seer, system, user);

  await addThought(seer.name, `[🔮 Tiên tri] ${response.thought}`);

  if (response.action) {
    const target = findPlayerByName(
      response.action,
      alivePlayers.filter((p) => p.id !== seer.id),
    );
    if (target) {
      const result = target.role === 'werewolf' ? 'wolf' : 'village';
      store().setSeerTarget(target.id, result);
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

  const alivePlayers = store().players.filter((p) => p.alive);
  const { system, user } = buildGuardPrompt(
    guard,
    alivePlayers,
    store().lastGuardTarget,
  );
  const response = await callAgent(guard, system, user);

  await addThought(guard.name, `[🛡️ Bảo vệ] ${response.thought}`);

  if (response.action) {
    const target = findPlayerByName(response.action, alivePlayers);
    if (target && target.name !== store().lastGuardTarget) {
      store().setGuardTarget(target.id);
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
  );
  const response = await callAgent(witch, system, user);

  await addThought(witch.name, `[🧙 Phù thủy] ${response.thought}`);

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
      await addThought(witch.name, `[🧙] Đã dùng thuốc độc giết ${target.name}.`);
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
    `🏹 ${hunter.name} là Thợ Săn! Được phép bắn 1 người trước khi chết.`,
  );

  const alivePlayers = store().players.filter(
    (p) => p.alive && p.id !== hunter.id,
  );
  const { system, user } = buildHunterPrompt(hunter, alivePlayers);
  const response = await callAgent(hunter, system, user);

  await addThought(hunter.name, `[🏹 Thợ Săn] ${response.thought}`);

  if (response.action) {
    const target = findPlayerByName(response.action, alivePlayers);
    if (target) {
      store().killPlayer(target.id);
      addSystemLog(
        `🏹 ${hunter.name} đã bắn chết ${target.name}! (${ROLE_INFO[target.role].emoji} ${ROLE_INFO[target.role].name})`,
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
  await speakTTS(`${playerName} nghĩ: ${content}`);
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
  await speakTTS(`${playerName} nói: ${content}`);
}

function addLog(msg: Omit<ChatMessage, 'id' | 'timestamp'>) {
  useGameStore.getState().addLog(msg);
}
