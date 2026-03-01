import { useXiangqiStore } from '@/store/xiangqiStore';
import {
  XiangqiPlayer,
  XiangqiAgentResponse,
  XiangqiBoard,
  XiangqiMove,
  MoveRecord,
  boardToAscii,
  formatMove,
  PIECE_NAMES,
  BOARD_ROWS,
  BOARD_COLS,
} from '@/lib/xiangqi/types';
import { EXPRESSIONS } from '@/lib/boardgame/types';

// ==================== API CALL ====================
async function fetchAgent(
  player: XiangqiPlayer,
  systemPrompt: string,
  userPrompt: string
): Promise<XiangqiAgentResponse> {
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

    const data = (await res.json()) as XiangqiAgentResponse;

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
function baseSystemPrompt(player: XiangqiPlayer, includeThought: boolean): string {
  const personalityPrompt = player.personality
    ? `\nTÍNH CÁCH CỦA BẠN (BẮT BUỘC PHẢI THỂ HIỆN RÕ):\n- ${player.personality}`
    : '';

  const colorVn = player.color === 'red' ? 'Đỏ (Hồng)' : 'Đen';
  const kingChar = player.color === 'red' ? '帥' : '將';

  return `Bạn đang chơi Cờ Tướng (Xiangqi). Tên bạn: "${player.name}". Bạn là quân ${colorVn}.
${personalityPrompt}

LUẬT CỜ TƯỚNG:
- Bàn cờ 10x9, có sông (楚河/漢界) ở giữa
- TƯỚNG (${kingChar}): Đi 1 ô ngang/dọc, chỉ trong cung (3x3). Hai Tướng không được đối mặt trực tiếp.
- SĨ (士/仕): Đi chéo 1 ô, chỉ trong cung.
- TƯỢNG (象/相): Đi chéo 2 ô, không qua sông, bị chặn nếu có quân ở giữa.
- MÃ (馬): Đi chữ L (1+2 ô), bị chặn nếu có quân cạnh điểm xuất phát.
- XE (車): Đi ngang/dọc không giới hạn.
- PHÁO (砲/炮): Đi như Xe, nhưng ăn quân phải nhảy qua đúng 1 quân.
- TỐT (卒/兵): Đi thẳng 1 ô về phía đối phương. Qua sông được đi ngang.

GIÁ TRỊ QUÂN:
- Tốt: 1 | Sĩ/Tượng: 2 | Mã/Pháo: 4.5 | Xe: 9 | Tướng: Vô giá

QUY TẮC OUTPUT:
- Trả lời bằng tiếng Việt
- CHỈ trả lời đúng JSON, KHÔNG thêm gì khác:
${includeThought ? '{"thought":"...","speech":"...","action":"a0a1","expression":"😎"}' : '{"speech":"...","action":"a0a1","expression":"😎"}'}

${includeThought ? '- "thought": 1-2 câu phân tích chiến thuật NGẮN GỌN.' : ''}
- "speech": TỐI ĐA 10 TỪ bình luận về nước đi.
- "action": Nước đi dạng "fromTo" (ví dụ: "a0a1", "e0e1"). Cột a-i, hàng 0-9.
- "expression": Một trong các emoji: ${EXPRESSIONS.join(' ')}`;
}

// ==================== GENERATE BASIC MOVES (simplified) ====================
function generateBasicMoves(board: XiangqiBoard, color: XiangqiPlayer['color']): string[] {
  const moves: string[] = [];
  
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const piece = board[r][c];
      if (!piece || piece.color !== color) continue;
      
      const from = String.fromCharCode(97 + c) + r;
      
      // Generate potential moves based on piece type
      const targets: Array<{ row: number; col: number }> = [];
      
      switch (piece.type) {
        case 'R': // Xe - moves in straight lines
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (Math.abs(dr) + Math.abs(dc) !== 1) continue;
              for (let i = 1; i < 10; i++) {
                const nr = r + dr * i;
                const nc = c + dc * i;
                if (nr < 0 || nr >= BOARD_ROWS || nc < 0 || nc >= BOARD_COLS) break;
                targets.push({ row: nr, col: nc });
                if (board[nr][nc]) break;
              }
            }
          }
          break;
        case 'H': // Mã
          const horseDeltas = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
          for (const [dr, dc] of horseDeltas) {
            targets.push({ row: r + dr, col: c + dc });
          }
          break;
        case 'C': // Pháo - same as rook but can jump to capture
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (Math.abs(dr) + Math.abs(dc) !== 1) continue;
              let jumped = false;
              for (let i = 1; i < 10; i++) {
                const nr = r + dr * i;
                const nc = c + dc * i;
                if (nr < 0 || nr >= BOARD_ROWS || nc < 0 || nc >= BOARD_COLS) break;
                if (!jumped) {
                  if (!board[nr][nc]) targets.push({ row: nr, col: nc });
                  else jumped = true;
                } else if (board[nr][nc]) {
                  targets.push({ row: nr, col: nc });
                  break;
                }
              }
            }
          }
          break;
        case 'P': // Tốt
          const forward = color === 'red' ? -1 : 1;
          targets.push({ row: r + forward, col: c });
          const crossedRiver = color === 'red' ? r <= 4 : r >= 5;
          if (crossedRiver) {
            targets.push({ row: r, col: c - 1 });
            targets.push({ row: r, col: c + 1 });
          }
          break;
        case 'K': // Tướng
          targets.push({ row: r - 1, col: c }, { row: r + 1, col: c }, { row: r, col: c - 1 }, { row: r, col: c + 1 });
          break;
        case 'A': // Sĩ
          targets.push({ row: r - 1, col: c - 1 }, { row: r - 1, col: c + 1 }, { row: r + 1, col: c - 1 }, { row: r + 1, col: c + 1 });
          break;
        case 'E': // Tượng
          targets.push({ row: r - 2, col: c - 2 }, { row: r - 2, col: c + 2 }, { row: r + 2, col: c - 2 }, { row: r + 2, col: c + 2 });
          break;
      }
      
      for (const t of targets) {
        if (t.row < 0 || t.row >= BOARD_ROWS || t.col < 0 || t.col >= BOARD_COLS) continue;
        const target = board[t.row][t.col];
        if (target && target.color === color) continue; // Can't capture own piece
        const to = String.fromCharCode(97 + t.col) + t.row;
        moves.push(from + to);
      }
    }
  }
  
  return moves;
}

