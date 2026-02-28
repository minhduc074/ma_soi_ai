import {
  BlackjackAgentResponse,
  BlackjackChatMessage,
  BlackjackPlayer,
  calculateHandValue,
  Expression,
  EXPRESSIONS,
  formatHand,
  getSpecialHand,
  SPECIAL_HAND_INFO,
} from '@/lib/blackjack/types';
import { useBlackjackStore } from '@/store/blackjackStore';

/* ------------------------------------------------------------------ */
/*  Call our own API route (runs client-side)                          */
/* ------------------------------------------------------------------ */
async function fetchAgent(
  player: BlackjackPlayer,
  systemPrompt: string,
  userPrompt: string,
): Promise<BlackjackAgentResponse> {
  const res = await fetch('/api/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: player.provider,
      model: player.model,
      systemPrompt,
      userPrompt,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Agent API error for ${player.name}:`, errText);
    return { thought: '', speech: 'Tôi không biết nói gì.', action: '', expression: '🤔' };
  }

  const data = await res.json();
  
  // Validate expression
  if (!data.expression || !EXPRESSIONS.includes(data.expression)) {
    data.expression = '🤔';
  }
  
  // Validate action
  if (data.action && !['hit', 'stand'].includes(data.action)) {
    data.action = '';
  }

  // Validate raiseAmount for betting phase (optional in other phases)
  if (typeof data.raiseAmount === 'number' && Number.isFinite(data.raiseAmount)) {
    data.raiseAmount = Math.max(0, Math.floor(data.raiseAmount));
  }
  
  return data;
}

/* ------------------------------------------------------------------ */
/*  Base system prompt for all Blackjack players                      */
/* ------------------------------------------------------------------ */
function baseSystemPrompt(player: BlackjackPlayer, includeThought: boolean): string {
  const personalityPrompt = player.personality 
    ? `\nTÍNH CÁCH CỦA BẠN (BẮT BUỘC PHẢI THỂ HIỆN RÕ):\n- ${player.personality}`
    : '';

  return `Bạn đang chơi Xì Dách (Blackjack Việt Nam). Tên bạn: "${player.name}".
${player.isDealer ? 'Bạn là NHÀ CÁI.' : 'Bạn là NGƯỜI CHƠI.'}${personalityPrompt}

LUẬT XÌ DÁCH:
- Mục tiêu: Có tổng điểm gần 21 nhất mà không vượt quá.
- A = 1 hoặc 10/11 (linh hoạt), J/Q/K = 10, 2-10 = giá trị mặt.
- Xì Bàng: 2 Ace → thắng gấp 3 (cao nhất).
- Xì Dách: A + 10/J/Q/K = 21 với 2 lá → thắng gấp 2.
- Ngũ Linh: 5 lá không quá 21 → thắng gấp 2.
- Quắc: Quá 21 → thua ngay.
- Dưới 16 điểm bắt buộc phải rút thêm bài.

CHIẾN THUẬT:
- Quan sát biểu cảm và lời nói của đối thủ để đoán bài.
- Dùng biểu cảm và lời nói để LỪA GẠT đối phương.
- Nếu bài tốt, có thể giả vờ lo lắng để đối thủ chủ quan.
- Nếu bài xấu, có thể tỏ ra tự tin để đối thủ sợ.

QUY TẮC OUTPUT:
- Trả lời bằng tiếng Việt.
- CHỈ trả lời đúng JSON, KHÔNG thêm gì khác:
${includeThought ? '{"thought":"...","speech":"...","action":"hit"|"stand","expression":"😎"}' : '{"speech":"...","action":"hit"|"stand","expression":"😎"}'}

${includeThought ? '- "thought": 1 câu suy nghĩ nội tâm NGẮN GỌN, có cảm xúc.' : ''}
- "speech": TỐI ĐA 10 TỪ. Câu nói ngắn gọn để lừa gạt hoặc khiêu khích.
- "action": "hit" (rút bài), "stand" (dằn bài) hoặc "" (khi phase không cần action).
- "expression": Một trong các emoji sau: ${EXPRESSIONS.join(' ')}
  - 😎 Tự tin | 😰 Lo lắng | 🤔 Suy nghĩ | 😏 Bí ẩn
  - 😤 Thách thức | 😱 Sợ hãi | 😈 Lừa gạt | 🥶 Run sợ
  - 😴 Bình tĩnh | 🤑 Hào hứng

LƯU Ý:
- Biểu cảm và lời nói có thể KHÔNG phản ánh đúng bài thật để lừa gạt!
- Đừng lộ bài, đừng nói thật điểm của mình.
- Hãy chơi tâm lý, khiêu khích, hoặc giả vờ yếu/mạnh.`;
}

/* ------------------------------------------------------------------ */
/*  Build prompt for betting phase                                    */
/* ------------------------------------------------------------------ */
export function buildBettingPrompt(
  player: BlackjackPlayer,
  players: BlackjackPlayer[],
  roundCount: number,
  includeThought: boolean,
): { system: string; user: string } {
  const system = `${baseSystemPrompt(player, includeThought)}

PHASE ĐẶT CƯỢC:
- Bạn phải tự quyết số chips muốn cược cho vòng này.
- Cược phải là số nguyên trong [1, số chips hiện có].
- Chơi có chiến thuật: có thể cược lớn để gây áp lực hoặc cược nhỏ để thủ bài.

QUY TẮC OUTPUT RIÊNG CHO PHASE NÀY:
- CHỈ trả lời JSON dạng:
${includeThought ? '{"thought":"...","speech":"...","action":"","expression":"😎","raiseAmount":50}' : '{"speech":"...","action":"","expression":"😎","raiseAmount":50}'}
- "raiseAmount": số chips bạn cược vòng này (bắt buộc).
- "action": để trống "".`;

  const tableInfo = players
    .map((p) => `${p.expression} ${p.name}: ${p.chips} chips`)
    .join('\n');

  const user = `💰 PHASE ĐẶT CƯỢC - VÁN ${roundCount}

BẠN: ${player.name}
CHIPS HIỆN CÓ: ${player.chips}

👥 BÀN CHƠI:
${tableInfo}

Hãy chọn số chips muốn cược cho vòng này bằng trường raiseAmount.
Nhớ nói 1 câu ngắn để tạo áp lực tâm lý lên đối thủ.
JSON:`;

  return { system, user };
}

/* ------------------------------------------------------------------ */
/*  Build prompt for player turn                                      */
/* ------------------------------------------------------------------ */
export function buildPlayerTurnPrompt(
  player: BlackjackPlayer,
  dealer: BlackjackPlayer,
  otherPlayers: BlackjackPlayer[],
  includeThought: boolean,
): { system: string; user: string } {
  const system = baseSystemPrompt(player, includeThought);
  
  const handValue = calculateHandValue(player.hand);
  const specialHand = getSpecialHand(player.hand);
  const handDisplay = formatHand(player.hand);
  
  // Dealer's visible card (first card face up)
  const dealerVisibleCard = dealer.hand.find((c) => c.faceUp);
  const dealerVisibleDisplay = dealerVisibleCard ? formatHand([dealerVisibleCard]) : '🂠';
  
  // Other players' visible info
  const othersInfo = otherPlayers
    .filter((p) => p.id !== player.id)
    .map((p) => {
      const status = p.status === 'stood' ? 'Đã dằn' : p.status === 'busted' ? 'Quắc' : 'Đang chơi';
      return `${p.expression} ${p.name}: ${p.hand.length} lá (${status})`;
    })
    .join('\n');
  
  // Mandatory hit if under 16
  const mustHit = handValue < 16 && specialHand === 'normal';
  
  const specialInfo = specialHand !== 'normal' 
    ? `🎉 BẠN CÓ ${SPECIAL_HAND_INFO[specialHand].emoji} ${SPECIAL_HAND_INFO[specialHand].name}!`
    : '';

  const user = `🃏 LƯỢT CỦA BẠN - "${player.name}"

BÀI CỦA BẠN: ${handDisplay}
ĐIỂM: ${handValue}${specialInfo ? `\n${specialInfo}` : ''}

🎴 NHÀ CÁI (${dealer.name}): ${dealerVisibleDisplay} + 🂠 (1 lá úp)
Biểu cảm nhà cái: ${dealer.expression}

${othersInfo ? `👥 NGƯỜI CHƠI KHÁC:\n${othersInfo}\n` : ''}
${mustHit ? '⚠️ DƯỚI 16 ĐIỂM - BẮT BUỘC PHẢI RÚT (action="hit")!\n' : ''}
${player.hand.length >= 5 ? '⚠️ ĐÃ 5 LÁ - KHÔNG THỂ RÚT THÊM!\n' : ''}
Quyết định: rút ("hit") hay dằn ("stand")? 
Nhớ dùng biểu cảm và lời nói để lừa gạt nhà cái!
JSON:`;

  return { system, user };
}

/* ------------------------------------------------------------------ */
/*  Build prompt for dealer turn                                      */
/* ------------------------------------------------------------------ */
export function buildDealerTurnPrompt(
  dealer: BlackjackPlayer,
  players: BlackjackPlayer[],
  logs: BlackjackChatMessage[],
  includeThought: boolean,
): { system: string; user: string } {
  const system = baseSystemPrompt(dealer, includeThought);
  
  const handValue = calculateHandValue(dealer.hand);
  const specialHand = getSpecialHand(dealer.hand);
  const handDisplay = formatHand(dealer.hand);
  
  // Players' info (some may be busted already)
  const recentPlayerSpeechByName = new Map<string, string>();
  for (let i = logs.length - 1; i >= 0; i--) {
    const log = logs[i];
    if (log.type !== 'speech') continue;
    if (!recentPlayerSpeechByName.has(log.sender)) {
      recentPlayerSpeechByName.set(log.sender, log.content);
    }
  }

  const playersInfo = players
    .map((p) => {
      const status = p.status === 'stood' ? 'Đã dằn' : p.status === 'busted' ? 'Quắc' : 'Đang chơi';
      const pValue = p.status === 'busted' ? 'Quắc' : `${p.hand.length} lá`;
      const lastSpeech = recentPlayerSpeechByName.get(p.name);
      const speechHint = lastSpeech ? ` | Nói gần nhất: "${lastSpeech}"` : '';
      return `${p.expression} ${p.name}: ${pValue} (${status})${speechHint}`;
    })
    .join('\n');

  // Dealer cannot see exact points; build likely check candidates from public cues.
  const checkCandidates = players
    .filter((p) => p.status !== 'busted')
    .map((p) => ({
      name: p.name,
      expression: p.expression,
      handCount: p.hand.length,
      suspicion: p.hand.length * 10 + (p.expression === '😰' || p.expression === '🥶' ? 8 : 0),
    }))
    .sort((a, b) => b.suspicion - a.suspicion)
    .slice(0, 3)
    .map((p, idx) => `${idx + 1}. ${p.expression} ${p.name}: ${p.handCount} lá`)
    .join('\n');

  // Keep only latest table talks for dealer mind game context (exclude thoughts)
  const recentTableTalk = logs
    .filter((log) => log.type === 'speech')
    .slice(-8)
    .map((log) => `${log.expression ?? '🤔'} ${log.sender}: "${log.content}"`)
    .join('\n');
  
  // Mandatory hit if under 16
  const mustHit = handValue < 16 && specialHand === 'normal';
  
  const specialInfo = specialHand !== 'normal' 
    ? `🎉 BẠN CÓ ${SPECIAL_HAND_INFO[specialHand].emoji} ${SPECIAL_HAND_INFO[specialHand].name}!`
    : '';

  const user = `🎴 LƯỢT NHÀ CÁI - "${dealer.name}"

BÀI CỦA BẠN: ${handDisplay}
ĐIỂM: ${handValue}${specialInfo ? `\n${specialInfo}` : ''}

👥 TÌNH TRẠNG NGƯỜI CHƠI:
${playersInfo}

${recentTableTalk ? `💬 HỘI THOẠI GẦN ĐÂY (chỉ lời nói):\n${recentTableTalk}\n` : ''}
${checkCandidates ? `⚠️ ĐỐI TƯỢNG CÓ THỂ CHECK (theo dấu hiệu công khai):\n${checkCandidates}\n` : ''}

${mustHit ? '⚠️ DƯỚI 16 ĐIỂM - BẮT BUỘC PHẢI RÚT (action="hit")!\n' : ''}
${dealer.hand.length >= 5 ? '⚠️ ĐÃ 5 LÁ - KHÔNG THỂ RÚT THÊM!\n' : ''}
Là nhà cái, bạn muốn: rút thêm ("hit") hay dằn để so bài ("stand")?
Bạn chỉ thấy số lá + biểu cảm/lời nói của người chơi, KHÔNG thấy điểm thật của họ.
LUẬT CHIẾN THUẬT CHO LƯỢT NHÀ CÁI:
- Nếu bạn đã đủ điểm (>16), và nghi có ai quắc hoặc không bằng điểm bạn: dằn ("stand") để CHECK những người đó.
- Những người còn lại thì KHÔNG check.
- Bạn có thể chọn rút thêm ("hit") để mong điểm cao hơn; sau đó nếu vẫn nghi có ai quắc hoặc không bằng điểm bạn thì dằn và chỉ check nhóm đó.
Hãy đọc vị cảm xúc từ biểu cảm + lời nói gần đây, rồi dùng biểu cảm và lời nói để đánh lừa và gây áp lực lên người chơi!
JSON:`;

  return { system, user };
}

/* ------------------------------------------------------------------ */
/*  Build prompt for reaction when receiving a card                   */
/* ------------------------------------------------------------------ */
export function buildReactionPrompt(
  player: BlackjackPlayer,
  newCard: { suit: string; rank: string },
  includeThought: boolean,
): { system: string; user: string } {
  const system = baseSystemPrompt(player, includeThought);
  
  const handValue = calculateHandValue(player.hand);
  const specialHand = getSpecialHand(player.hand);
  const handDisplay = formatHand(player.hand);
  
  const specialInfo = specialHand !== 'normal' 
    ? `🎉 BẠN CÓ ${SPECIAL_HAND_INFO[specialHand].emoji} ${SPECIAL_HAND_INFO[specialHand].name}!`
    : '';
  
  const busted = handValue > 21;

  const user = `🃏 BẠN VỪA RÚT ĐƯỢC: ${newCard.rank}${newCard.suit}

BÀI HIỆN TẠI: ${handDisplay}
ĐIỂM: ${handValue}${specialInfo ? `\n${specialInfo}` : ''}
${busted ? '💥 QUẮC! BẠN ĐÃ QUÁ 21 ĐIỂM!' : ''}

Hãy phản ứng! Dùng biểu cảm và lời nói (TỐI ĐA 10 TỪ) để lừa gạt.
Nếu bài tốt, có thể giả vờ buồn. Nếu bài xấu, có thể giả vờ vui.
action để trống (đã rút bài rồi).
JSON:`;

  return { system, user };
}

/* ------------------------------------------------------------------ */
/*  Build prompt for round end reaction                               */
/* ------------------------------------------------------------------ */
export function buildRoundEndPrompt(
  player: BlackjackPlayer,
  won: boolean,
  payout: number,
  dealerHandValue: number,
  includeThought: boolean,
): { system: string; user: string } {
  const system = baseSystemPrompt(player, includeThought);
  
  const handValue = calculateHandValue(player.hand);
  const specialHand = getSpecialHand(player.hand);
  const handDisplay = formatHand(player.hand);
  
  const specialInfo = specialHand !== 'normal' 
    ? `${SPECIAL_HAND_INFO[specialHand].emoji} ${SPECIAL_HAND_INFO[specialHand].name}`
    : '';

  const resultEmoji = won ? '🎉' : '😢';
  const payoutText = payout > 0 ? `+${payout}` : `${payout}`;

  const user = `${resultEmoji} KẾT QUẢ VÒNG NÀY

BÀI CỦA BẠN: ${handDisplay} = ${handValue} điểm ${specialInfo}
BÀI NHÀ CÁI: ${dealerHandValue} điểm

KẾT QUẢ: ${won ? 'THẮNG!' : 'THUA!'}
CHIPS: ${payoutText}

Hãy phản ứng với kết quả! (TỐI ĐA 10 TỪ)
action để trống.
JSON:`;

  return { system, user };
}

/* ------------------------------------------------------------------ */
/*  Main call function                                                */
/* ------------------------------------------------------------------ */
export async function callBlackjackAgent(
  player: BlackjackPlayer,
  systemPrompt: string,
  userPrompt: string,
): Promise<BlackjackAgentResponse> {
  const store = useBlackjackStore.getState();
  const startTime = Date.now();
  let response: BlackjackAgentResponse | null = null;
  let error: string | null = null;

  try {
    response = await fetchAgent(player, systemPrompt, userPrompt);
    return response;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    return { thought: '', speech: 'Hmm...', action: '', expression: '🤔' };
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
