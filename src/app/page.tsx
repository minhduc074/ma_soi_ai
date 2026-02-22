'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { LLMProvider, PlayerConfig, SavedGame } from '@/lib/types';
import { BlackjackPlayerConfig } from '@/lib/blackjack/types';
import { XitoPlayerConfig } from '@/lib/xito/types';
import { useGameStore } from '@/store/gameStore';
import { useBlackjackStore } from '@/store/blackjackStore';
import { useXitoStore } from '@/store/xitoStore';

type GameMode = 'werewolf' | 'blackjack' | 'xito';

const PROVIDERS: { value: LLMProvider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'cliproxyapi', label: 'CLIProxyAPI' },
];

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
  anthropic: 'claude-sonnet-4-20250514',
  openrouter: 'google/gemini-2.0-flash-exp:free',
  cliproxyapi: 'gemini-2.0-flash',
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const DEFAULT_OPENROUTER_KEY =
  process.env.NEXT_PUBLIC_OPENROUTER_API_KEY ?? '';

const PRESET_PLAYERS: Array<{ name: string; model: string }> = [
  { name: 'Trinity',   model: 'arcee-ai/trinity-large-preview:free' },
  { name: 'Step-3.5',      model: 'stepfun/step-3.5-flash:free' },
  { name: 'GLM-4.5',    model: 'z-ai/glm-4.5-air:free' },
  { name: 'Trinity-mini',   model: 'arcee-ai/trinity-mini:free' },
  { name: 'Nemotron-3',  model: 'nvidia/nemotron-3-nano-30b-a3b:free' },
  { name: 'Meta-Llama',    model: 'meta-llama/llama-3.3-70b-instruct:free' },
  { name: 'gpt-120b',    model: 'openai/gpt-oss-120b:free' },
  { name: 'gpt-20b',   model: 'openai/gpt-oss-20b:free' },
];

const PERSONALITIES = [
  { trait: 'Nóng tính', desc: 'dễ nổi cáu khi bị nghi ngờ, hay nói to và dùng từ ngữ mạnh.' },
  { trait: 'Điềm tĩnh', desc: 'phân tích logic, luôn đòi hỏi bằng chứng rõ ràng trước khi kết luận.' },
  { trait: 'Nhút nhát', desc: 'hay sợ hãi, thường hùa theo số đông để được an toàn.' },
  { trait: 'Đa nghi', desc: 'không tin ai, luôn đặt câu hỏi vặn vẹo mọi người.' },
  { trait: 'Hài hước', desc: 'hay đùa cợt, thích châm chọc người khác dù trong hoàn cảnh căng thẳng.' },
  { trait: 'Lươn lẹo', desc: 'hay nói vòng vo, thích thao túng tâm lý người khác.' },
  { trait: 'Ngây thơ', desc: 'cả tin, dễ bị người khác thuyết phục và dắt mũi.' },
  { trait: 'Lạnh lùng', desc: 'ít nói, chỉ lên tiếng khi thực sự cần thiết và thường chốt hạ vấn đề.' },
  { trait: 'Nhiệt tình', desc: 'hay đứng ra lãnh đạo, thích chỉ đạo mọi người phải làm gì.' },
  { trait: 'Bốc đồng', desc: 'hay đưa ra quyết định vội vàng dựa trên cảm tính thay vì logic.' },
  { trait: 'Thâm hiểm', desc: 'thích đâm chọc sau lưng, bề ngoài tỏ ra thân thiện nhưng bên trong đầy toan tính.' },
  { trait: 'Ba phải', desc: 'gió chiều nào che chiều ấy, không có chính kiến rõ ràng.' }
];

function getRandomPersonality() {
  const p = PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];
  return `${p.trait} - ${p.desc}`;
}

function createDefaultPlayer(index: number): PlayerConfig {
  const preset = PRESET_PLAYERS[index];
  return {
    id: uid(),
    name: preset?.name ?? `Player ${index + 1}`,
    provider: 'openrouter',
    model: preset?.model ?? DEFAULT_MODELS['openrouter'],
    apiKey: DEFAULT_OPENROUTER_KEY,
    personality: getRandomPersonality(),
  };
}

