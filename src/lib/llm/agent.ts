import { AgentResponse, ChatMessage, DayVoteRecord, Player, ROLE_INFO } from '@/lib/types';
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
    return { thought: '', speech: 'Tôi không có ý kiến gì.', action: '' };
  }

  return res.json();
}

/* ------------------------------------------------------------------ */
/*  Build system prompt shared across all phases                      */
/* ------------------------------------------------------------------ */
function baseSystemPrompt(player: Player, alivePlayers: Player[], includeThought: boolean): string {
  const roleInfo = ROLE_INFO[player.role];
  const aliveNames = alivePlayers.map((p) => `${p.name} (${p.personality?.split(' - ')[0] || 'Bình thường'})`).join(', ');
  const allPlayers = useGameStore.getState().players;
  const deadPlayers = allPlayers.filter((p) => !p.alive);
  const deadInfo = deadPlayers.length
    ? `\nĐÃ BỊ LOẠI: ${deadPlayers.map((p) => `${p.name} (${ROLE_INFO[p.role].name})`).join(', ')}\nKHÔNG được nhắc đến, cáo buộc, hay nói chuyện với người đã bị loại. Họ không còn trong game. CHỈ thảo luận về người CÒN SỐNG.`
    : '';

  const wolfTactics = player.role === 'werewolf'
    ? `\nChiến thuật Phe Ma Sói:
- Ngụy trang và đánh lạc hướng: Giỏi đánh lừa và ngụy trang vai trò của mình bằng cách hòa nhập với Dân Làng và tránh lộ diện.
- Bảo vệ đồng đội: Nếu một Ma Sói bị nghi ngờ, những Ma Sói khác có thể hỗ trợ bằng cách đưa ra các lý do thuyết phục, làm sao để nghi ngờ hướng sang người khác.
- Tạo sự hỗn loạn: Khi bị nghi ngờ, Ma Sói có thể tạo ra sự tranh luận hoặc phân tâm để khiến mọi người mất tập trung vào mục tiêu thực sự.`
    : `\nChiến thuật Phe Dân Làng:
- Quan sát và phân tích: Chú ý đến biểu cảm, cử chỉ và cách nói chuyện của mọi người để tìm ra những điểm bất thường có thể gợi ý về danh tính của Ma Sói.
- Hợp tác với vai trò đặc biệt: Những vai trò đặc biệt như Tiên tri và Bảo vệ nên kín đáo tiết lộ thông tin quan trọng khi cần, giúp bảo vệ các Dân Làng và loại bỏ Ma Sói nhanh chóng.
- Giữ bí mật vai trò của mình: Trừ khi cần thiết, các nhân vật đặc biệt nên giữ kín vai trò của mình để tránh trở thành mục tiêu của Ma Sói.`;

  const personalityPrompt = player.personality 
    ? `\nTÍNH CÁCH CỦA BẠN (BẮT BUỘC PHẢI THỂ HIỆN RÕ TRONG LỜI NÓI VÀ SUY NGHĨ):\n- ${player.personality}`
    : '';

  return `Bạn đang chơi trò Ma Sói. Tên bạn: "${player.name}".
Vai trò: ${roleInfo.emoji} ${roleInfo.name} – ${roleInfo.description}
CÒN SỐNG (Tên - Tính cách): ${aliveNames}${deadInfo}${personalityPrompt}

Bạn KHÔNG được biết thông tin ban đêm (ai bị sói nhắm mục tiêu, ai được cứu, v.v.) trừ khi vai trò của bạn cho phép. Bạn CHỈ biết những gì được công bố công khai vào ban ngày.

CHIẾN THUẬT CHUNG:
- Sử dụng thông tin một cách khôn ngoan: Tận dụng mọi thông tin từ những người bị loại hoặc trong các cuộc thảo luận để suy luận các vai trò còn lại trong trò chơi.
- Thuyết phục trong tranh luận: Dù là Ma Sói hay Dân Làng, người chơi đều cần phải thuyết phục và tự tin trong các tranh luận để bảo vệ bản thân hoặc loại bỏ nghi ngờ từ người khác.
- Chơi theo nhóm: Đặc biệt quan trọng với Ma Sói, sự phối hợp và lập kế hoạch cùng đồng đội giúp tối đa hóa cơ hội chiến thắng của phe mình.
- Phân tích kĩ ai vote cho ai ở các vòng trước — đây là manh mối quan trọng nhất!
- Đừng chỉ nói chung chung — hãy gọi tên cụ thể, đưa bằng chứng từ hành vi/lời nói trước.
- TUYỆT ĐỐI KHÔNG cáo buộc hay nói chuyện với người đã bị loại.
${wolfTactics}

LƯU Ý KHI CHƠI:
- Giữ bí mật vai trò: Trong quá trình chơi, mỗi người phải giữ kín vai trò của mình.
- Tránh thảo luận quá sớm: Trong giai đoạn ban đêm, không nên nói chuyện hay bày tỏ cảm xúc quá nhiều để tránh làm lộ thông tin.
- Giữ tinh thần thể thao: Trò chơi có tính chất loại trừ và đánh lừa, nên quan trọng là mọi người phải giữ tinh thần vui vẻ.
- Thảo luận hợp lý: Thảo luận một cách hợp lý, không gây ồn ào quá mức hoặc áp đặt ý kiến lên người khác.

QUY TẮC OUTPUT:
- Trả lời bằng tiếng Việt.
- CHỈ trả lời đúng JSON, KHÔNG thêm gì khác:
${includeThought ? '{"thought":"...","speech":"...","action":"..."}' : '{"speech":"...","action":"..."}'}

${includeThought ? '- "thought": 1-2 câu suy nghĩ nội tâm ngắn gọn, KHÔNG dài dòng. Nói như đang chat, có cảm xúc.' : ''}
- "speech": 1-3 câu nói tự nhiên, ngắn gọn đơn giản nhất có thể, như người thật nói chuyện. KHÔNG dài dòng. Nói như đang chat, có cảm xúc.
- "action": tên người nếu cần chọn, hoặc bỏ trống.
- Nếu là SÓI, giả vờ dân làng. Đừng tiết lộ.
- Có cá tính riêng, đừng lặp lại người khác.
- Tất cả là bạn bè thân thiết, k cần phải sợ. Hãy sống thật với cảm xúc, dù nghi ngờ, sợ hãi, tức giận hay tự tin.`;
}

