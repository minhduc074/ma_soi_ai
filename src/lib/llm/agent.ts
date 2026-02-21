import { AgentResponse, ChatMessage, Player, ROLE_INFO } from '@/lib/types';
import { useGameStore } from '@/store/gameStore';

/* ------------------------------------------------------------------ */
/*  Call our own API route (runs client-side)                          */
/* ------------------------------------------------------------------ */
async function fetchAgent(
  player: Player,
  systemPrompt: string,
  userPrompt: string,
): Promise<AgentResponse> {
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
    return { thought: '(API error)', speech: 'Tôi không có ý kiến gì.', action: '' };
  }

  return res.json();
}

/* ------------------------------------------------------------------ */
/*  Build system prompt shared across all phases                      */
/* ------------------------------------------------------------------ */
function baseSystemPrompt(player: Player, alivePlayers: Player[]): string {
  const roleInfo = ROLE_INFO[player.role];
  const aliveNames = alivePlayers.map((p) => p.name).join(', ');

  return `Bạn đang chơi trò Ma Sói. Tên bạn: "${player.name}".
Vai trò: ${roleInfo.emoji} ${roleInfo.name} – ${roleInfo.description}
Còn sống: ${aliveNames}

Bạn KHÔNG được biết thông tin ban đêm (ai bị sói tấn công, ai được cứu, v.v.) trừ khi vai trò của bạn cho phép. Bạn CHỈ biết những gì được công bố công khai vào ban ngày.

QUY TẮC OUTPUT:
- Trả lời bằng tiếng Việt.
- CHỈ trả lời đúng JSON, KHÔNG thêm gì khác:
{"thought":"...","speech":"...","action":"..."}

- "thought": 1-2 câu suy nghĩ nội tâm ngắn gọn, KHÔNG dài dòng, KHÔNG liệt kê, KHÔNG phân tích dài. Nói như đang chat, có cảm xúc.
- "speech": 1-3 câu nói tự nhiên, ngắn gọn, như người thật nói chuyện. KHÔNG dài dòng, KHÔNG liệt kê, KHÔNG phân tích dài. Nói như đang chat, có cảm xúc.
- "action": tên người nếu cần chọn, hoặc bỏ trống.
- Nếu là SÓI, giả vờ dân làng. Đừng tiết lộ.
- Có cá tính riêng, đừng lặp lại người khác.
- Tất cả là bạn bè thân thiết, k cần phải sợ những người khác. Hãy nói chuyện và sống thật với cảm xúc của bạn, dù là nghi ngờ, sợ hãi, hay tự tin.`;
}

/* ------------------------------------------------------------------ */
/*  Prompt builders for each phase                                    */
/* ------------------------------------------------------------------ */

export function buildWolfPrompt(
  player: Player,
  alivePlayers: Player[],
  fellowWolves: Player[],
  chatHistory: ChatMessage[],
): { system: string; user: string } {
  const system = baseSystemPrompt(player, alivePlayers);
  const nonWolfAlive = alivePlayers.filter((p) => p.role !== 'werewolf');
  const targets = nonWolfAlive.map((p) => p.name).join(', ');
  const wolfNames = fellowWolves.map((p) => p.name).join(', ');

  const recentChat = formatChatHistory(chatHistory.slice(-20));

  const user = `🌙 Đêm. Bạn là SÓI. Tên bạn: "${player.name}" (KHÔNG được chọn chính mình). Đồng đội: ${wolfNames}
Mục tiêu có thể: ${targets}
${recentChat ? `Gần đây:\n${recentChat}\n` : ''}
Chọn 1 người để giết. Đặt tên vào "action". JSON:`;

  return { system, user };
}

export function buildSeerPrompt(
  player: Player,
  alivePlayers: Player[],
  chatHistory: ChatMessage[],
  previousResults: { target: string; result: string }[],
): { system: string; user: string } {
  const system = baseSystemPrompt(player, alivePlayers);
  const targets = alivePlayers.filter((p) => p.id !== player.id).map((p) => p.name).join(', ');

  const prevInfo = previousResults.length
    ? previousResults.map((r) => `- ${r.target}: ${r.result}`).join('\n')
    : 'Chưa soi ai.';

  const recentChat = formatChatHistory(chatHistory.slice(-15));

  const user = `🔮 Đêm. Bạn là TIÊN TRI, tên "${player.name}" (KHÔNG được soi chính mình).
Đã soi: ${prevInfo}
Có thể soi: ${targets}
${recentChat ? `Gần đây:\n${recentChat}\n` : ''}
Chọn 1 người để soi. Đặt tên vào "action". JSON:`;

  return { system, user };
}

