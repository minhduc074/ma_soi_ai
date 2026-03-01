import { useXiangqiStore } from '@/store/xiangqiStore';
import { assignPlayerVoices, getVoice } from '@/lib/tts/voice';
import { buildXiangqiMovePrompt, callXiangqiAgent } from './agent';
import { parseMove, formatMove, XiangqiPlayer, PIECE_NAMES } from './types';

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

async function speakTTS(
  text: string,
  isThought = false,
  voice?: string
): Promise<void> {
  if (_backgroundMode) return;
  const { ttsEnabled } = useXiangqiStore.getState();
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
export async function runXiangqiLoop(backgroundMode = false) {
  _backgroundMode = backgroundMode;
  const store = useXiangqiStore.getState;

  if (backgroundMode) store().setSimulating(true);

  const players = store().players;
  if (!players) return;

  // Assign voices
  await assignPlayerVoices(players);

  addSystemLog('🏯 Ván Cờ Tướng bắt đầu! Đỏ đi trước.');
  await delay(store().speed);

  let moveCount = 0;
  const maxMoves = 200; // Prevent infinite games

  while (store().isRunning && !store().winner && moveCount < maxMoves) {
    const currentTurn = store().currentTurn;
    const currentPlayer = players.find((p) => p.color === currentTurn);
    if (!currentPlayer) break;

    // Check if human or AI
    if (currentPlayer.isHuman && store().gameMode === 'human_vs_ai') {
      addSystemLog(`⏳ Đợi ${currentPlayer.name} (${currentTurn === 'red' ? 'Đỏ' : 'Đen'}) đi...`);
      
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

    moveCount++;
    await delay(store().speed / 2);
  }

  // Game ended
  const winner = store().winner;
  const winningPlayer = winner && winner !== 'draw'
    ? players.find((p) => p.color === winner)
    : null;

  if (winner === 'draw' || moveCount >= maxMoves) {
    addSystemLog('🤝 Ván cờ kết thúc HÒA!');
  } else if (winningPlayer) {
    addSystemLog(`🏆 ${winningPlayer.name} (${winner === 'red' ? 'Đỏ' : 'Đen'}) CHIẾN THẮNG!`);
  }

  _backgroundMode = false;
  if (backgroundMode) store().setSimulating(false);
}

/* ------------------------------------------------------------------ */
/*  AI TURN                                                            */
/* ------------------------------------------------------------------ */
async function aiTurn(player: XiangqiPlayer) {
  const store = useXiangqiStore.getState;

  store().setActivePlayer(player.id);
  const includeThought = Math.random() * 100 < store().thoughtProbability;

  const { system, user } = buildXiangqiMovePrompt(
    player,
    store().board,
    store().moveHistory,
    store().lastMove,
    includeThought
  );

  const response = await callXiangqiAgent(player, system, user, includeThought);

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
  if (parsed) {
    const result = store().makeMove(parsed.from, parsed.to);
    if (result) {
      const pieceVi = PIECE_NAMES[result.piece.type].vi;
      const captureText = result.captured
        ? ` ăn ${PIECE_NAMES[result.captured.type].vi}`
        : '';
      addSystemLog(
        `${player.color === 'red' ? '🔴' : '⚫'} ${player.name}: ${pieceVi} ${formatMove(result)}${captureText}`
      );
      await addSpeech(player.name, response.speech);
    } else {
      addSystemLog(`⚠️ ${player.name} chọn nước không hợp lệ, đi ngẫu nhiên.`);
      makeRandomMove(player);
    }
  } else {
    addSystemLog(`⚠️ ${player.name} không chọn được nước đi, đi ngẫu nhiên.`);
    makeRandomMove(player);
  }

  store().setActivePlayer(null);
}

function makeRandomMove(player: XiangqiPlayer) {
  const store = useXiangqiStore.getState;
  const board = store().board;

  // Find all pieces of current player and their potential destinations
  const moves: Array<{ from: { row: number; col: number }; to: { row: number; col: number } }> = [];

  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const piece = board[r][c];
      if (!piece || piece.color !== player.color) continue;

      // Simple move generation: try adjacent squares
      const directions = [
        [-1, 0], [1, 0], [0, -1], [0, 1],
        [-1, -1], [-1, 1], [1, -1], [1, 1],
        [-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1], // Horse
      ];

      for (const [dr, dc] of directions) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= 10 || nc < 0 || nc >= 9) continue;
        const target = board[nr][nc];
        if (target && target.color === player.color) continue;
        moves.push({ from: { row: r, col: c }, to: { row: nr, col: nc } });
      }
    }
  }

  // Try random moves until one succeeds
  const shuffled = moves.sort(() => Math.random() - 0.5);
  for (const move of shuffled) {
    const result = store().makeMove(move.from, move.to);
    if (result) {
      const pieceVi = PIECE_NAMES[result.piece.type].vi;
      addSystemLog(
        `${player.color === 'red' ? '🔴' : '⚫'} ${player.name}: ${pieceVi} ${formatMove(result)}`
      );
      return;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  HELPERS                                                            */
/* ------------------------------------------------------------------ */
function addSystemLog(content: string) {
  const store = useXiangqiStore.getState();
  store.addLog({
    sender: 'system',
    content,
    type: 'system',
    moveNumber: store.moveHistory.length,
  });
}

async function addThought(playerName: string, content: string) {
  const store = useXiangqiStore.getState();
  store.addLog({
    sender: playerName,
    content: `[💭] ${content}`,
    type: 'thought',
    moveNumber: store.moveHistory.length,
  });
  await speakTTS(content, true, getVoice(playerName));
}

async function addSpeech(playerName: string, content: string) {
  const store = useXiangqiStore.getState();
  store.addLog({
    sender: playerName,
    content,
    type: 'speech',
    moveNumber: store.moveHistory.length,
  });
  await speakTTS(content, false, getVoice(playerName));
}