// ==================== MOVE PROMPT ====================
export function buildXiangqiMovePrompt(
  player: XiangqiPlayer,
  board: XiangqiBoard,
  moveHistory: MoveRecord[],
  lastMove: XiangqiMove | null,
  includeThought: boolean
): { system: string; user: string } {
  const system = baseSystemPrompt(player, includeThought);

  const boardAscii = boardToAscii(board, lastMove);
  const possibleMoves = generateBasicMoves(board, player.color);
  
  const recentMoves = moveHistory
    .slice(-10)
    .map((m, i) => `${i + 1}. ${m.player === 'red' ? 'Đỏ' : 'Đen'}: ${m.notation}`)
    .join(' | ');

  const colorVn = player.color === 'red' ? 'Đỏ' : 'Đen';
  const opponentVn = player.color === 'red' ? 'Đen' : 'Đỏ';

  const user = `🏯 LƯỢT CỦA BẠN - Bạn là ${colorVn}

📋 BÀN CỜ HIỆN TẠI:
${boardAscii}

${lastMove ? `🔸 ${opponentVn} vừa đi: ${formatMove(lastMove)}` : '🔸 Bạn đi trước!'}

📜 LỊCH SỬ: ${recentMoves || 'Chưa có'}

✅ GỢI Ý NƯỚC ĐI (${possibleMoves.length} nước):
${possibleMoves.slice(0, 20).join(', ')}${possibleMoves.length > 20 ? '...' : ''}

Hãy chọn nước đi. Format: "fromTo" (ví dụ: "h0g2" để Mã đi từ h0 đến g2).
JSON:`;

  return { system, user };
}

// ==================== MAIN AGENT CALLER ====================
export async function callXiangqiAgent(
  player: XiangqiPlayer,
  systemPrompt: string,
  userPrompt: string,
  includeThought: boolean
): Promise<XiangqiAgentResponse> {
  const store = useXiangqiStore.getState();
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
