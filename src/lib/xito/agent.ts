import {
  XitoAgentResponse,
  XitoPlayer,
  XitoAction,
  Expression,
  EXPRESSIONS,
  formatHand,
  evaluateHand,
  getAllCards,
  getVisibleCards,
  HAND_RANK_NAME,
  HAND_RANK_EMOJI,
  SUIT_NAME,
  RANK_DISPLAY,
  RANK_VALUE,
  SUIT_RANK,
} from '@/lib/xito/types';
import { useXitoStore } from '@/store/xitoStore';

function formatKnownPrivateCards(player: XitoPlayer): string {
  const privateCards = [
    ...(player.holeCard ? [{ ...player.holeCard, faceUp: true }] : []),
    ...player.faceUpCards.filter((c) => !c.faceUp).map((c) => ({ ...c, faceUp: true })),
  ];
  return privateCards.length > 0 ? formatHand(privateCards) : 'Chưa có';
}

function formatPublicCards(player: XitoPlayer): string {
  const visible = getVisibleCards(player);
  return visible.length > 0 ? formatHand(visible) : 'Chưa lật';
}

/* ------------------------------------------------------------------ */
/*  Call our own API route (runs client-side)                          */
/* ------------------------------------------------------------------ */
async function fetchAgent(
  player: XitoPlayer,
  systemPrompt: string,
  userPrompt: string,
): Promise<XitoAgentResponse> {
  const res = await fetch('/api/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: player.provider,
      model: player.model,
      apiKey: player.apiKey,
      baseUrl: player.baseUrl,
      systemPrompt,
      userPrompt,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Agent API error for ${player.name}:`, errText);
    return { thought: '', speech: 'Hmm...', action: 'call', expression: '🤔' };
  }

  const data = await res.json();
  
  // Validate expression
  if (!data.expression || !EXPRESSIONS.includes(data.expression)) {
    data.expression = '🤔';
  }
  
  // Validate action
  const validActions: XitoAction[] = ['fold', 'call', 'raise', 'all_in', 'check'];
  if (!data.action || !validActions.includes(data.action)) {
    data.action = 'call';
  }
  
  return data;
}

/* ------------------------------------------------------------------ */
/*  Base system prompt for all Xì Tố players                          */
/* ------------------------------------------------------------------ */
function baseSystemPrompt(player: XitoPlayer, includeThought: boolean): string {
  const personalityPrompt = player.personality 
    ? `\nTÍNH CÁCH CỦA BẠN (BẮT BUỘC PHẢI THỂ HIỆN RÕ):\n- ${player.personality}`
    : '';

  return `Bạn đang chơi STUD POKER (Xì Tố Việt Nam). Tên bạn: "${player.name}".${personalityPrompt}

LUẬT STUD POKER (XÌ TỐ):
- Dùng bộ bài 32 lá (7-A, không có 2-6).
- Lần chia đầu: mỗi người nhận 3 lá gồm 2 lá ngửa + 1 lá úp.
- Các vòng sau: mỗi vòng lật thêm 1 lá ngửa cho mọi người cùng thấy.
- Tổng mỗi người có 5 lá: 1 lá kín + 4 lá ngửa.
- Sau mỗi lần chia/lật quan trọng có 1 vòng cược (tổng 3 vòng cược chính).
- Người có lá ngửa cao nhất nói trước.
- KHÔNG được tráo bài, KHÔNG được đổi bài (khác draw poker).

XẾP HẠNG TAY BÀI (cao đến thấp):
1. Thùng Phá Sảnh: 5 lá cùng chất liên tiếp
2. Tứ Quý: 4 lá cùng số
3. Cù Lũ: 3 lá + 1 đôi
4. Thùng: 5 lá cùng chất
5. Sảnh: 5 lá liên tiếp
6. Sám Chi: 3 lá cùng số
7. Thú: 2 đôi
8. Đôi: 2 lá cùng số
9. Mậu Thầu: Lá cao nhất

HÀNH ĐỘNG CÓ THỂ:
- "fold": Bỏ bài, mất tiền đã cược
- "call": Theo (gọi bằng mức cược hiện tại)
- "raise": Tố thêm (tăng mức cược)
- "all_in": Tố tất cả chip còn lại
- "check": Xem bài (khi chưa ai tố)

CHIẾN THUẬT:
- Quan sát bài ngửa của đối thủ để đoán tay bài.
- Dùng biểu cảm và lời nói để LỪA GẠT.
- BLUFF: Có thể tố mạnh dù bài yếu để ép đối thủ bỏ.
- Nếu bài tốt, có thể giả vờ lo lắng để đối thủ theo.
- Theo dõi kích thước pot để quyết định có nên theo không.

QUY TẮC OUTPUT:
- Trả lời bằng tiếng Việt.
- CHỈ trả lời đúng JSON, KHÔNG thêm gì khác:
${includeThought 
  ? '{"thought":"...","speech":"...","action":"fold"|"call"|"raise"|"all_in"|"check","raiseAmount":100,"expression":"😎"}'
  : '{"speech":"...","action":"fold"|"call"|"raise"|"all_in"|"check","raiseAmount":100,"expression":"😎"}'
}

${includeThought ? '- "thought": 1 câu suy nghĩ nội tâm NGẮN GỌN, có cảm xúc.' : ''}
- "speech": TỐI ĐA 10 TỪ. Câu nói để lừa gạt hoặc khiêu khích.
- "action": Một trong các hành động hợp lệ.
- "raiseAmount": Số tiền tố thêm (chỉ khi action="raise").
- "expression": Một trong các emoji: ${EXPRESSIONS.join(' ')}

BIỂU CẢM:
- 😎 Tự tin | 😰 Lo lắng | 🤔 Suy nghĩ | 😏 Bí ẩn
- 😤 Thách thức | 😱 Sợ hãi | 😈 Lừa gạt | 🥶 Run sợ
- 😴 Bình tĩnh | 🤑 Hào hứng

LƯU Ý QUAN TRỌNG:
- Biểu cảm và lời nói có thể KHÔNG phản ánh đúng bài thật!
- Đừng lộ bài tẩy, đừng nói thật về tay bài.
- Chơi tâm lý, khiêu khích, bluff nếu cần!`;
}

/* ------------------------------------------------------------------ */
/*  Build prompt for betting decision                                  */
/* ------------------------------------------------------------------ */
export function buildBettingPrompt(
  player: XitoPlayer,
  otherPlayers: XitoPlayer[],
  pot: number,
  currentBet: number,
  minRaise: number,
  bettingRound: number,
  includeThought: boolean,
): { system: string; user: string } {
  const system = baseSystemPrompt(player, includeThought);
  
  // Lấy tất cả bài của người chơi (bao gồm lá úp)
  const allCards = getAllCards(player);
  const handEval = evaluateHand(allCards);
  
  // Bài riêng tư và bài công khai
  const privateCardsDisplay = formatKnownPrivateCards(player);
  const publicCardsDisplay = formatPublicCards(player);
  
  // Tính toán tiền cần theo
  const toCall = currentBet - player.roundBet;
  const canCheck = toCall === 0;
  
  // Thông tin các đối thủ
  const othersInfo = otherPlayers
    .filter((p) => p.id !== player.id && p.status !== 'folded')
    .map((p) => {
      const status = p.status === 'all_in' ? '(ALL-IN)' : '';
      const visibleCards = formatPublicCards(p);
      return `${p.expression} ${p.name}: ${visibleCards} | Cược: ${p.roundBet} ${status}`;
    })
    .join('\n');
  
  // Người đã bỏ bài
  const foldedPlayers = otherPlayers
    .filter((p) => p.status === 'folded')
    .map((p) => p.name)
    .join(', ');

  const user = `🎰 VÒNG CƯỢC ${bettingRound} - "${player.name}"

💰 POT: ${pot} chips
📊 MỨC CƯỢC HIỆN TẠI: ${currentBet} (bạn đã đặt: ${player.roundBet})
${canCheck ? '✅ Bạn có thể CHECK (không cần theo)' : `💸 CẦN THEO: ${toCall} chips`}
💵 CHIP CỦA BẠN: ${player.chips}
📈 TỐ TỐI THIỂU: ${minRaise}

🃏 BÀI CỦA BẠN:
- Bài kín (chỉ bạn biết): ${privateCardsDisplay}
- Bài ngửa (mọi người thấy): ${publicCardsDisplay}
- Đánh giá: ${HAND_RANK_EMOJI[handEval.rank]} ${handEval.description}

👥 ĐỐI THỦ (chỉ thấy bài ngửa):
${othersInfo}
${foldedPlayers ? `\n❌ Đã bỏ bài: ${foldedPlayers}` : ''}

HÀNH ĐỘNG HỢP LỆ:
${canCheck ? '- "check": Xem bài (không mất tiền)\n' : ''}- "call": Theo ${toCall} chips
- "raise": Tố thêm (raiseAmount >= ${minRaise})
- "all_in": Tố tất cả ${player.chips} chips
- "fold": Bỏ bài

Quyết định của bạn? Dùng biểu cảm và lời nói để lừa gạt!
JSON:`;

  return { system, user };
}

/* ------------------------------------------------------------------ */
/*  Build prompt for reaction after dealing                            */
/* ------------------------------------------------------------------ */
export function buildDealReactionPrompt(
  player: XitoPlayer,
  newCard: { suit: string; rank: string; faceUp: boolean },
  cardNumber: number,
  includeThought: boolean,
): { system: string; user: string } {
  const system = baseSystemPrompt(player, includeThought);
  
  const allCards = getAllCards(player);
  const handEval = evaluateHand(allCards);
  
  const cardDisplay = newCard.faceUp 
    ? `${RANK_DISPLAY[newCard.rank as keyof typeof RANK_DISPLAY]}${newCard.suit === 'hearts' ? '♥️' : newCard.suit === 'diamonds' ? '♦️' : newCard.suit === 'clubs' ? '♣️' : '♠️'}`
    : '🂠 (lá úp - bài tẩy)';

  const user = `🃏 BẠN NHẬN LÁ BÀI THỨ ${cardNumber}: ${cardDisplay}

BÀI HIỆN TẠI:
- Bài kín (chỉ bạn biết): ${formatKnownPrivateCards(player)}
- Bài ngửa (mọi người thấy): ${formatPublicCards(player)}
- Đánh giá: ${HAND_RANK_EMOJI[handEval.rank]} ${handEval.description}

Phản ứng với lá bài mới! (TỐI ĐA 10 TỪ)
Nếu bài tốt, có thể giả vờ buồn. Nếu bài xấu, giả vờ vui.
action đặt là "check" (chỉ phản ứng, chưa cược).
JSON:`;

  return { system, user };
}

/* ------------------------------------------------------------------ */
/*  Build prompt for showdown reaction                                 */
/* ------------------------------------------------------------------ */
export function buildShowdownPrompt(
  player: XitoPlayer,
  won: boolean,
  winAmount: number,
  includeThought: boolean,
): { system: string; user: string } {
  const system = baseSystemPrompt(player, includeThought);
  
  const allCards = getAllCards(player);
  const handEval = evaluateHand(allCards);

  const user = `🎯 KẾT QUẢ VÁN ĐẤU

BÀI CỦA BẠN: ${formatHand(allCards.map(c => ({ ...c, faceUp: true })))}
TAY BÀI: ${HAND_RANK_EMOJI[handEval.rank]} ${handEval.description}

KẾT QUẢ: ${won ? '🏆 THẮNG!' : '😢 THUA!'}
${won ? `💰 THẮNG: +${winAmount} chips` : ''}

Phản ứng với kết quả! (TỐI ĐA 10 TỪ)
action đặt là "check".
JSON:`;

  return { system, user };
}

/* ------------------------------------------------------------------ */
/*  Build prompt for fold win reaction                                 */
/* ------------------------------------------------------------------ */
export function buildFoldWinPrompt(
  player: XitoPlayer,
  winAmount: number,
  foldedCount: number,
  includeThought: boolean,
): { system: string; user: string } {
  const system = baseSystemPrompt(player, includeThought);

  const user = `🎯 THẮNG DO ĐỐI THỦ BỎ BÀI!

${foldedCount} người chơi đã bỏ bài.
Bạn là người duy nhất còn lại!

💰 THẮNG: +${winAmount} chips

Ăn mừng chiến thắng! (TỐI ĐA 10 TỪ)
action đặt là "check".
JSON:`;

  return { system, user };
}

/* ------------------------------------------------------------------ */
/*  Main call function                                                */
/* ------------------------------------------------------------------ */
export async function callXitoAgent(
  player: XitoPlayer,
  systemPrompt: string,
  userPrompt: string,
): Promise<XitoAgentResponse> {
  const store = useXitoStore.getState();
  const startTime = Date.now();
  let response: XitoAgentResponse | null = null;
  let error: string | null = null;

  try {
    response = await fetchAgent(player, systemPrompt, userPrompt);
    return response;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    return { thought: '', speech: 'Hmm...', action: 'call', expression: '🤔' };
  } finally {
    store.addApiLog({
      timestamp: startTime,
      playerName: player.name,
      provider: player.provider,
      model: player.model,
      phase: store.phase,
      roundCount: store.roundCount,
      systemPrompt,
      userPrompt,
      response,
      error,
      durationMs: Date.now() - startTime,
    });
  }
}
