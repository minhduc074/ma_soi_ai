/**
 * Voice assignment for TTS — maps player name → Edge Neural voice
 * Gọi assignPlayerVoices() một lần khi game bắt đầu.
 */

export const VOICE_FEMALE = 'vi-VN-HoaiMyNeural';
export const VOICE_MALE   = 'vi-VN-NamMinhNeural';

/** playerName → voice string */
export const playerVoices = new Map<string, string>();

/* ------------------------------------------------------------------ */
/*  Heuristic đoán giới tính từ tên Việt                              */
/* ------------------------------------------------------------------ */
const FEMALE_LAST = new Set([
  'linh','lan','mai','hoa','anh','chi','ngân','hương','thủy','trang',
  'thu','vân','yến','ngọc','hằng','hiền','nhung','liên','dung','loan',
  'phương','thúy','xuân','nga','thảo','ly','vy','ni','my','như',
  'oanh','diệp','châu','tuyết','bích','hà','quỳnh','giang','trúc',
  'diễm','lệ','kim','cúc','đào','sen','thi','oanh','thy','duyên',
  'thơ','lam','trâm','nhi','vi','tiên','thư','hiếu','thùy','nhàn',
  'lý','phụng','đinh','hậu','ý','em','nữ','giới',
]);

const MALE_LAST = new Set([
  'minh','tuấn','hùng','dũng','khoa','nam','hải','quân','phát','thắng',
  'long','bình','đức','tú','sơn','bảo','khôi','trung','phúc','vinh',
  'kiên','quang','hoàng','an','đại','thiên','nhật','tân','huy','khánh',
  'cường','văn','lâm','đạt','khang','trí','phong','thành','duy','tiến',
  'nghĩa','hưng','lực','trực','phú','quý','tín','tâm','từ','nhân',
  'bắc','nam','đông','tây','phú','lộc','thọ','hùng','mạnh','vũ',
  'vui','khỏe','giàu','sang','nam','trai','đực',
]);

export function guessGender(name: string): 'male' | 'female' {
  // Lấy tên cuối (name token cuối cùng, bỏ dấu để so sánh)
  const normalized = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // bỏ dấu
    .replace(/đ/g, 'd');

  const tokens = normalized.split(/\s+/);
  const last = tokens[tokens.length - 1];

  // So sánh tên gốc có dấu (last token)
  const lastOriginal = name.trim().toLowerCase().split(/\s+/).pop() ?? '';

  if (FEMALE_LAST.has(lastOriginal)) return 'female';
  if (MALE_LAST.has(lastOriginal)) return 'male';

  // So sánh không dấu
  if (FEMALE_LAST.has(last)) return 'female';
  if (MALE_LAST.has(last)) return 'male';

  // Fallback: hash tên → chia đều
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return hash % 2 === 0 ? 'female' : 'male';
}

/* ------------------------------------------------------------------ */
/*  Assign voices — gọi server /gender, fallback heuristic            */
/* ------------------------------------------------------------------ */
export async function assignPlayerVoices(
  players: Array<{ name: string }>
): Promise<void> {
  await Promise.all(
    players.map(async (p) => {
      // Thử gọi TTS server để lấy giọng
      try {
        const r = await fetch(
          `http://localhost:5500/gender?name=${encodeURIComponent(p.name)}`,
          { signal: AbortSignal.timeout(1500) }
        );
        if (r.ok) {
          const data = await r.json() as { gender: string; voice: string };
          playerVoices.set(p.name, data.voice);
          console.log(`[Voice] ${p.name} → ${data.gender} (${data.voice})`);
          return;
        }
      } catch {
        // server không có → dùng heuristic
      }
      // Fallback heuristic
      const gender = guessGender(p.name);
      const voice = gender === 'female' ? VOICE_FEMALE : VOICE_MALE;
      playerVoices.set(p.name, voice);
      console.log(`[Voice] ${p.name} → ${gender} [heuristic] (${voice})`);
    })
  );
}

export function getVoice(playerName: string): string {
  return playerVoices.get(playerName) ?? VOICE_FEMALE;
}
