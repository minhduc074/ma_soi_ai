import { useCaroStore } from '@/store/caroStore';
import { assignPlayerVoices, getVoice } from '@/lib/tts/voice';
import { buildCaroMovePrompt, buildCaroRetryPrompt, callCaroAgent } from './agent';
import { parseMove, formatMove, getStrategicMoves, CaroMove, CaroPlayer } from './types';

/* helper: background simulation mode flag */
let _backgroundMode = false;

/* helper: wait for `ms` milliseconds (skipped in background mode) */
const delay = (ms: number) =>
  _backgroundMode ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));

/* helper: TTS URL */
const PIPER_TTS_URL = 'http://localhost:5500/tts';
let piperAvailable: boolean | null = null;

async function checkPiper(): Promise<boolean> {
  if (piperAvailable !== null) return piperAvailable;
  try {
    const r = await fetch('http://localhost:5500/health', {
      signal: AbortSignal.timeout(800),
    });
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
  window.speechSynthesis.onvoiceschanged = () => {
    cachedViVoice = undefined;
  };
}

/* helper: speak text — Piper TTS if available, fallback Web Speech API */
async function speakTTS(
  text: string,
  isThought = false,
  voice?: string
): Promise<void> {
  if (_backgroundMode) return;
  const { ttsEnabled } = useCaroStore.getState();
  if (!ttsEnabled || typeof window === 'undefined') return;

  const cleanText = text
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]/gu, '')
    .trim();
  if (!cleanText) return;

  const hasPiper = await checkPiper();
  if (hasPiper) {
    try {
      const r = await fetch(PIPER_TTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText, voice }),
      });
      const buf = await r.arrayBuffer();
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(buf);
      const src = ctx.createBufferSource();
      src.buffer = decoded;
      src.connect(ctx.destination);
      src.start();
      await new Promise<void>((resolve) => {
        src.onended = () => {
          ctx.close();
          resolve();
        };
      });
    } catch {
      piperAvailable = false;
    }
    return;
  }

  if (!window.speechSynthesis) return;
  return new Promise<void>((resolve) => {
    const u = new SpeechSynthesisUtterance(cleanText);
    u.lang = 'vi-VN';
    const v = getVietnameseVoice();
    if (v) u.voice = v;
    u.rate = 1.25;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

/* ------------------------------------------------------------------ */
/*  MAIN GAME LOOP                                                     */
/* ------------------------------------------------------------------ */
export async function runCaroLoop(backgroundMode = false) {
  _backgroundMode = backgroundMode;
  const store = useCaroStore.getState;

  if (backgroundMode) store().setSimulating(true);

  const players = store().players;
  if (!players) return;

  // Assign voices
  await assignPlayerVoices(players);

  addSystemLog('🎮 Ván Caro bắt đầu! Người chơi X đi trước.');
  await delay(store().speed);

  while (store().isRunning && !store().winner) {
    const currentColor = store().currentPlayer;
    const currentPlayer = players.find((p) => p.color === currentColor);
    if (!currentPlayer) break;

    // Check if human or AI
    if (currentPlayer.isHuman && store().gameMode === 'human_vs_ai') {
      // Wait for human move (handled by UI)
      addSystemLog(`⏳ Đợi ${currentPlayer.name} (${currentColor}) đi...`);
      
      // Poll until move is made or game stops
      const startMoveCount = store().moveHistory.length;
      while (
        store().isRunning &&
        store().moveHistory.length === startMoveCount &&
        !store().winner
      ) {
        await delay(100);
      }
    } else {
      // AI turn
      await aiTurn(currentPlayer);
    }

    await delay(store().speed / 2);
  }

  // Game ended
  const winner = store().winner;
  if (winner === 'draw') {
    addSystemLog('🤝 Ván cờ kết thúc HÒA!');
  } else if (winner) {
    const winningPlayer = players.find((p) => p.color === winner);
    addSystemLog(`🏆 ${winningPlayer?.name ?? winner} THẮNG với 5 quân liên tiếp!`);
  }

  _backgroundMode = false;
  if (backgroundMode) store().setSimulating(false);
}

/* ------------------------------------------------------------------ */
/*  AI TURN                                                            */
/* ------------------------------------------------------------------ */
async function aiTurn(player: CaroPlayer) {
  const store = useCaroStore.getState;

  store().setActivePlayer(player.id);
  const includeThought = Math.random() * 100 < store().thoughtProbability;

  const { system, user } = buildCaroMovePrompt(
    player,
    store().board,
    store().moveHistory,
    store().lastMove,
    includeThought
  );

  const response = await callCaroAgent(player, system, user, includeThought);

  // Show thought
  if (response.thought) {
    await addThought(player.name, response.thought);
    await delay(400);
  }

  // Update expression
  if (response.expression) {
    store().setPlayerExpression(player.id, response.expression);
  }

  // Parse and execute move
  const parsed = parseMove(response.action);
  const success = parsed ? store().makeMove(parsed.row, parsed.col) : false;
  if (success && parsed) {
    const move: CaroMove = { row: parsed.row, col: parsed.col, player: player.color };
    addSystemLog(`${player.color === 'X' ? '❌' : '⭕'} ${player.name} đi: ${formatMove(move)}`);
    await addSpeech(player.name, response.speech);
  } else {
    // Retry once with a focused prompt showing only valid cells
    const badAction = response.action || '?';
    addSystemLog(`⚠️ ${player.name} chọn ô "${badAction}" không hợp lệ, thử lại...`);
    const { system: rs, user: ru } = buildCaroMovePrompt(
      player,
      store().board,
      store().moveHistory,
      store().lastMove,
      false
    );
    const retry = await callCaroAgent(player, rs, ru, false);
    const rParsed = parseMove(retry.action);
    const rSuccess = rParsed ? store().makeMove(rParsed.row, rParsed.col) : false;
    if (rSuccess && rParsed) {
      const move: CaroMove = { row: rParsed.row, col: rParsed.col, player: player.color };
      addSystemLog(`${player.color === 'X' ? '❌' : '⭕'} ${player.name} đi: ${formatMove(move)}`);
      await addSpeech(player.name, retry.speech || response.speech);
    } else {
      // Final fallback: best strategic move
      makeBestFallbackMove(player);
    }
  }

  store().setActivePlayer(null);
}

function makeBestFallbackMove(player: { color: 'X' | 'O'; name: string }) {
  const store = useCaroStore.getState;
  const board = store().board;

  const strategic = getStrategicMoves(board);
  const cell = strategic[0] ?? null;

  if (cell) {
    store().makeMove(cell.row, cell.col);
    const move: CaroMove = { row: cell.row, col: cell.col, player: player.color };
    addSystemLog(`⚠️ ${player.name} vẫn không hợp lệ, tự chọn nước tốt nhất.`);
    addSystemLog(`${player.color === 'X' ? '❌' : '⭕'} ${player.name} đi: ${formatMove(move)}`);
  }
}

/* ------------------------------------------------------------------ */
/*  HELPERS                                                            */
/* ------------------------------------------------------------------ */
function addSystemLog(content: string) {
  const store = useCaroStore.getState();
  store.addLog({
    sender: 'system',
    content,
    type: 'system',
    moveNumber: store.moveHistory.length,
  });
}

async function addThought(playerName: string, content: string) {
  const store = useCaroStore.getState();
  store.addLog({
    sender: playerName,
    content: `[💭] ${content}`,
    type: 'thought',
    moveNumber: store.moveHistory.length,
  });
  await speakTTS(content, true, getVoice(playerName));
}

async function addSpeech(playerName: string, content: string) {
  const store = useCaroStore.getState();
  store.addLog({
    sender: playerName,
    content,
    type: 'speech',
    moveNumber: store.moveHistory.length,
  });
  await speakTTS(content, false, getVoice(playerName));
}