export default function SetupPage() {
  const router = useRouter();
  const initGame = useGameStore((s) => s.initGame);
  const loadSavedGame = useGameStore((s) => s.loadSavedGame);
  const initBlackjackGame = useBlackjackStore((s) => s.initGame);
  const initXitoGame = useXitoStore((s) => s.initGame);

  const [gameMode, setGameMode] = useState<GameMode>('werewolf');
  const [players, setPlayers] = useState<PlayerConfig[]>(() =>
    Array.from({ length: PRESET_PLAYERS.length }, (_, i) => createDefaultPlayer(i)),
  );

  const [globalApiKey, setGlobalApiKey] = useState(DEFAULT_OPENROUTER_KEY);
  const [globalProvider, setGlobalProvider] = useState<LLMProvider>('openrouter');
  const [globalModel, setGlobalModel] = useState(DEFAULT_MODELS['openrouter']);
  const [globalBaseUrl, setGlobalBaseUrl] = useState('http://127.0.0.1:8317/v1');
  const [runInBackground, setRunInBackground] = useState(true);
  const [savedGames, setSavedGames] = useState<{name: string; data: SavedGame}[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updatePlayer = (id: string, patch: Partial<PlayerConfig>) => {
    setPlayers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  };

  const addPlayer = () => {
    if (players.length >= 12) return;
    setPlayers((prev) => [...prev, createDefaultPlayer(prev.length)]);
  };

  const removePlayer = (id: string) => {
    if (players.length <= 4) return;
    setPlayers((prev) => prev.filter((p) => p.id !== id));
  };

  const applyGlobal = () => {
    const randomNames = [
      'An', 'Bình', 'Châu', 'Dũng', 'Đạt', 'Giang', 'Hải', 'Hùng',
      'Khánh', 'Linh', 'Minh', 'Nam', 'Nga', 'Oanh', 'Phong', 'Quân',
      'Sơn', 'Thảo', 'Trang', 'Tuấn', 'Uyên', 'Vinh', 'Vy', 'Xuân',
      'Yến', 'Tùng', 'Hà', 'Lan', 'Cường', 'Phúc'
    ];
    
    // Shuffle names to get random unique ones
    const shuffledNames = [...randomNames].sort(() => 0.5 - Math.random());

    setPlayers((prev) =>
      prev.map((p, index) => ({
        ...p,
        name: shuffledNames[index % shuffledNames.length],
        provider: globalProvider,
        model: globalModel,
        apiKey: globalApiKey || p.apiKey,
        baseUrl: globalProvider === 'cliproxyapi' ? globalBaseUrl : undefined,
        personality: getRandomPersonality(),
      })),
    );
  };

  const startGame = () => {
    if (!globalApiKey) {
      alert('Vui lòng nhập API Key ở phần Cài đặt chung.');
      return;
    }
    // Apply global key to all players before starting
    const finalPlayers = players.map((p) => ({
      ...p,
      apiKey: p.apiKey || globalApiKey,
    }));
    initGame(finalPlayers);
    router.push(`/game?background=${runInBackground}`);
  };

  const startBlackjack = () => {
    if (!globalApiKey) {
      alert('Vui lòng nhập API Key ở phần Cài đặt chung.');
      return;
    }
    // For blackjack, first player is dealer, rest are players
    // Need at least 2 players (1 dealer + 1 player)
    if (players.length < 2) {
      alert('Cần ít nhất 2 người chơi (1 nhà cái + 1 người chơi)');
      return;
    }
    const finalPlayers: BlackjackPlayerConfig[] = players.slice(0, 5).map((p) => ({
      id: p.id,
      name: p.name,
      provider: p.provider,
      model: p.model,
      apiKey: p.apiKey || globalApiKey,
      baseUrl: p.baseUrl,
      personality: p.personality,
    }));
    initBlackjackGame(finalPlayers);
    router.push(`/blackjack?background=${runInBackground}`);
  };

  const startXito = () => {
    if (!globalApiKey) {
      alert('Vui lòng nhập API Key ở phần Cài đặt chung.');
      return;
    }
    // For Xito, need at least 2 players
    if (players.length < 2) {
      alert('Cần ít nhất 2 người chơi');
      return;
    }
    const finalPlayers: XitoPlayerConfig[] = players.slice(0, 6).map((p) => ({
      id: p.id,
      name: p.name,
      provider: p.provider,
      model: p.model,
      apiKey: p.apiKey || globalApiKey,
      baseUrl: p.baseUrl,
      personality: p.personality,
    }));
    initXitoGame(finalPlayers);
    router.push(`/xito?background=${runInBackground}`);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as SavedGame;
        if (!data.version || !data.players || !data.logs) {
          alert('File không hợp lệ!');
          return;
        }
        setSavedGames((prev) => [...prev, { name: file.name, data }]);
      } catch {
        alert('Không thể đọc file!');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const loadGame = (saved: SavedGame) => {
    loadSavedGame(saved);
    router.push('/game?replay=true');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-950 to-gray-900 text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold mb-2">
            {gameMode === 'werewolf' ? '🐺' : gameMode === 'blackjack' ? '🃏' : '🎰'}{' '}
            <span className="bg-gradient-to-r from-red-400 to-purple-400 bg-clip-text text-transparent">
              {gameMode === 'werewolf' ? 'Ma Sói AI' : gameMode === 'blackjack' ? 'Xì Dách AI' : 'Stud Poker AI'}
            </span>
          </h1>
          <p className="text-gray-400 text-lg">
            {gameMode === 'werewolf' 
              ? 'Các AI tự chơi Ma Sói với nhau – Quan sát cuộc chiến trí tuệ!'
              : gameMode === 'blackjack'
              ? 'Các AI chơi Xì Dách – Quan sát chiến thuật lừa gạt bằng biểu cảm!'
              : 'Các AI chơi Stud Poker (Xì Tố) – mở đầu 2 ngửa 1 úp, không đổi bài!'}
          </p>
          
          {/* Game Mode Selector */}
          <div className="flex justify-center gap-4 mt-6">
            <button
              onClick={() => setGameMode('werewolf')}
              className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                gameMode === 'werewolf'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-500/30'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              🐺 Ma Sói
            </button>
            <button
              onClick={() => setGameMode('blackjack')}
              className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                gameMode === 'blackjack'
                  ? 'bg-green-600 text-white shadow-lg shadow-green-500/30'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              🃏 Xì Dách
            </button>
            <button
              onClick={() => setGameMode('xito')}
              className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                gameMode === 'xito'
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              🎰 Stud Poker
            </button>
          </div>
        </div>

        {/* Global Settings */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 mb-6 border border-gray-700">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            ⚙️ Cài đặt chung
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Provider</label>
              <select
                value={globalProvider}
                onChange={(e) => {
                  const prov = e.target.value as LLMProvider;
                  setGlobalProvider(prov);
                  setGlobalModel(DEFAULT_MODELS[prov]);
                }}
                className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Model</label>
              <input
                value={globalModel}
                onChange={(e) => setGlobalModel(e.target.value)}
                className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
              />
            </div>
            {globalProvider === 'cliproxyapi' && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Base URL</label>
                <input
                  value={globalBaseUrl}
                  onChange={(e) => setGlobalBaseUrl(e.target.value)}
                  placeholder="http://127.0.0.1:8317/v1"
                  className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white border border-gray-600 focus:border-purple-500 focus:outline-none"
                />
              </div>
            )}
            <div className="flex items-end">
              <button
                onClick={applyGlobal}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Áp dụng cho tất cả
              </button>
            </div>
          </div>
        </div>

        {/* Player List */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 mb-6 border border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              👥 Người chơi ({players.length})
            </h2>
            <button
              onClick={addPlayer}
              disabled={players.length >= 12}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              + Thêm người chơi
            </button>
          </div>

          <div className="space-y-3">
            {players.map((player, idx) => (
              <div
                key={player.id}
                className="grid grid-cols-12 gap-3 items-center bg-gray-700/50 rounded-lg p-3 border border-gray-600"
              >
                <div className="col-span-1 text-center text-gray-400 font-mono text-sm">
                  #{idx + 1}
                </div>
                <div className="col-span-3">
                  <input
                    value={player.name}
                    onChange={(e) => updatePlayer(player.id, { name: e.target.value })}
                    placeholder="Tên"
                    className="w-full bg-gray-600 rounded px-2 py-1.5 text-white text-sm border border-gray-500 focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div className="col-span-3">
                  <select
                    value={player.provider}
                    onChange={(e) => {
                      const prov = e.target.value as LLMProvider;
                      updatePlayer(player.id, {
                        provider: prov,
                        model: DEFAULT_MODELS[prov],
                      });
                    }}
                    className="w-full bg-gray-600 rounded px-2 py-1.5 text-white text-sm border border-gray-500 focus:border-purple-500 focus:outline-none"
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-4">
                  <input
                    value={player.model}
                    onChange={(e) => updatePlayer(player.id, { model: e.target.value })}
                    placeholder="Model"
                    className="w-full bg-gray-600 rounded px-2 py-1.5 text-white text-sm border border-gray-500 focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div className="col-span-1 text-center">
                  <button
                    onClick={() => removePlayer(player.id)}
                    disabled={players.length <= 4}
                    className="text-red-400 hover:text-red-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
                    title="Xóa"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-500 mt-3">
            {gameMode === 'werewolf' 
              ? 'Tối thiểu 4, tối đa 12 người chơi. Vai trò sẽ được phân bổ tự động dựa trên số lượng.'
              : gameMode === 'blackjack'
              ? 'Tối thiểu 2, tối đa 5 người chơi. Người đầu tiên là Nhà Cái, còn lại là người chơi.'
              : 'Tối thiểu 2, tối đa 6 người chơi. Luật Stud: chia 3 lá đầu (2 ngửa + 1 úp), lật thêm mỗi vòng, không đổi bài.'}
          </p>
        </div>

        {/* Start Button */}
        <div className="text-center space-y-4">
          {/* Mode Selection */}
          <div className="flex items-center justify-center gap-4 mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="runMode"
                checked={runInBackground}
                onChange={() => setRunInBackground(true)}
                className="accent-purple-500"
              />
              <span className="text-sm text-gray-300">⚡ Chạy ngầm (nhanh, xem kết quả sau)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="runMode"
                checked={!runInBackground}
                onChange={() => setRunInBackground(false)}
                className="accent-purple-500"
              />
              <span className="text-sm text-gray-300">🎬 Trực tiếp (xem AI chơi realtime)</span>
            </label>
          </div>

          <button
            onClick={gameMode === 'werewolf' ? startGame : gameMode === 'blackjack' ? startBlackjack : startXito}
            className={`text-white text-xl font-bold py-4 px-12 rounded-xl shadow-lg transition-all transform hover:scale-105 ${
              gameMode === 'werewolf'
                ? 'bg-gradient-to-r from-red-600 to-purple-600 hover:from-red-500 hover:to-purple-500 shadow-purple-500/25'
                : gameMode === 'blackjack'
                ? 'bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-500 hover:to-teal-500 shadow-green-500/25'
                : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 shadow-purple-500/25'
            }`}
          >
            🎮 {gameMode === 'werewolf' ? 'Bắt đầu Ma Sói' : gameMode === 'blackjack' ? 'Bắt đầu Xì Dách' : 'Bắt đầu Stud Poker'}
          </button>
        </div>

        {/* Import Saved Games */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 mt-6 border border-gray-700">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            📂 Xem lại trận đấu đã lưu
          </h2>
          <div className="flex items-center gap-4 mb-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportFile}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              📁 Import file .json
            </button>
            <span className="text-sm text-gray-500">{savedGames.length} trận đã load</span>
          </div>
          {savedGames.length > 0 && (
            <div className="space-y-2">
              {savedGames.map((sg, idx) => (
                <div key={idx} className="flex items-center justify-between bg-gray-700/50 rounded-lg p-3 border border-gray-600">
                  <div>
                    <div className="text-sm font-semibold text-white">{sg.name}</div>
                    <div className="text-xs text-gray-400">
                      {sg.data.players.length} người chơi • Winner: {sg.data.winner === 'wolf' ? '🐺 Sói' : '👥 Dân'} • {new Date(sg.data.createdAt).toLocaleString('vi-VN')}
                    </div>
                  </div>
                  <button
                    onClick={() => loadGame(sg.data)}
                    className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-1.5 px-4 rounded-lg transition-colors"
                  >
                    ▶️ Xem lại
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