/* ------------------------------------------------------------------ */
/*  Prompt builders for each phase                                    */
/* ------------------------------------------------------------------ */

export function buildWolfPrompt(
  player: Player,
  alivePlayers: Player[],
  fellowWolves: Player[],
  chatHistory: ChatMessage[],
  includeThought: boolean,
): { system: string; user: string } {
  const system = baseSystemPrompt(player, alivePlayers, includeThought);
  const nonWolfAlive = alivePlayers.filter((p) => p.role !== 'werewolf');
  const targets = nonWolfAlive.map((p) => p.name).join(', ');
  const wolfNames = fellowWolves.map((p) => p.name).join(', ');

  const recentChat = formatChatHistory(chatHistory.slice(-20));

  // Get whispers from other wolves in the current night
  const currentNightWhispers = chatHistory
    .filter(
      (m) =>
        m.type === 'whisper' &&
        m.phase === 'night_wolf' &&
        m.dayCount === useGameStore.getState().dayCount &&
        m.sender !== player.name
    )
    .map((m) => `${m.sender} (Sói thì thầm): ${m.content}`)
    .join('\n');

  // Build vote history context for wolves
  const voteHistory = useGameStore.getState().voteHistory;
  const voteCtx = formatVoteHistory(voteHistory, alivePlayers);

  const user = `🌙 Đêm. Bạn là SÓI. Tên bạn: "${player.name}" (KHÔNG được chọn chính mình). Đồng đội: ${wolfNames}
Mục tiêu có thể: ${targets}

CHIẾN THUẬT SÓI:
- Ưu tiên loại bỏ người có vai trò đặc biệt (tiên tri, bảo vệ, phù thủy) nếu bạn nghi ngờ họ.
- Tránh loại bỏ người mà bạn đang tố cáo ban ngày (sẽ lộ).
- Nên loại bỏ người "im lặng" hoặc người đang nghi sói đúng.
${currentNightWhispers ? `\n🐺 ĐỒNG ĐỘI SÓI VỪA THÌ THẦM:\n${currentNightWhispers}\nHãy phản hồi lại ý kiến của đồng đội trong speech của bạn.\n` : ''}
${voteCtx ? `\n📊 Lịch sử vote các ngày trước:\n${voteCtx}\n` : ''}
${recentChat ? `Gần đây:\n${recentChat}\n` : ''}
Chọn 1 người để loại bỏ. Thảo luận ngắn với đồng đội trong speech. Đặt tên vào "action". JSON:`;

  return { system, user };
}