export function buildGuardPrompt(
  player: Player,
  alivePlayers: Player[],
  lastGuardTarget: string | null,
): { system: string; user: string } {
  const system = baseSystemPrompt(player, alivePlayers);
  const targets = alivePlayers
    .filter((p) => p.name !== lastGuardTarget)
    .map((p) => p.name)
    .join(', ');

  const user = `🛡️ Đêm. Bạn là BẢO VỆ.
${lastGuardTarget ? `Đêm trước đã bảo vệ "${lastGuardTarget}", không được chọn lại.` : ''}
Có thể bảo vệ: ${targets}
Chọn 1 người. Đặt tên vào "action". JSON:`;

  return { system, user };
}

export function buildWitchPrompt(
  player: Player,
  alivePlayers: Player[],
  wolfTarget: string | null,
  hasHeal: boolean,
  hasPoison: boolean,
): { system: string; user: string } {
  const system = baseSystemPrompt(player, alivePlayers);

  let info = '🧙 ĐÊM ĐÃ ĐẾN. Bạn là PHÙ THỦY.\n';
  if (wolfTarget) {
    info += `Sói vừa tấn công "${wolfTarget}".\n`;
  } else {
    info += 'Đêm nay không ai bị sói tấn công.\n';
  }
  info += `Bình cứu: ${hasHeal ? '✅ Còn' : '❌ Đã dùng'}\n`;
  info += `Bình độc: ${hasPoison ? '✅ Còn' : '❌ Đã dùng'}\n`;

  const targets = alivePlayers.filter((p) => p.id !== player.id).map((p) => p.name).join(', ');

  const user = `${info}
Bạn là "${player.name}" (KHÔNG được dùng thuốc độc lên chính mình).
Còn sống: ${targets}
Cứu → action="save" | Độc → action="poison:TÊN" | Không → action="skip"
JSON:`;

  return { system, user };
}

export function buildDiscussionPrompt(
  player: Player,
  alivePlayers: Player[],
  chatHistory: ChatMessage[],
  deaths: string[],
  dayCount: number,
  privateNotes?: string,
  daySummary?: string,
): { system: string; user: string } {
  const system = baseSystemPrompt(player, alivePlayers);
  const recentChat = formatChatHistory(chatHistory.slice(-40));

  const deathInfo = deaths.length
    ? `Đêm qua, ${deaths.join(', ')} đã bị giết.`
    : 'Đêm qua không ai chết.';

  const user = `☀️ Ngày ${dayCount} – Thảo luận.
Bạn là "${player.name}".
${deathInfo}
${daySummary ? `\n📰 Tóm tắt ván đấu (thông tin công khai):\n${daySummary}\n` : ''}
${privateNotes ? `\n📓 Ghi nhớ riêng của bạn (chỉ bạn biết, từ hành động đêm qua):\n${privateNotes}\n` : ''}
${recentChat ? `Cuộc trò chuyện (phát biểu của mọi người):\n${recentChat}\n` : 'Bạn nói đầu tiên.\n'}
Phát biểu ngắn gọn 1-3 câu. Nêu nghi ngờ hoặc bảo vệ bản thân. action không cần.
JSON:`;

  return { system, user };
}

export function buildVotePrompt(
  player: Player,
  alivePlayers: Player[],
  chatHistory: ChatMessage[],
  privateNotes?: string,
  daySummary?: string,
): { system: string; user: string } {
  const system = baseSystemPrompt(player, alivePlayers);
  const candidates = alivePlayers.filter((p) => p.id !== player.id).map((p) => p.name).join(', ');
  const recentChat = formatChatHistory(chatHistory.slice(-40));

  const user = `🗳️ Vote loại 1 người. Bạn là "${player.name}" (KHÔNG được vote chính mình).
Ứng viên: ${candidates}
${daySummary ? `📰 Tóm tắt ván đấu:\n${daySummary}\n` : ''}
${privateNotes ? `📓 Ghi nhớ riêng của bạn:\n${privateNotes}\n` : ''}
${recentChat ? `Thảo luận:\n${recentChat}\n` : ''}
Đặt tên vào "action". speech: nói ngắn lý do. JSON:`;

  return { system, user };
}

