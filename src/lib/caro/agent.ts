import { useCaroStore } from '@/store/caroStore';
import {
  CaroPlayer,
  CaroAgentResponse,
  CaroBoard,
  CaroMove,
  MoveRecord,
  getStrategicMoves,
  BOARD_SIZE,
} from '@/lib/caro/types';
import { EXPRESSIONS } from '@/lib/boardgame/types';

// ==================== API CALL ====================
async function fetchAgent(
  player: CaroPlayer,
  systemPrompt: string,
  userPrompt: string
): Promise<CaroAgentResponse> {
  try {
    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: player.provider,
        model: player.model,
        baseUrl: player.baseUrl,
        systemPrompt,
        userPrompt,
      }),
    });

    if (!res.ok) {
      console.error(`Agent API error for ${player.name}:`, await res.text());
      return { thought: '', speech: 'Tôi đi nước này.', action: '', expression: '🤔' };
    }

    const data = (await res.json()) as CaroAgentResponse;

    // Validate response
    if (!data.expression || !EXPRESSIONS.includes(data.expression as typeof EXPRESSIONS[number])) {
      data.expression = '🤔';
    }

    return data;
  } catch (err) {
    console.error(`Agent fetch failed for ${player.name}:`, err);
    return { thought: '', speech: 'Có lỗi xảy ra.', action: '', expression: '😱' };
  }
}

// ==================== BASE SYSTEM PROMPT ====================
function baseSystemPrompt(player: CaroPlayer, includeThought: boolean): string {
  const personalityPrompt = player.personality
    ? `\nTÍNH CÁCH CỦA BẠN: ${player.personality}`
    : '';

  return `Bạn đang chơi Caro (Gomoku). Tên: "${player.name}". Quân: ${player.color}.${personalityPrompt}

LUẬT: Bàn ${BOARD_SIZE}x${BOARD_SIZE}. Đặt quân vào ô trống. 5 quân liên tiếp (ngang/dọc/chéo) thắng. Tấn công và phòng thủ.

OUTPUT: CHỈ trả lời đúng JSON, KHÔNG thêm gì khác:
${includeThought ? '{"thought":"...","speech":"...","action":"row,col","expression":"😎"}' : '{"speech":"...","action":"row,col","expression":"😎"}'}
- "action": Tọa độ dạng "hàng,cột" (số nguyên 0-${BOARD_SIZE - 1}), PHẢI là ô TRỐNG trên bàn cờ.
${includeThought ? '- "thought": 1 câu suy nghĩ ngắn.' : ''}
- "speech": Tối đa 8 từ.
- "expression": Một trong: ${EXPRESSIONS.join(' ')}`;
}

// ==================== MOVE PROMPT ====================
export function buildCaroMovePrompt(
  player: CaroPlayer,
  board: CaroBoard,
  moveHistory: MoveRecord[],
  lastMove: CaroMove | null,
  includeThought: boolean
): { system: string; user: string } {
  const system = baseSystemPrompt(player, includeThought);

  // Build board with NUMERIC row,col labels that match the action format exactly
  // so the AI can directly read coordinates from the board display.
  const colHeader = '    ' + Array.from({ length: BOARD_SIZE }, (_, i) => String(i).padStart(3)).join('');
  const boardRows = board.map((row, r) =>
    String(r).padStart(2) + ' |' + row.map((cell, c) => {
      const isLast = lastMove?.row === r && lastMove?.col === c;
      if (cell === 'X') return isLast ? ' ⊗' : ' X';
      if (cell === 'O') return isLast ? ' ⊙' : ' O';
      return ' ·';
    }).join('')
  );
  const boardStr = [colHeader, ...boardRows].join('\n');

  // Numbered candidate moves — AI just picks one number, far less error-prone
  const strategicMoves = getStrategicMoves(board);
  const topMoves = strategicMoves.slice(0, 10);
  const numberedMoves = topMoves
    .map((m, i) => `  ${i + 1}. "${m.row},${m.col}"`)
    .join('\n');
  const bestMove = topMoves[0] ? `${topMoves[0].row},${topMoves[0].col}` : '7,7';

  const opponent = player.color === 'X' ? 'O' : 'X';
  const lastMoveStr = lastMove
    ? `Đối thủ (${opponent}) vừa đi: hàng ${lastMove.row}, cột ${lastMove.col}`
    : 'Bạn đi trước!';

  const recentMoves = moveHistory
    .slice(-4)
    .map((m) => `${m.player}:${m.notation}`)
    .join(' ');

  const user = `Bạn là ${player.color}. ${lastMoveStr}${recentMoves ? ` | Gần đây: ${recentMoves}` : ''}

BÀN CỜ — hàng(row) 0-${BOARD_SIZE-1} dọc, cột(col) 0-${BOARD_SIZE-1} ngang. X=bạn, O=đối thủ, ·=trống:
${boardStr}

🎯 NƯỚC ĐI TỐT NHẤT (chỉ chọn từ danh sách này — tất cả đều là ô TRỐNG):
${numberedMoves}

Chọn 1 nước từ danh sách. action phải đúng dạng "row,col", ví dụ: "${bestMove}".
JSON:`;

  return { system, user };
}

// ==================== RETRY PROMPT (after invalid move) ====================
export function buildCaroRetryPrompt(
  player: CaroPlayer,
  board: CaroBoard,
  badAction: string,
): { system: string; user: string } {
  const system = `Bạn đang chơi Caro. Bạn vừa chọn ô "${badAction}" nhưng ô đó KHÔNG HỢP LỆ (đã có quân hoặc ngoài bàn cờ).
CHỈ trả lời JSON, KHÔNG thêm gì khác: {"action":"row,col","speech":"...","expression":"😎"}`;

  const strategic = getStrategicMoves(board);
  const validList = strategic.slice(0, 10).map((m) => `${m.row},${m.col}`).join(' | ');
  const bestMove = strategic[0] ? `${strategic[0].row},${strategic[0].col}` : '';

  const user = `Ô "${badAction}" không hợp lệ. Hãy chọn một trong các ô TRỐNG sau:
${validList}

Chọn ngay, ví dụ: "${bestMove}"
JSON:`;

  return { system, user };
}
export async function callCaroAgent(
  player: CaroPlayer,
  systemPrompt: string,
  userPrompt: string,
  includeThought: boolean
): Promise<CaroAgentResponse> {
  const store = useCaroStore.getState();
  const startTime = Date.now();

  try {
    const response = await fetchAgent(player, systemPrompt, userPrompt);
    const durationMs = Date.now() - startTime;

    // Log API call
    store.addApiLog({
      timestamp: Date.now(),
      playerName: player.name,
      provider: player.provider,
      model: player.model,
      moveNumber: store.moveHistory.length + 1,
      systemPrompt,
      userPrompt,
      response,
      error: null,
      durationMs,
    });

    return response;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errMsg = err instanceof Error ? err.message : String(err);

    store.addApiLog({
      timestamp: Date.now(),
      playerName: player.name,
      provider: player.provider,
      model: player.model,
      moveNumber: store.moveHistory.length + 1,
      systemPrompt,
      userPrompt,
      response: null,
      error: errMsg,
      durationMs,
    });

    return { thought: '', speech: 'Có lỗi.', action: '', expression: '😱' };
  }
}
