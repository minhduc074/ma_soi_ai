'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCaroStore } from '@/store/caroStore';
import { runCaroLoop } from '@/lib/caro/engine';
import { CaroPhase, CaroChatMessage, CaroApiLogEntry } from '@/lib/caro/types';
import CaroScene3D from '@/components/CaroScene3D';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const PHASE_LABELS: Record<CaroPhase, string> = {
  setup: '⚙️ Chuẩn bị',
  playing: '🎮 Đang chơi',
  ended: '🏁 Kết thúc',
};

/* ------------------------------------------------------------------ */
/*  MessageBubble                                                      */
/* ------------------------------------------------------------------ */
function MessageBubble({ msg }: { msg: CaroChatMessage }) {
  if (msg.type === 'system') {
    return (
      <div className="flex justify-center my-1.5">
        <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-200/90 text-[11px] px-3 py-1 rounded-full max-w-sm text-center">
          {msg.content}
        </div>
      </div>
    );
  }

  if (msg.type === 'thought') {
    return (
      <div className="my-1 ml-1">
        <div className="flex items-center gap-1 text-[11px] mb-0.5 flex-wrap">
          <span className="text-purple-400">{msg.expression || '🧠'}</span>
          <span className="font-semibold text-purple-400">{msg.sender}</span>
          <span className="text-gray-500 italic text-[10px]">nghĩ</span>
        </div>
        <div className="bg-purple-900/15 border border-purple-800/25 text-purple-200/70 text-xs px-2.5 py-1.5 rounded-lg rounded-tl-none italic ml-3 max-w-sm">
          {msg.content}
        </div>
      </div>
    );
  }

  // speech
  return (
    <div className="my-1 ml-1">
      <div className="flex items-center gap-1 text-[11px] mb-0.5 flex-wrap">
        <span className="text-blue-400">{msg.expression || '💬'}</span>
        <span className="font-semibold text-blue-400">{msg.sender}</span>
      </div>
      <div className="bg-gray-700/30 border border-gray-600/30 text-gray-100/90 text-xs px-2.5 py-1.5 rounded-lg rounded-tl-none ml-3 max-w-sm">
        {msg.content}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ApiLogPanel                                                        */
/* ------------------------------------------------------------------ */
function ApiLogPanel() {
  const apiLogs = useCaroStore((s) => s.apiLogs);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [apiLogs.length]);

  return (
    <div className="flex-1 overflow-y-auto rounded-xl bg-gray-900/75 border border-gray-700/50 px-3 py-2 text-[11px] font-mono">
      {apiLogs.length === 0 && (
        <div className="text-gray-600 text-center py-8">Chưa có API call nào</div>
      )}
      {apiLogs.map((log) => {
        const isExpanded = expandedId === log.id;
        const hasError = !!log.error;
        return (
          <div
            key={log.id}
            className={`mb-1.5 rounded-lg border transition-colors cursor-pointer ${
              hasError
                ? 'border-red-800/40 bg-red-900/10'
                : 'border-gray-700/30 bg-gray-800/20 hover:bg-gray-800/40'
            }`}
            onClick={() => setExpandedId(isExpanded ? null : log.id)}
          >
            <div className="flex items-center gap-2 px-2 py-1.5">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${hasError ? 'bg-red-500' : 'bg-green-500'}`} />
              <span className="text-gray-300 font-semibold truncate max-w-[80px]">
                {log.playerName}
              </span>
              <span className="text-gray-600">|</span>
              <span className="text-gray-400 truncate max-w-[70px]">
                {log.provider}
              </span>
              <span className="ml-auto text-gray-500 flex-shrink-0">
                {log.durationMs >= 1000
                  ? `${(log.durationMs / 1000).toFixed(1)}s`
                  : `${log.durationMs}ms`}
              </span>
              <span className="text-gray-600 flex-shrink-0">
                {isExpanded ? '▼' : '▶'}
              </span>
            </div>

            {isExpanded && (
              <div className="px-2 pb-2 space-y-1.5 border-t border-gray-700/20 mt-0.5 pt-1.5">
                <div>
                  <div className="text-gray-500 mb-0.5">System Prompt:</div>
                  <pre className="text-blue-300/70 whitespace-pre-wrap max-h-32 overflow-y-auto bg-black/30 rounded p-1.5 text-[10px]">
                    {log.systemPrompt}
                  </pre>
                </div>
                <div>
                  <div className="text-gray-500 mb-0.5">User Prompt:</div>
                  <pre className="text-cyan-300/70 whitespace-pre-wrap max-h-32 overflow-y-auto bg-black/30 rounded p-1.5 text-[10px]">
                    {log.userPrompt}
                  </pre>
                </div>
                {log.response && (
                  <div>
                    <div className="text-gray-500 mb-0.5">Response:</div>
                    <pre className="text-green-300/70 whitespace-pre-wrap max-h-32 overflow-y-auto bg-black/30 rounded p-1.5 text-[10px]">
                      {JSON.stringify(log.response, null, 2)}
                    </pre>
                  </div>
                )}
                {log.error && (
                  <div>
                    <div className="text-red-400 mb-0.5">Error:</div>
                    <pre className="text-red-300/70 whitespace-pre-wrap bg-black/30 rounded p-1.5 text-[10px]">
                      {log.error}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FilterBar                                                          */
/* ------------------------------------------------------------------ */
type FilterType = 'all' | 'speech' | 'thought' | 'system';

function FilterBar({
  active,
  onChange,
}: {
  active: FilterType;
  onChange: (f: FilterType) => void;
}) {
  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'Tất cả' },
    { key: 'speech', label: '💬' },
    { key: 'thought', label: '🧠' },
    { key: 'system', label: '📢' },
  ];

  return (
    <div className="flex gap-1">
      {filters.map((f) => (
        <button
          key={f.key}
          onClick={() => onChange(f.key)}
          className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${
            active === f.key
              ? 'bg-purple-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Caro Page                                                     */
/* ------------------------------------------------------------------ */
function CaroPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const players = useCaroStore((s) => s.players);
  const phase = useCaroStore((s) => s.phase);
  const currentPlayer = useCaroStore((s) => s.currentPlayer);
  const moveHistory = useCaroStore((s) => s.moveHistory);
  const winner = useCaroStore((s) => s.winner);
  const logs = useCaroStore((s) => s.logs);
  const isRunning = useCaroStore((s) => s.isRunning);
  const setRunning = useCaroStore((s) => s.setRunning);
  const speed = useCaroStore((s) => s.speed);
  const setSpeed = useCaroStore((s) => s.setSpeed);
  const thoughtProbability = useCaroStore((s) => s.thoughtProbability);
  const setThoughtProbability = useCaroStore((s) => s.setThoughtProbability);
  const ttsEnabled = useCaroStore((s) => s.ttsEnabled);
  const setTtsEnabled = useCaroStore((s) => s.setTtsEnabled);
  const apiLogs = useCaroStore((s) => s.apiLogs);
  const gameMode = useCaroStore((s) => s.gameMode);
  const initGame = useCaroStore((s) => s.initGame);

  const [filter, setFilter] = useState<FilterType>('all');
  const [activeTab, setActiveTab] = useState<'chat' | 'api'>('chat');
  const gameStartedRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Initialize game if no players
  useEffect(() => {
    if (!players) {
      // Default AI vs AI mode
      initGame(
        {
          id: 'alpha',
          name: 'Alpha',
          isHuman: false,
          model: 'google/gemma-3-27b-it:free',
          provider: 'openrouter',
          personality: 'Strategic thinker',
        },
        {
          id: 'beta',
          name: 'Beta',
          isHuman: false,
          model: 'google/gemma-3-27b-it:free',
          provider: 'openrouter',
          personality: 'Pattern recognizer',
        },
        'ai_vs_ai'
      );
    }
  }, [players, initGame]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  // Start game loop
  useEffect(() => {
    if (players && phase === 'playing' && !gameStartedRef.current) {
      gameStartedRef.current = true;
      runCaroLoop();
    }
  }, [players, phase]);

  // Cancel TTS
  useEffect(() => {
    if (!ttsEnabled && typeof window !== 'undefined') window.speechSynthesis?.cancel();
  }, [ttsEnabled]);
  useEffect(() => () => { if (typeof window !== 'undefined') window.speechSynthesis?.cancel(); }, []);

  const filteredLogs = filter === 'all' ? logs : logs.filter((m) => m.type === filter);
  const isGameOver = phase === 'ended';
  const currentPlayerObj = players?.find(p => p.color === currentPlayer);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-950 via-gray-950 to-amber-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-black/40 border-b border-gray-700/50">
        <div className="max-w-[1400px] mx-auto px-3 md:px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3">
            <h1 className="text-sm md:text-base font-bold">⭕ Caro AI</h1>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-800 text-amber-200">
              {PHASE_LABELS[phase]}
            </span>
            <span className="text-xs text-gray-400">Nước {moveHistory.length}</span>
            {currentPlayerObj && !isGameOver && (
              <span className={`text-xs px-2 py-0.5 rounded ${currentPlayer === 'X' ? 'bg-red-800' : 'bg-blue-800'}`}>
                {currentPlayerObj.expression} {currentPlayerObj.name} ({currentPlayer})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400">
              <span>🧠</span>
              <input
                type="range"
                min={0}
                max={100}
                step={10}
                value={thoughtProbability}
                onChange={(e) => setThoughtProbability(Number(e.target.value))}
                className="w-16 accent-blue-500"
              />
              <span className="w-8 text-[10px]">{thoughtProbability}%</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400">
              <span>⏱</span>
              <input
                type="range"
                min={500}
                max={5000}
                step={250}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="w-16 accent-purple-500"
              />
              <span className="w-8 text-[10px]">{(speed / 1000).toFixed(1)}s</span>
            </div>
            {!isGameOver && gameMode === 'ai_vs_ai' && (
              <button
                onClick={() => setRunning(!isRunning)}
                className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded-lg"
              >
                {isRunning ? '⏸' : '▶️'}
              </button>
            )}
            <button
              onClick={() => setTtsEnabled(!ttsEnabled)}
              className={`text-xs px-2 py-1 rounded-lg transition-colors ${
                ttsEnabled
                  ? 'bg-green-700 hover:bg-green-600 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              {ttsEnabled ? '🔊' : '🔇'}
            </button>
            <button
              onClick={() => router.push('/')}
              className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded-lg"
            >
              🏠
            </button>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="max-w-[1400px] mx-auto px-3 md:px-4 py-3 flex flex-col md:flex-row gap-3 md:gap-4 md:h-[calc(100vh-48px)]">
        {/* Left: 3D Scene */}
        <div className="md:flex-1 flex flex-col min-w-0 gap-2">
          <div className="w-full h-[50vh] md:flex-1 max-h-[600px] rounded-xl overflow-hidden border border-gray-700/50">
            <CaroScene3D />
          </div>

          {/* Player info bar */}
          <div className="flex gap-2 overflow-x-auto pb-1 flex-shrink-0">
            {players?.map((p) => (
              <div
                key={p.color}
                className={`flex-shrink-0 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs border transition-all ${
                  p.color === currentPlayer && !isGameOver
                    ? 'bg-yellow-900/40 border-yellow-500/60 ring-1 ring-yellow-500'
                    : 'bg-gray-800/50 border-gray-700/40'
                } ${p.color === winner ? 'ring-2 ring-green-500' : ''}`}
              >
                <span className="text-xl">{p.expression}</span>
                <div className="flex flex-col min-w-[60px]">
                  <span className="font-semibold text-white">{p.name}</span>
                  <span className={`text-[11px] font-mono ${p.color === 'X' ? 'text-red-400' : 'text-blue-400'}`}>
                    {p.color === 'X' ? '✕' : '○'} {p.color}
                  </span>
                  {p.isHuman && (
                    <span className="text-[9px] text-green-400">👤 Human</span>
                  )}
                </div>
                {p.color === winner && (
                  <span className="text-lg">🏆</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Chat / API Log */}
        <div className="md:w-[420px] flex-shrink-0 flex flex-col min-w-0 min-h-[200px] max-h-[45vh] md:max-h-none md:h-auto">
          <div className="flex items-center justify-between mb-1.5">
            {activeTab === 'chat' ? (
              <FilterBar active={filter} onChange={setFilter} />
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-400 font-semibold">📡 API Log</span>
                <span className="text-[10px] text-gray-600">{apiLogs.length} calls</span>
              </div>
            )}
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab('chat')}
                className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${
                  activeTab === 'chat'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                }`}
              >
                💬
              </button>
              <button
                onClick={() => setActiveTab('api')}
                className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${
                  activeTab === 'api'
                    ? 'bg-cyan-700 text-cyan-200'
                    : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                }`}
              >
                📡
              </button>
            </div>
          </div>

          {activeTab === 'api' ? (
            <ApiLogPanel />
          ) : (
            <div className="flex-1 overflow-y-auto rounded-xl bg-gray-900/75 border border-gray-700/50 px-3 py-2">
              {filteredLogs.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
              <div ref={chatEndRef} />
            </div>
          )}

          {isGameOver && (
            <div className="mt-3 space-y-2">
              <div className={`text-center py-3 rounded-xl font-bold text-lg border-2 ${
                winner === 'draw' 
                  ? 'bg-gray-900/50 border-gray-500 text-gray-300' 
                  : 'bg-yellow-900/50 border-yellow-500 text-yellow-300'
              }`}>
                {winner === 'draw' 
                  ? '🤝 Hòa!' 
                  : `🏆 ${players?.find(p => p.color === winner)?.name} thắng!`}
              </div>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => {
                    gameStartedRef.current = false;
                    if (players) {
                      initGame(players[0], players[1], gameMode);
                    }
                    runCaroLoop();
                  }}
                  className="text-xs bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded-lg transition-colors"
                >
                  🔄 Chơi lại
                </button>
                <button
                  onClick={() => router.push('/')}
                  className="text-xs bg-gray-600 hover:bg-gray-500 text-white px-3 py-1.5 rounded-lg transition-colors"
                >
                  🏠 Về trang chủ
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CaroPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Loading...</div>}>
      <CaroPageContent />
    </Suspense>
  );
}
