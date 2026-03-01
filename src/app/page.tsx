'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { LLMProvider, PlayerConfig, SavedGame } from '@/lib/types';
import { BlackjackPlayerConfig } from '@/lib/blackjack/types';
import { XitoPlayerConfig } from '@/lib/xito/types';
import { useGameStore } from '@/store/gameStore';
import { useBlackjackStore } from '@/store/blackjackStore';
import { useXitoStore } from '@/store/xitoStore';
import {
  Button,
  Card,
  Badge,
  Input,
  Select,
  Tabs,
  Toggle,
} from '@/components/ui';
import { GameCard, PlayerSetupCard } from '@/components/game';

/* ------------------------------------------------------------------ */
/*  Types & Constants                                                  */
/* ------------------------------------------------------------------ */
type GameMode = 'werewolf' | 'blackjack' | 'xito' | 'caro' | 'chess' | 'xiangqi';

const PROVIDERS: { value: string; label: string }[] = [
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

const PRESET_PLAYERS: Array<{ name: string; model: string }> = [
  { name: 'Quân', model: 'arcee-ai/trinity-large-preview:free' },
  { name: 'Uyên', model: 'arcee-ai/trinity-large-preview:free' },
  { name: 'Xuân', model: 'google/gemma-3-27b-it:free' },
  { name: 'Vy', model: 'google/gemma-3-27b-it:free' },
  { name: 'Minh', model: 'openai/gpt-oss-120b:free' },
  { name: 'Hà', model: 'liquid/lfm-2.5-1.2b-thinking:free' },
  { name: 'Trang', model: 'liquid/lfm-2.5-1.2b-instruct:free' },
  { name: 'Tùng', model: 'nvidia/nemotron-3-nano-30b-a3b:free' },
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
  { trait: 'Ba phải', desc: 'gió chiều nào che chiều ấy, không có chính kiến rõ ràng.' },
];

const GAMES = [
  {
    id: 'werewolf' as GameMode,
    title: 'Ma Sói',
    emoji: '🐺',
    description: 'Game suy luận xã hội kinh điển - Dân làng vs Người sói. AI đóng vai, tranh luận, và bỏ phiếu loại nhau!',
    color: 'red' as const,
    players: '4-12',
    features: ['6 vai trò', 'Tranh luận AI', 'Vote loại', 'Chiến thuật'],
  },
  {
    id: 'blackjack' as GameMode,
    title: 'Xì Dách',
    emoji: '🃏',
    description: 'Blackjack kiểu Việt Nam với chiến thuật lừa gạt. AI dùng biểu cảm để bluff!',
    color: 'green' as const,
    players: '2-5',
    features: ['Xì Bàng 3x', 'Biểu cảm bluff', 'Ngũ Linh', 'Đối kháng AI'],
  },
  {
    id: 'xito' as GameMode,
    title: 'Xì Tố',
    emoji: '🎰',
    description: '7-Card Stud Poker với luật Việt - 32 lá, chia 3 lá đầu, lật dần mỗi vòng cược.',
    color: 'purple' as const,
    players: '2-6',
    features: ['Stud Poker', 'Bet/Raise/All-in', 'Bluff AI', 'Tâm lý chiến'],
  },
  {
    id: 'caro' as GameMode,
    title: 'Caro',
    emoji: '⭕',
    description: 'Gomoku 5 quân trên bàn 15x15. AI suy nghĩ chiến thuật để đạt 5 liên tiếp!',
    color: 'amber' as const,
    players: '2',
    features: ['15x15 board', 'AI vs AI', 'Human vs AI', '3D Scene'],
  },
  {
    id: 'chess' as GameMode,
    title: 'Cờ Vua',
    emoji: '♟️',
    description: 'Chess kinh điển với AI đấu nhau. Xem AI tính toán nước cờ và bình luận!',
    color: 'slate' as const,
    players: '2',
    features: ['Chess.js', 'AI vs AI', 'Human vs AI', '3D Board'],
  },
  {
    id: 'xiangqi' as GameMode,
    title: 'Cờ Tướng',
    emoji: '🐉',
    description: 'Chinese Chess với AI Việt hóa. Sông Hán Sở, các quân tướng chiến đấu!',
    color: 'rose' as const,
    players: '2',
    features: ['Xiangqi', 'AI vs AI', 'Human vs AI', 'Tướng/Sĩ/Tượng'],
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

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
    personality: getRandomPersonality(),
  };
}

const RANDOM_NAMES = [
  'An', 'Bình', 'Châu', 'Dũng', 'Đạt', 'Giang', 'Hải', 'Hùng',
  'Khánh', 'Linh', 'Minh', 'Nam', 'Nga', 'Oanh', 'Phong', 'Quân',
  'Sơn', 'Thảo', 'Trang', 'Tuấn', 'Uyên', 'Vinh', 'Vy', 'Xuân',
  'Yến', 'Tùng', 'Hà', 'Lan', 'Cường', 'Phúc',
];

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */
export default function HomePage() {
  const router = useRouter();
  const initGame = useGameStore((s) => s.initGame);
  const loadSavedGame = useGameStore((s) => s.loadSavedGame);
  const initBlackjackGame = useBlackjackStore((s) => s.initGame);
  const initXitoGame = useXitoStore((s) => s.initGame);

  // State
  const [step, setStep] = useState<'select' | 'config'>('select');
  const [gameMode, setGameMode] = useState<GameMode>('werewolf');
  const [players, setPlayers] = useState<PlayerConfig[]>(() =>
    Array.from({ length: PRESET_PLAYERS.length }, (_, i) => createDefaultPlayer(i))
  );
  const [globalProvider, setGlobalProvider] = useState<LLMProvider>('openrouter');
  const [globalModel, setGlobalModel] = useState(DEFAULT_MODELS['openrouter']);
  const [globalBaseUrl, setGlobalBaseUrl] = useState('http://127.0.0.1:8317/v1');
  const [runInBackground, setRunInBackground] = useState(false);
  const [savedGames, setSavedGames] = useState<{ name: string; data: SavedGame }[]>([]);
  const [activeTab, setActiveTab] = useState<'players' | 'replay'>('players');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handlers
  const updatePlayer = (id: string, patch: Partial<PlayerConfig>) => {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const addPlayer = () => {
    const maxPlayers = gameMode === 'werewolf' ? 12 : gameMode === 'blackjack' ? 5 : 6;
    if (players.length >= maxPlayers) return;
    setPlayers((prev) => [...prev, createDefaultPlayer(prev.length)]);
  };

  const removePlayer = (id: string) => {
    const minPlayers = gameMode === 'werewolf' ? 4 : 2;
    if (players.length <= minPlayers) return;
    setPlayers((prev) => prev.filter((p) => p.id !== id));
  };

  const applyGlobal = () => {
    const shuffledNames = [...RANDOM_NAMES].sort(() => 0.5 - Math.random());
    setPlayers((prev) =>
      prev.map((p, index) => ({
        ...p,
        name: shuffledNames[index % shuffledNames.length],
        provider: globalProvider,
        model: globalModel,
        baseUrl: globalProvider === 'cliproxyapi' ? globalBaseUrl : undefined,
        personality: getRandomPersonality(),
      }))
    );
  };

  const startGame = () => {
    switch (gameMode) {
      case 'werewolf':
        initGame(players);
        router.push(`/game?background=${runInBackground}`);
        break;
      case 'blackjack':
        if (players.length < 2) {
          alert('Cần ít nhất 2 người chơi');
          return;
        }
        initBlackjackGame(
          players.slice(0, 5).map((p) => ({
            id: p.id,
            name: p.name,
            provider: p.provider,
            model: p.model,
            baseUrl: p.baseUrl,
            personality: p.personality,
          })) as BlackjackPlayerConfig[]
        );
        router.push(`/blackjack?background=${runInBackground}`);
        break;
      case 'xito':
        if (players.length < 2) {
          alert('Cần ít nhất 2 người chơi');
          return;
        }
        initXitoGame(
          players.slice(0, 6).map((p) => ({
            id: p.id,
            name: p.name,
            provider: p.provider,
            model: p.model,
            baseUrl: p.baseUrl,
            personality: p.personality,
          })) as XitoPlayerConfig[]
        );
        router.push(`/xito?background=${runInBackground}`);
        break;
      case 'caro':
        router.push('/caro');
        break;
      case 'chess':
        router.push('/chess');
        break;
      case 'xiangqi':
        router.push('/xiangqi');
        break;
    }
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

  const selectedGame = GAMES.find((g) => g.id === gameMode)!;
  const isBoardGame = ['caro', 'chess', 'xiangqi'].includes(gameMode);
  const minPlayers = gameMode === 'werewolf' ? 4 : 2;
  const maxPlayers = gameMode === 'werewolf' ? 12 : gameMode === 'blackjack' ? 5 : isBoardGame ? 2 : 6;

  // Render: Game Selection
  if (step === 'select') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-950 to-gray-900">
        <div className="max-w-5xl mx-auto px-4 py-12">
          {/* Hero */}
          <div className="text-center mb-12">
            <h1 className="text-6xl font-bold mb-4">
              <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-red-400 bg-clip-text text-transparent">
                AI Chơi Game
              </span>
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Xem các AI đối kháng nhau trong các trò chơi kinh điển Việt Nam.
              Chiến thuật, tâm lý, và sự sáng tạo không giới hạn!
            </p>
          </div>

          {/* Game Cards */}
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {GAMES.map((game) => (
              <GameCard
                key={game.id}
                {...game}
                href="#"
                isSelected={gameMode === game.id}
                onClick={() => setGameMode(game.id)}
              />
            ))}
          </div>

          {/* Start Button */}
          <div className="text-center">
            {isBoardGame ? (
              <Button
                size="lg"
                onClick={() => startGame()}
                className="text-lg px-12 py-4"
              >
                Chơi ngay {selectedGame.emoji} {selectedGame.title} →
              </Button>
            ) : (
              <Button
                size="lg"
                onClick={() => setStep('config')}
                className="text-lg px-12 py-4"
              >
                Tiếp tục với {selectedGame.emoji} {selectedGame.title} →
              </Button>
            )}
          </div>

          {/* Quick Replay */}
          {savedGames.length > 0 && (
            <Card className="mt-12" padding="lg">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                📂 Trận đấu đã lưu
              </h2>
              <div className="space-y-2">
                {savedGames.map((sg, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3"
                  >
                    <div>
                      <div className="font-semibold">{sg.name}</div>
                      <div className="text-xs text-gray-500">
                        {sg.data.players.length} người chơi •{' '}
                        {new Date(sg.data.createdAt).toLocaleString('vi-VN')}
                      </div>
                    </div>
                    <Button size="sm" onClick={() => loadGame(sg.data)}>
                      ▶️ Xem lại
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    );
  }

  // Render: Configuration
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-950 to-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => setStep('select')}
            className="text-gray-400 hover:text-white transition-colors flex items-center gap-2"
          >
            ← Chọn game khác
          </button>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <span className="text-4xl">{selectedGame.emoji}</span>
            <span className={`bg-gradient-to-r ${
              selectedGame.color === 'red'
                ? 'from-red-400 to-pink-400'
                : selectedGame.color === 'green'
                ? 'from-green-400 to-emerald-400'
                : 'from-purple-400 to-indigo-400'
            } bg-clip-text text-transparent`}>
              {selectedGame.title}
            </span>
          </h1>
          <div className="w-24" /> {/* Spacer */}
        </div>

        {/* Tabs */}
        <Tabs
          tabs={[
            { id: 'players', label: '👥 Người chơi', icon: undefined },
            { id: 'replay', label: '📂 Replay', icon: undefined },
          ]}
          active={activeTab}
          onChange={(id) => setActiveTab(id as 'players' | 'replay')}
          className="mb-6"
        />

        {/* Tab: Players */}
        {activeTab === 'players' && (
          <Card padding="lg" className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                Người chơi ({players.length}/{maxPlayers})
              </h2>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={applyGlobal}>
                  🎲 Random All
                </Button>
                <Button
                  size="sm"
                  onClick={addPlayer}
                  disabled={players.length >= maxPlayers}
                >
                  + Thêm
                </Button>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              {players.map((player, idx) => (
                <PlayerSetupCard
                  key={player.id}
                  index={idx}
                  name={player.name}
                  model={player.model}
                  personality={player.personality || ''}
                  provider={player.provider}
                  onNameChange={(name) => updatePlayer(player.id, { name })}
                  onRemove={
                    players.length > minPlayers
                      ? () => removePlayer(player.id)
                      : undefined
                  }
                />
              ))}
            </div>

            <p className="text-xs text-gray-500">
              {gameMode === 'werewolf'
                ? 'Vai trò được phân bổ tự động: Sói, Tiên tri, Bảo vệ, Phù thủy, Thợ săn, Dân làng.'
                : gameMode === 'blackjack'
                ? 'Người đầu tiên là Nhà Cái, còn lại là người chơi.'
                : 'Chia 3 lá đầu (2 ngửa + 1 úp), lật thêm mỗi vòng cược.'}
            </p>
          </Card>
        )}

        {/* Tab: Replay */}
        {activeTab === 'replay' && (
          <Card padding="lg" className="mb-6">
            <h2 className="text-lg font-semibold mb-4">Xem lại trận đấu</h2>

            <div className="flex items-center gap-4 mb-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportFile}
                className="hidden"
              />
              <Button
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                📁 Import file .json
              </Button>
              <span className="text-sm text-gray-500">
                {savedGames.length} trận đã load
              </span>
            </div>

            {savedGames.length > 0 ? (
              <div className="space-y-2">
                {savedGames.map((sg, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3"
                  >
                    <div>
                      <div className="font-semibold">{sg.name}</div>
                      <div className="text-xs text-gray-500">
                        {sg.data.players.length} người chơi • Winner:{' '}
                        {sg.data.winner === 'wolf' ? '🐺 Sói' : '👥 Dân'} •{' '}
                        {new Date(sg.data.createdAt).toLocaleString('vi-VN')}
                      </div>
                    </div>
                    <Button size="sm" onClick={() => loadGame(sg.data)}>
                      ▶️ Xem lại
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">
                Chưa có trận đấu nào được import
              </div>
            )}
          </Card>
        )}

        {/* Run Mode & Start */}
        <Card padding="lg" className="text-center">
          <div className="flex items-center justify-center gap-6 mb-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="runMode"
                checked={!runInBackground}
                onChange={() => setRunInBackground(false)}
                className="accent-purple-500"
              />
              <div className="text-left">
                <div className="text-sm font-medium">🎬 Trực tiếp</div>
                <div className="text-xs text-gray-500">Xem AI chơi realtime</div>
              </div>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="runMode"
                checked={runInBackground}
                onChange={() => setRunInBackground(true)}
                className="accent-purple-500"
              />
              <div className="text-left">
                <div className="text-sm font-medium">⚡ Chạy ngầm</div>
                <div className="text-xs text-gray-500">Nhanh, xem kết quả sau</div>
              </div>
            </label>
          </div>

          <Button size="lg" onClick={startGame} className="text-lg px-12">
            🎮 Bắt đầu {selectedGame.title}
          </Button>
        </Card>
      </div>
    </div>
  );
}