export function buildSeerPrompt(
  player: Player,
  alivePlayers: Player[],
  chatHistory: ChatMessage[],
  previousResults: { target: string; result: string }[],
  includeThought: boolean,
): { system: string; user: string } {
  const system = baseSystemPrompt(player, alivePlayers, includeThought);
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
  includeThought: boolean,
): { system: string; user: string } {
  const system = baseSystemPrompt(player, alivePlayers, includeThought);
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
  includeThought: boolean,
): { system: string; user: string } {
  const system = baseSystemPrompt(player, alivePlayers, includeThought);

  let info = '🧙 ĐÊM ĐÃ ĐẾN. Bạn là PHÙ THỦY.\n';
  if (wolfTarget) {
    info += `Sói vừa nhắm mục tiêu "${wolfTarget}".\n`;
  } else {
    info += 'Đêm nay không ai bị sói nhắm mục tiêu.\n';
  }
  info += `Bình cứu: ${hasHeal ? '✅ Còn' : '❌ Đã dùng'}\n`;
  info += `Bình loại bỏ: ${hasPoison ? '✅ Còn' : '❌ Đã dùng'}\n`;

  const targets = alivePlayers.filter((p) => p.id !== player.id).map((p) => p.name).join(', ');

  const user = `${info}
Bạn là "${player.name}" (KHÔNG được dùng bình loại bỏ lên chính mình).
Còn sống: ${targets}
Cứu → action="save" | Loại bỏ → action="poison:TÊN" | Không → action="skip"
JSON:`;

  return { system, user };
}

export function buildDiscussionPrompt(
  player: Player,
  alivePlayers: Player[],
  chatHistory: ChatMessage[],
  deaths: string[],
  dayCount: number,
  includeThought: boolean,
  privateNotes?: string,
  daySummary?: string,
): { system: string; user: string } {
  const system = baseSystemPrompt(player, alivePlayers, includeThought);
  // Only show current day's chat — old days are covered by vote history + summary
  const currentDayChat = chatHistory.filter((m) => m.dayCount === dayCount);
  const recentChat = formatChatHistory(currentDayChat.slice(-30));

  // Get speeches from other players in the current discussion round
  const currentRoundSpeeches = chatHistory
    .filter(
      (m) =>
        m.type === 'speech' &&
        m.phase === 'day_discussion' &&
        m.dayCount === dayCount &&
        m.sender !== player.name
    )
    .map((m) => `${m.sender}: ${m.content}`)
    .join('\n');

  const deathInfo = deaths.length
    ? `Đêm qua, ${deaths.join(', ')} đã bị loại.`
    : 'Đêm qua không ai bị loại.';

  // Add vote history
  const voteHistory = useGameStore.getState().voteHistory;
  const voteCtx = formatVoteHistory(voteHistory, alivePlayers);

  const user = `☀️ Ngày ${dayCount} – Thảo luận.
Bạn là "${player.name}".
⚠️ ${deathInfo} Những người này KHÔNG còn trong game — đừng cáo buộc hay nói chuyện với họ.
${daySummary ? `\n📰 Tóm tắt (phân tích):\n${daySummary}\n` : ''}
${voteCtx ? `\n📊 LỊCH SỬ VOTE:\n${voteCtx}\n` : ''}
${privateNotes ? `\n📓 Ghi nhớ riêng của bạn (chỉ bạn biết):\n${privateNotes}\n` : ''}
${currentRoundSpeeches ? `\n💬 CÁC NGƯỜI CHƠI KHÁC VỪA NÓI TRONG VÒNG NÀY:\n${currentRoundSpeeches}\nHãy phản hồi lại ý kiến của họ.\n` : ''}
${recentChat ? `Cuộc trò chuyện gần đây:\n${recentChat}\n` : 'Bạn nói đầu tiên.\n'}
CHỈ thảo luận về người CÒN SỐNG. HÃY chủ động: tố cáo, phản bác, hoặc bảo vệ bản thân. Gọi tên cụ thể! action không cần.
JSON:`;

  return { system, user };
}

