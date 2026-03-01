import { useChessStore } from '@/store/chessStore';
import { assignPlayerVoices, getVoice } from '@/lib/tts/voice';
import { buildChessMovePrompt, callChessAgent } from './agent';
import { parseAiMove, ChessPlayer, PIECE_NAMES } from './types';

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
  const { ttsEnabled } = useChessStore.getState();
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
export async function runChessLoop(backgroundMode = false) {
  _backgroundMode = backgroundMode;
  const store = useChessStore.getState;

  if (backgroundMode) store().setSimulating(true);

  const players = store().players;
  const chess = store().chess;
  if (!players || !chess) return;

  // Assign voices
  await assignPlayerVoices(players);

  addSystemLog('♟️ Ván Cờ Vua bắt đầu! Trắng đi trước.');
  await delay(store().speed);

  while (store().isRunning && !store().winner) {
    const currentTurn = store().currentTurn;
    const currentPlayer = players.find(
      (p) => p.color === (currentTurn === 'w' ? 'white' : 'black')
    );
    if (!currentPlayer) break;

    // Check if human or AI
    if (currentPlayer.isHuman && store().gameMode === 'human_vs_ai') {
      addSystemLog(`⏳ Đợi ${currentPlayer.name} (${currentPlayer.color === 'white' ? 'Trắng' : 'Đen'}) đi...`);
      
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

    // Check for check
    const chessInstance = store().chess;
    if (chessInstance && chessInstance.isCheck() && !store().winner) {
      const checkedColor = chessInstance.turn() === 'w' ? 'Trắng' : 'Đen';
      addSystemLog(`⚠️ Chiếu! Vua ${checkedColor} đang bị đe dọa.`);
    }

    await delay(store().speed / 2);
  }

  // Game ended
  const winner = store().winner;
  const winningPlayer = winner && winner !== 'draw' 
    ? players.find((p) => p.color === winner)
    : null;

  if (winner === 'draw') {
    addSystemLog('🤝 Ván cờ kết thúc HÒA!');
  } else if (winningPlayer) {
    addSystemLog(`🏆 ${winningPlayer.name} (${winner === 'white' ? 'Trắng' : 'Đen'}) CHIẾN THẮNG!`);
  }

  _backgroundMode = false;
  if (backgroundMode) store().setSimulating(false);
}

/* ------------------------------------------------------------------ */
/*  AI TURN                                                            */
/* ------------------------------------------------------------------ */
async function aiTurn(player: ChessPlayer) {
  const store = useChessStore.getState;
  const chess = store().chess;
  if (!chess) return;

  store().setActivePlayer(player.id);
  const includeThought = Math.random() * 100 < store().thoughtProbability;

  const { system, user } = buildChessMovePrompt(
    player,
    chess,
    store().moveHistory,
    includeThought
  );

  const response = await callChessAgent(player, system, user, includeThought);

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
  const move = parseAiMove(response.action, chess);
  if (move) {
    const result = store().makeMoveFromNotation(move.san);
    if (result) {
      const pieceVi = PIECE_NAMES[result.piece].vi;
      const captureText = result.captured
        ? ` ăn ${PIECE_NAMES[result.captured].vi}`
        : '';
      addSystemLog(
        `${player.color === 'white' ? '⬜' : '⬛'} ${player.name}: ${pieceVi} ${result.san}${captureText}`
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

function makeRandomMove(player: ChessPlayer) {
  const store = useChessStore.getState;
  const chess = store().chess;
  if (!chess) return;

  const moves = chess.moves({ verbose: true });
  if (moves.length > 0) {
    const randomMove = moves[Math.floor(Math.random() * moves.length)];
    const result = store().makeMove(randomMove.from, randomMove.to, randomMove.promotion);
    if (result) {
      const pieceVi = PIECE_NAMES[result.piece].vi;
      addSystemLog(
        `${player.color === 'white' ? '⬜' : '⬛'} ${player.name}: ${pieceVi} ${result.san}`
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/*  HELPERS                                                            */
/* ------------------------------------------------------------------ */
function addSystemLog(content: string) {
  const store = useChessStore.getState();
  store.addLog({
    sender: 'system',
    content,
    type: 'system',
    moveNumber: store.moveHistory.length,
  });
}

async function addThought(playerName: string, content: string) {
  const store = useChessStore.getState();
  store.addLog({
    sender: playerName,
    content: `[💭] ${content}`,
    type: 'thought',
    moveNumber: store.moveHistory.length,
  });
  await speakTTS(content, true, getVoice(playerName));
}

async function addSpeech(playerName: string, content: string) {
  const store = useChessStore.getState();
  store.addLog({
    sender: playerName,
    content,
    type: 'speech',
    moveNumber: store.moveHistory.length,
  });
  await speakTTS(content, false, getVoice(playerName));
}
