import { useChessStore } from '@/store/chessStore';
import {
  ChessPlayer,
  ChessAgentResponse,
  MoveRecord,
  boardToAscii,
  PIECE_NAMES,
  getMaterialAdvantage,
  Chess,
} from '@/lib/chess/types';
import { EXPRESSIONS } from '@/lib/boardgame/types';

// ==================== API CALL ====================
async function fetchAgent(
  player: ChessPlayer,
  systemPrompt: string,
  userPrompt: string
): Promise<ChessAgentResponse> {
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

    const data = (await res.json()) as ChessAgentResponse;

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
function baseSystemPrompt(player: ChessPlayer, includeThought: boolean): string {
  const personalityPrompt = player.personality
    ? `\nTÍNH CÁCH CỦA BẠN (BẮT BUỘC PHẢI THỂ HIỆN RÕ):\n- ${player.personality}`
    : '';

  const colorVn = player.color === 'white' ? 'Trắng' : 'Đen';

  return `Bạn đang chơi Cờ Vua. Tên bạn: "${player.name}". Bạn là quân ${colorVn}.
${personalityPrompt}

LUẬT CỜ VUA (tóm tắt):
- Vua (K): Đi 1 ô theo mọi hướng. Không được để Vua bị chiếu.
- Hậu (Q): Đi theo đường thẳng và chéo không giới hạn.
- Xe (R): Đi theo đường thẳng (ngang/dọc) không giới hạn.
- Tượng (B): Đi theo đường chéo không giới hạn.
- Mã (N): Đi hình chữ L (2+1 ô), có thể nhảy qua quân khác.
- Tốt (P): Đi thẳng 1 ô (hoặc 2 ô nếu chưa đi), ăn chéo.
- Nhập thành: O-O (ngắn), O-O-O (dài).
- Phong cấp: Tốt đến hàng cuối được phong thành Q/R/B/N.

GIÁ TRỊ QUÂN:
- Tốt: 1 | Mã/Tượng: 3 | Xe: 5 | Hậu: 9 | Vua: Vô giá

QUY TẮC OUTPUT:
- Trả lời bằng tiếng Việt
- CHỈ trả lời đúng JSON, KHÔNG thêm gì khác:
${includeThought ? '{"thought":"...","speech":"...","action":"e2e4","expression":"😎"}' : '{"speech":"...","action":"e2e4","expression":"😎"}'}

${includeThought ? '- "thought": 1-2 câu phân tích chiến thuật NGẮN GỌN.' : ''}
- "speech": TỐI ĐA 10 TỪ bình luận về nước đi.
- "action": Nước đi dạng SAN (Nf3, e4, O-O) hoặc UCI (e2e4, g1f3). PHẢI LÀ NƯỚC HỢP LỆ!
- "expression": Một trong các emoji: ${EXPRESSIONS.join(' ')}`;
}

// ==================== MOVE PROMPT ====================
export function buildChessMovePrompt(
  player: ChessPlayer,
  chess: Chess,
  moveHistory: MoveRecord[],
  includeThought: boolean
): { system: string; user: string } {
  const system = baseSystemPrompt(player, includeThought);

  const boardAscii = boardToAscii(chess);
  const legalMoves = chess.moves();
  const material = getMaterialAdvantage(chess);
  
  const recentMoves = moveHistory
    .slice(-10)
    .map((m, i) => `${Math.floor(i / 2) + 1}${i % 2 === 0 ? '.' : '...'} ${m.notation}`)
    .join(' ');

  const inCheck = chess.isCheck();
  const colorVn = player.color === 'white' ? 'Trắng' : 'Đen';
  const opponentVn = player.color === 'white' ? 'Đen' : 'Trắng';

  const materialStr = material.advantage > 0
    ? `Trắng hơn ${material.advantage} điểm`
    : material.advantage < 0
    ? `Đen hơn ${Math.abs(material.advantage)} điểm`
    : 'Cân bằng';

  const user = `♟️ LƯỢT CỦA BẠN - Bạn là ${colorVn}

📋 BÀN CỜ HIỆN TẠI:
${boardAscii}

${inCheck ? '⚠️ BẠN ĐANG BỊ CHIẾU! Phải thoát chiếu.' : ''}

📊 ĐIỂM QUÂN: ${materialStr}

📜 LỊCH SỬ: ${recentMoves || 'Chưa có'}

✅ CÁC NƯỚC HỢP LỆ (${legalMoves.length} nước):
${legalMoves.join(', ')}

Hãy chọn nước đi tốt nhất từ danh sách trên.
JSON:`;

  return { system, user };
}

// ==================== REACTION PROMPT (sau khi đối thủ đi) ====================
export function buildChessReactionPrompt(
  player: ChessPlayer,
  chess: Chess,
  opponentMove: string,
  includeThought: boolean
): { system: string; user: string } {
  const system = baseSystemPrompt(player, includeThought);

  const boardAscii = boardToAscii(chess);
  const colorVn = player.color === 'white' ? 'Trắng' : 'Đen';
  const opponentVn = player.color === 'white' ? 'Đen' : 'Trắng';

  const user = `♟️ ĐỐI THỦ VỪA ĐI

📋 BÀN CỜ SAU NƯỚC ĐI:
${boardAscii}

🔸 ${opponentVn} vừa đi: ${opponentMove}

Hãy phản ứng với nước đi này (chỉ bình luận, chưa đến lượt bạn).
JSON (action để trống):`;

  return { system, user };
}

// ==================== MAIN AGENT CALLER ====================
export async function callChessAgent(
  player: ChessPlayer,
  systemPrompt: string,
  userPrompt: string,
  includeThought: boolean
): Promise<ChessAgentResponse> {
  const store = useChessStore.getState();
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
