/**
 * Edge Neural TTS Server — dùng Microsoft Edge's online neural voices
 * Giọng Việt: vi-VN-HoaiMyNeural (nữ) hoặc vi-VN-NamMinhNeural (nam)
 *
 * Chạy: node tts_server.js
 * Port: 5500
 */

const express = require('express');
const cors = require('cors');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const app = express();
const PORT = 5500;

// Chỉ cho phép localhost
app.use(cors({ origin: ['http://localhost:3000', 'http://127.0.0.1:3000'] }));
app.use(express.json());

// Giọng mặc định — đổi sang NamMinhNeural nếu muốn giọng nam
const DEFAULT_VOICE = 'vi-VN-HoaiMyNeural';

// Tốc độ đọc mặc định: +0% = bình thường, +30% = nhanh, +60% = rất nhanh
const DEFAULT_RATE = '+40%';

// Cache TTS instance
const tts = new MsEdgeTTS();
let voiceReady = false;

async function ensureVoice(voice) {
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    voiceReady = true;
  } catch (err) {
    voiceReady = false;
    throw err;
  }
}

// Khởi tạo giọng khi server start
ensureVoice(DEFAULT_VOICE).then(() => {
  console.log(`[✓] Giọng sẵn sàng: ${DEFAULT_VOICE}`);
}).catch((err) => {
  console.warn('[!] Không thể kết nối Edge TTS lúc khởi động:', err.message);
});

/**
 * GET  /health
 * POST /tts  { text: "...", voice: "vi-VN-HoaiMyNeural" }
 * GET  /tts?text=...&voice=...
 */
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    voices: ['vi-VN-HoaiMyNeural', 'vi-VN-NamMinhNeural'],
    default: DEFAULT_VOICE,
  });
});

app.options('/tts', (_req, res) => res.sendStatus(200));

async function handleTTS(req, res) {
  const isPost = req.method === 'POST';
  const text = (isPost ? req.body?.text : req.query.text) || '';
  const voice = (isPost ? req.body?.voice : req.query.voice) || DEFAULT_VOICE;
  const rate = (isPost ? req.body?.rate : req.query.rate) || DEFAULT_RATE;

  const cleanText = text.trim();
  if (!cleanText) {
    return res.status(400).json({ error: 'text is required' });
  }

  try {
    const ttsInstance = new MsEdgeTTS();
    await ttsInstance.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const chunks = [];
    const { audioStream } = await ttsInstance.toStream(cleanText, { rate });

    audioStream.on('data', (chunk) => chunks.push(chunk));
    audioStream.on('end', () => {
      const audio = Buffer.concat(chunks);
      res.set('Content-Type', 'audio/mpeg');
      res.set('Content-Length', audio.length);
      res.send(audio);
    });
    audioStream.on('error', (err) => {
      console.error('[TTS Error]', err);
      res.status(500).json({ error: err.message });
    });
  } catch (err) {
    console.error('[TTS Error]', err);
    res.status(500).json({ error: err.message });
  }
}

app.get('/tts', handleTTS);
app.post('/tts', handleTTS);

/* ── /gender — đoán giới tính & trả về voice phù hợp ────────────── */
const FEMALE_LAST = new Set([
  'linh','lan','mai','hoa','anh','chi','ngân','hương','thủy','trang',
  'thu','vân','yến','ngọc','hằng','hiền','nhung','liên','dung','loan',
  'phương','thúy','xuân','nga','thảo','ly','vy','ni','my','như',
  'oanh','diệp','châu','tuyết','bích','hà','quỳnh','giang','trúc',
  'diễm','lệ','kim','cúc','đào','sen','thi','thy','duyên',
  'thơ','lam','trâm','nhi','vi','tiên','thư','hiếu','thùy','nhàn',
  'lý','phụng','đinh',
]);

const MALE_LAST = new Set([
  'minh','tuấn','hùng','dũng','khoa','nam','hải','quân','phát','thắng',
  'long','bình','đức','tú','sơn','bảo','khôi','trung','phúc','vinh',
  'kiên','quang','hoàng','an','đại','thiên','nhật','tân','huy','khánh',
  'cường','văn','lâm','đạt','khang','trí','phong','thành','duy','tiến',
  'nghĩa','hưng','lực','trực','phú','quý','tín','tâm','từ','nhân',
  'bắc','đông','tây','lộc','thọ','mạnh','vũ',
]);

function guessGender(name) {
  const lastOriginal = name.trim().toLowerCase().split(/\s+/).pop() ?? '';
  if (FEMALE_LAST.has(lastOriginal)) return 'female';
  if (MALE_LAST.has(lastOriginal)) return 'male';
  // không dấu fallback
  const lastNorm = lastOriginal.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  if (FEMALE_LAST.has(lastNorm)) return 'female';
  if (MALE_LAST.has(lastNorm)) return 'male';
  // hash fallback
  const hash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return hash % 2 === 0 ? 'female' : 'male';
}

app.get('/gender', (req, res) => {
  const name = (req.query.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  const gender = guessGender(name);
  const voice = gender === 'female' ? 'vi-VN-HoaiMyNeural' : 'vi-VN-NamMinhNeural';
  console.log(`[Gender] "${name}" → ${gender} → ${voice}`);
  res.json({ name, gender, voice });
});

app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   Edge Neural TTS Server đang chạy       ║');
  console.log(`║   http://localhost:${PORT}                   ║`);
  console.log('║                                          ║');
  console.log('║   Giọng:  vi-VN-HoaiMyNeural (nữ)       ║');
  console.log('║           vi-VN-NamMinhNeural (nam)      ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
  console.log('Test: curl "http://localhost:5500/health"');
  console.log('Dừng:  Ctrl+C');
});