export function buildHunterPrompt(
  player: Player,
  alivePlayers: Player[],
): { system: string; user: string } {
  const system = baseSystemPrompt(player, alivePlayers);
  const targets = alivePlayers.filter((p) => p.id !== player.id).map((p) => p.name).join(', ');

  const user = `🏹 Bạn ("${player.name}") chết! Thợ Săn được bắn 1 người (KHÔNG được bắn chính mình). Mục tiêu: ${targets}
Đặt tên vào "action". JSON:`;

  return { system, user };
}

/* ------------------------------------------------------------------ */
/*  Summary prompt — called once per day to summarize public events   */
/* ------------------------------------------------------------------ */
export function buildSummaryPrompt(
  chatHistory: ChatMessage[],
  dayCount: number,
  deadPlayers: { name: string; role: string }[],
): { system: string; user: string } {
  const system = `Bạn là người tóm tắt trập chơi Ma Sói. Tóm tắt NGẪN GỌN (3-6 câu) những gì đã xảy ra công khai (chết ai, ai bị loại, ai bị nghi ngờ, kết quả bỏ phiếu) tới Ngày ${dayCount}.
Những người đã bị loại khỏi game được liệt kê cùng vai trò của họ (công khai sau khi chết).
CHỈ dùng thông tin công khai (không tiết lộ vai trò người đang sống).
Trả lời đúng 1 đoạn văn ngắn bằng tiếng Việt. KHÔNG dùng JSON.`;

  const deadRoleMap = Object.fromEntries(deadPlayers.map((p) => [p.name, p.role]));

  const publicLog = chatHistory
    .filter((m) => {
      if (m.type === 'speech') return true;
      if (m.type === 'system') {
        const nightKeywords = ['thức dậy', 'nhắm mắt', 'Bầy sói đã chọn', 'sói hành động', 'Tiên tri', 'Bảo vệ', 'Phù thủy'];
        return !nightKeywords.some((kw) => m.content.includes(kw));
      }
      return false;
    })
    .map((m) => {
      if (m.type === 'system') return `[Sự kiện] ${m.content}`;
      const roleLabel = deadRoleMap[m.sender] ? ` (${deadRoleMap[m.sender]}, đã chết)` : '';
      return `${m.sender}${roleLabel}: ${m.content}`;
    })
    .join('\n');

  const deadList = deadPlayers.length
    ? `\nDanh sách đã bị loại: ${deadPlayers.map((p) => `${p.name} (${p.role})`).join(', ')}`
    : '';

  const user = `Lịch sử công khai tới Ngày ${dayCount}:${deadList}\n\n${publicLog || '(Chưa có sự kiện nào)'}`;

  return { system, user };
}

/* ------------------------------------------------------------------ */
/*  Helper: format chat history for prompt                            */
/* ------------------------------------------------------------------ */
/** Night system messages that must NEVER leak to player prompts */
const NIGHT_LEAK_PATTERNS = [
  'Bầy sói thức dậy',
  'Bầy sói đã chọn',
  'Tiên tri thức dậy',
  'Bảo vệ thức dậy',
  'Phù thủy thức dậy',
  'nhắm mắt',
];

function isNightLeak(msg: ChatMessage): boolean {
  if (msg.type !== 'system') return false;
  return NIGHT_LEAK_PATTERNS.some((p) => msg.content.includes(p));
}

function formatChatHistory(messages: ChatMessage[]): string {
  return messages
    .filter((m) => {
      // Only include public speech and safe system announcements
      if (m.type === 'speech') return true;
      if (m.type === 'system' && !isNightLeak(m)) return true;
      return false;
    })
    .map((m) => {
      if (m.type === 'system') return `[HỆ THỐNG] ${m.content}`;
      return `${m.sender}: ${m.content}`;
    })
    .join('\n');
}

/* ------------------------------------------------------------------ */
/*  Main call function                                                */
/* ------------------------------------------------------------------ */
export async function callAgent(
  player: Player,
  systemPrompt: string,
  userPrompt: string,
): Promise<AgentResponse> {
  const store = useGameStore.getState();
  const startTime = Date.now();
  let response: AgentResponse | null = null;
  let error: string | null = null;

  try {
    response = await fetchAgent(player, systemPrompt, userPrompt);
    return response;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    return { thought: '(API error)', speech: 'Tôi không có ý kiến gì.', action: '' };
  } finally {
    store.addApiLog({
      timestamp: startTime,
      playerName: player.name,
      provider: player.provider,
      model: player.model,
      phase: store.phase,
      dayCount: store.dayCount,
      systemPrompt,
      userPrompt,
      response,
      error,
      durationMs: Date.now() - startTime,
    });
  }
}
