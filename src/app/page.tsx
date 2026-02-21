'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LLMProvider, PlayerConfig } from '@/lib/types';
import { useGameStore } from '@/store/gameStore';

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

function createDefaultPlayer(index: number): PlayerConfig {
  const preset = PRESET_PLAYERS[index];
  return {
    id: uid(),
    name: preset?.name ?? `Player ${index + 1}`,
    provider: 'openrouter',
    model: preset?.model ?? DEFAULT_MODELS['openrouter'],
    apiKey: DEFAULT_OPENROUTER_KEY,
  };
}

export default function SetupPage() {
  const router = useRouter();
  const initGame = useGameStore((s) => s.initGame);

  const [players, setPlayers] = useState<PlayerConfig[]>(() =>
    Array.from({ length: PRESET_PLAYERS.length }, (_, i) => createDefaultPlayer(i)),
  );

  const [globalApiKey, setGlobalApiKey] = useState(DEFAULT_OPENROUTER_KEY);
  const [globalProvider, setGlobalProvider] = useState<LLMProvider>('openrouter');
  const [globalModel, setGlobalModel] = useState(DEFAULT_MODELS['openrouter']);
  const [globalBaseUrl, setGlobalBaseUrl] = useState('http://127.0.0.1:8317/v1');

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
    setPlayers((prev) =>
      prev.map((p) => ({
        ...p,
        provider: globalProvider,
        model: globalModel,
        apiKey: globalApiKey || p.apiKey,
        baseUrl: globalProvider === 'cliproxyapi' ? globalBaseUrl : undefined,
      })),
    );
  };

  const startGame = () => {
    const missing = players.filter((p) => !p.apiKey);
    if (missing.length > 0) {
      alert(`Vui lòng nhập API Key cho: ${missing.map((p) => p.name).join(', ')}`);
      return;
    }
    initGame(players);
    router.push('/game');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-950 to-gray-900 text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold mb-2">
            🐺 <span className="bg-gradient-to-r from-red-400 to-purple-400 bg-clip-text text-transparent">Ma Sói AI</span>
          </h1>
          <p className="text-gray-400 text-lg">Các AI tự chơi Ma Sói với nhau – Quan sát cuộc chiến trí tuệ!</p>
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
            <div>
              <label className="block text-sm text-gray-400 mb-1">API Key (chung)</label>
              <input
                type="password"
                value={globalApiKey}
                onChange={(e) => setGlobalApiKey(e.target.value)}
                placeholder="Nhập key chung cho tất cả…"
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
                <div className="col-span-2">
                  <input
                    value={player.name}
                    onChange={(e) => updatePlayer(player.id, { name: e.target.value })}
                    placeholder="Tên"
                    className="w-full bg-gray-600 rounded px-2 py-1.5 text-white text-sm border border-gray-500 focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div className="col-span-2">
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
                <div className="col-span-3">
                  <input
                    value={player.model}
                    onChange={(e) => updatePlayer(player.id, { model: e.target.value })}
                    placeholder="Model"
                    className="w-full bg-gray-600 rounded px-2 py-1.5 text-white text-sm border border-gray-500 focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div className="col-span-3">
                  <input
                    type="password"
                    value={player.apiKey}
                    onChange={(e) => updatePlayer(player.id, { apiKey: e.target.value })}
                    placeholder="API Key"
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
            Tối thiểu 4, tối đa 12 người chơi. Vai trò sẽ được phân bổ tự động dựa trên số lượng.
          </p>
        </div>

        {/* Start Button */}
        <div className="text-center">
          <button
            onClick={startGame}
            className="bg-gradient-to-r from-red-600 to-purple-600 hover:from-red-500 hover:to-purple-500 text-white text-xl font-bold py-4 px-12 rounded-xl shadow-lg shadow-purple-500/25 transition-all transform hover:scale-105"
          >
            🎮 Bắt đầu trò chơi
          </button>
        </div>
      </div>
    </div>
  );
}