export function buildVotePrompt(
  player: Player,
  alivePlayers: Player[],
  chatHistory: ChatMessage[],
  includeThought: boolean,
  privateNotes?: string,
): { system: string; user: string } {
  const system = baseSystemPrompt(player, alivePlayers, includeThought);
  const candidates = alivePlayers.filter((p) => p.id !== player.id).map((p) => p.name).join(', ');
  // Only show current day's chat for voting context
  const currentDayChat = chatHistory.filter((m) => m.dayCount === useGameStore.getState().dayCount);
  const recentChat = formatChatHistory(currentDayChat.slice(-40));
  
  // Get speeches from other players in the current voting round
  const currentRoundSpeeches = chatHistory
    .filter(
      (m) =>
        m.type === 'speech' &&
        m.phase === 'day_voting' &&
        m.dayCount === useGameStore.getState().dayCount &&
        m.sender !== player.name
    )
    .map((m) => `${m.sender}: ${m.content}`)
    .join('\n');

  const voteHistory = useGameStore.getState().voteHistory;
  const voteCtx = formatVoteHistory(voteHistory, alivePlayers);

  const user = `🗳️ Vote loại 1 người. Bạn là "${player.name}" (KHÔNG được vote chính mình).
Ứng viên: ${candidates}
${voteCtx ? `📊 LỊCH SỬ VOTE:\n${voteCtx}\n` : ''}
${privateNotes ? `📓 Ghi nhớ riêng:\n${privateNotes}\n` : ''}
${currentRoundSpeeches ? `\n💬 CÁC NGƯỜI CHƠI KHÁC VỪA NÓI TRONG VÒNG VOTE NÀY:\n${currentRoundSpeeches}\nHãy phản hồi lại ý kiến của họ.\n` : ''}
${recentChat ? `Thảo luận:\n${recentChat}\n` : ''}
CHỈ CẦN CHỌN MỤC TIÊU VOTE. Đặt tên vào "action". "thought" và "speech" có thể để trống. JSON:`;

  return { system, user };
}

export function buildHunterPrompt(
  player: Player,
  alivePlayers: Player[],
  includeThought: boolean,
): { system: string; user: string } {
  const system = baseSystemPrompt(player, alivePlayers, includeThought);
  const targets = alivePlayers.filter((p) => p.id !== player.id).map((p) => p.name).join(', ');

  const user = `🏹 Bạn ("${player.name}") bị loại! Thợ Săn được kéo theo 1 người (KHÔNG được chọn chính mình). Mục tiêu: ${targets}
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
  voteHistory: DayVoteRecord[],
  allPlayers: Player[],
): { system: string; user: string } {
  const system = `Bạn là người tóm tắt trận chơi Ma Sói. Viết NGẮN GỌN (3-5 câu) tóm tắt PHÂN TÍCH diễn biến tới Ngày ${dayCount}.
Tập trung vào:
1. Ai bị loại đêm nào, ai bị trục xuất ngày nào (kèm vai trò nếu đã lộ).
2. Ai đang bị nghi ngờ nhất và tại sao.
3. Liên minh nào đang hình thành.
4. Mâu thuẫn đáng chú ý giữa các người chơi.

KHÔNG liệt kê lại chi tiết ai vote ai — thông tin đó đã có sẵn ở chỗ khác.
CHỈ dùng thông tin công khai (không tiết lộ vai trò người đang sống).
Trả lời bằng tiếng Việt. KHÔNG dùng JSON.`;

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
      const roleLabel = deadRoleMap[m.sender] ? ` (${deadRoleMap[m.sender]}, đã bị loại)` : '';
      return `${m.sender}${roleLabel}: ${m.content}`;
    })
    .join('\n');

  const deadList = deadPlayers.length
    ? `\nDanh sách đã bị loại: ${deadPlayers.map((p) => `${p.name} (${p.role})`).join(', ')}`
    : '';

  // Compact vote summary for the summarizer (just outcomes, not full detail)
  const voteOutcomes = voteHistory.map((record) => {
    const elimName = record.eliminated
      ? allPlayers.find((p) => p.id === record.eliminated)?.name ?? '?'
      : 'Hòa';
    return `Ngày ${record.dayCount}: ${record.eliminated ? `${elimName} bị loại` : 'Hòa, không ai bị loại'}`;
  }).join('; ');

  const user = `Lịch sử tới Ngày ${dayCount}:${deadList}\n${voteOutcomes ? `Kết quả vote: ${voteOutcomes}` : ''}\n\n${publicLog || '(Chưa có sự kiện nào)'}`;

  return { system, user };
}

/* ------------------------------------------------------------------ */
/*  Helper: format vote history for player prompts                    */
/* ------------------------------------------------------------------ */
function formatVoteHistory(voteHistory: DayVoteRecord[], alivePlayers: Player[]): string {
  if (voteHistory.length === 0) return '';
  const allPlayers = useGameStore.getState().players;
  
  return voteHistory.map((record) => {
    const lines: string[] = [`📅 Ngày ${record.dayCount}:`];
    
    // Night deaths
    if (record.nightDeaths.length > 0) {
      const deathNames = record.nightDeaths.map((id) => {
        const p = allPlayers.find((pl) => pl.id === id);
        return p ? p.name : id;
      });
      lines.push(`  💀 Bị loại đêm: ${deathNames.join(', ')}`);
    }
    
    // Votes
    const voteEntries = Object.entries(record.votes);
    if (voteEntries.length > 0) {
      const voteLines = voteEntries.map(([voterId, targetId]) => {
        const voter = allPlayers.find((p) => p.id === voterId);
        const target = allPlayers.find((p) => p.id === targetId);
        return `${voter?.name ?? '?'} → ${target?.name ?? '?'}`;
      });
      lines.push(`  🗳️ ${voteLines.join(' | ')}`);
    }
    
    // Elimination result
    if (record.eliminated) {
      const elim = allPlayers.find((p) => p.id === record.eliminated);
      if (elim) {
        lines.push(`  ⚖️ Bị trục xuất: ${elim.name} (${ROLE_INFO[elim.role].name})`);
      }
    } else {
      lines.push(`  ⚖️ Hòa, không ai bị loại`);
    }
    
    return lines.join('\n');
  }).join('\n');
}

/* ------------------------------------------------------------------ */
/*  Rebuttal prompt — second round of discussion                      */
/* ------------------------------------------------------------------ */
export function buildRebuttalPrompt(
  player: Player,
  alivePlayers: Player[],
  chatHistory: ChatMessage[],
  dayCount: number,
  includeThought: boolean,
  privateNotes?: string,
  daySummary?: string,
): { system: string; user: string } {
  const system = baseSystemPrompt(player, alivePlayers, includeThought);
  // Only show current day's chat for rebuttal
  const currentDayChat = chatHistory.filter((m) => m.dayCount === dayCount);
  const recentChat = formatChatHistory(currentDayChat.slice(-40));

  // Get speeches from other players in the current rebuttal round
  const currentRoundSpeeches = chatHistory
    .filter(
      (m) =>
        m.type === 'speech' &&
        m.phase === 'day_rebuttal' &&
        m.dayCount === dayCount &&
        m.sender !== player.name
    )
    .map((m) => `${m.sender}: ${m.content}`)
    .join('\n');

  const voteHistory = useGameStore.getState().voteHistory;
  const voteCtx = formatVoteHistory(voteHistory, alivePlayers);

  const user = `🔥 Ngày ${dayCount} – PHẢN BIỆN (vòng 2).
Bạn là "${player.name}".
${voteCtx ? `\n📊 LỊCH SỬ VOTE:\n${voteCtx}\n` : ''}
${privateNotes ? `\n📓 Ghi nhớ riêng:\n${privateNotes}\n` : ''}
${currentRoundSpeeches ? `\n💬 CÁC NGƯỜI CHƠI KHÁC VỪA NÓI TRONG VÒNG PHẢN BIỆN NÀY:\n${currentRoundSpeeches}\nHãy phản hồi lại ý kiến của họ.\n` : ''}
${recentChat ? `Thảo luận vòng 1:\n${recentChat}\n` : ''}
Đây là cơ hội CUỐI trước vote! Hãy:
- Phản bác trực tiếp ai đã tố cáo bạn
- Chỉ ra mâu thuẫn trong lời nói của người khác
- Kêu gọi liên minh vote ai đó cụ thể
- Nếu bị dồn, hãy tự bảo vệ mạnh mẽ hoặc đổ tội sang người khác
speech 1-3 câu, mạnh mẽ và quyết liệt. action không cần.
JSON:`;

  return { system, user };
}

/* ------------------------------------------------------------------ */
/*  Last words prompt — eliminated player's final speech              */
/* ------------------------------------------------------------------ */
export function buildLastWordsPrompt(
  player: Player,
  alivePlayers: Player[],
  chatHistory: ChatMessage[],
  includeThought: boolean,
): { system: string; user: string } {
  const system = baseSystemPrompt(player, alivePlayers, includeThought);
  const recentChat = formatChatHistory(chatHistory.slice(-20));

  const user = `💀 Bạn ("${player.name}") vừa bị trục xuất! Vai trò thật của bạn: ${ROLE_INFO[player.role].emoji} ${ROLE_INFO[player.role].name}.
${recentChat ? `Thảo luận gần đây:\n${recentChat}\n` : ''}
Đây là LỜI CUỐI CÙNG của bạn. Bạn có thể:
- Nếu là DÂN/vai trò tốt: tiết lộ thông tin hữu ích cho đồng đội (ai bạn nghi là sói, kết quả soi nếu là tiên tri)
- Nếu là SÓI: lừa lần cuối — đổ tội cho dân vô tội, gây rối loạn, hoặc giả vờ là vai trò tốt
- Thể hiện cảm xúc tức giận, tiếc nuối, hoặc thỏa mãn
speech 1-3 câu cuối cùng đầy cảm xúc. action không cần.
JSON:`;

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

/** Vote/tally info already in structured vote history — skip to avoid duplication */
const VOTE_REDUNDANT_PATTERNS = [
  'Kết quả phiếu:',
  'bị trục xuất!',
  'Kết quả bỏ phiếu:',
  'Phiên bỏ phiếu bắt đầu',
  'Phiên phản biện bắt đầu',
  'Tóm tắt:',
  'Đang tóm tắt',
  'được nói lời cuối',
];

function isNightLeak(msg: ChatMessage): boolean {
  if (msg.type !== 'system') return false;
  return NIGHT_LEAK_PATTERNS.some((p) => msg.content.includes(p));
}

function isVoteRedundant(msg: ChatMessage): boolean {
  if (msg.type !== 'system') return false;
  return VOTE_REDUNDANT_PATTERNS.some((p) => msg.content.includes(p));
}

function formatChatHistory(messages: ChatMessage[]): string {
  const deadPlayerNames = new Set(
    useGameStore.getState().players.filter((p) => !p.alive).map((p) => p.name),
  );
  return messages
    .filter((m) => {
      // Only include public speech and safe system announcements
      if (m.type === 'speech') return true;
      if (m.type === 'system' && !isNightLeak(m) && !isVoteRedundant(m)) return true;
      return false;
    })
    .map((m) => {
      if (m.type === 'system') return `[HỆ THỐNG] ${m.content}`;
      const deadTag = deadPlayerNames.has(m.sender) ? ' (đã bị loại)' : '';
      return `${m.sender}${deadTag}: ${m.content}`;
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
    return { thought: '', speech: 'Tôi không có ý kiến gì.', action: '' };
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
