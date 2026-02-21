'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore } from '@/store/gameStore';
import { runGameLoop } from '@/lib/game/engine';
import { ApiLogEntry, ChatMessage, Role, ROLE_INFO, GamePhase } from '@/lib/types';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const PHASE_LABELS: Record<GamePhase, string> = {
  setup: '⚙️ Chuẩn bị',
  night_start: '🌙 Đêm bắt đầu',
  night_wolf: '🐺 Sói hành động',
  night_seer: '🔮 Tiên tri soi',
  night_guard: '🛡️ Bảo vệ',
  night_witch: '🧙 Phù thủy',
  day_announcement: '☀️ Thông báo',
  day_discussion: '💬 Thảo luận',
  day_voting: '🗳️ Bỏ phiếu',
  day_execution: '⚖️ Hành hình',
  hunter_shot: '🏹 Thợ săn bắn',
  game_over: '🏁 Kết thúc',
};

const ROLE_HEX: Record<Role, string> = {
  werewolf: '#ef4444',
  villager: '#9ca3af',
  seer: '#a855f7',
  guard: '#3b82f6',
  witch: '#10b981',
  hunter: '#f59e0b',
};

function isNightPhase(phase: GamePhase) {
  return phase.startsWith('night');
}

/* ------------------------------------------------------------------ */
/*  PlayerNode — positioned on the circle                              */
/* ------------------------------------------------------------------ */
function PlayerNode({
  player,
  isActive,
}: {
  player: { id: string; name: string; role: Role; alive: boolean };
  isActive: boolean;
}) {
  const roleInfo = ROLE_INFO[player.role];
  const color = ROLE_HEX[player.role];
  const isDead = !player.alive;

  return (
    <div
      className={`flex flex-col items-center gap-0.5 transition-all duration-300 ${
        isActive ? 'scale-110' : 'scale-100'
      } ${isDead ? 'opacity-40 grayscale' : ''}`}
    >
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center text-xl transition-all duration-300"
        style={{
          border: `3px solid ${isDead ? '#4b5563' : color}`,
          backgroundColor: isDead ? '#1f2937' : `${color}20`,
          boxShadow:
            isActive && !isDead
              ? `0 0 16px ${color}90, 0 0 32px ${color}50`
              : 'none',
        }}
      >
        {isDead ? '💀' : roleInfo.emoji}
      </div>
      <span
        className={`text-xs font-semibold max-w-[72px] truncate ${
          isDead ? 'text-gray-600 line-through' : 'text-white'
        }`}
      >
        {player.name}
      </span>
      <span
        className="text-[10px] font-medium"
        style={{ color: isDead ? '#6b7280' : color }}
      >
        {roleInfo.name}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CircularArena                                                      */
/* ------------------------------------------------------------------ */
function CircularArena() {
  const players = useGameStore((s) => s.players);
  const activePlayerId = useGameStore((s) => s.activePlayerId);
  const isWhispering = useGameStore((s) => s.isWhispering);
  const phase = useGameStore((s) => s.phase);
  const dayCount = useGameStore((s) => s.dayCount);
  const night = isNightPhase(phase);

  const total = players.length;
  const radius = total <= 6 ? 36 : total <= 9 ? 38 : 40;

  return (
    <div className="relative w-full aspect-square max-w-[520px]">
      {/* Ring */}
      <div
        className="absolute inset-[12%] rounded-full border border-gray-700/30 transition-colors duration-1000"
        style={{
          boxShadow: night
            ? 'inset 0 0 60px rgba(99,102,241,0.08)'
            : 'inset 0 0 60px rgba(251,191,36,0.06)',
        }}
      />

      {/* Center info */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
        <div className="text-5xl mb-1">{night ? '🌙' : '☀️'}</div>
        <div className="text-base font-bold text-white/90">Ngày {dayCount}</div>
        <div
          className={`text-xs mt-1 px-3 py-0.5 rounded-full font-medium ${
            night
              ? 'bg-indigo-900/60 text-indigo-300'
              : 'bg-amber-900/60 text-amber-300'
          }`}
        >
          {PHASE_LABELS[phase]}
        </div>
      </div>

      {/* Players */}
      {players.map((player, index) => {
        const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
        const x = 50 + radius * Math.cos(angle);
        const y = 50 + radius * Math.sin(angle);
        const active = player.id === activePlayerId;

        return (
          <div
            key={player.id}
            className={`absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ${
              active && isWhispering ? 'z-50' : 'z-20'
            }`}
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <PlayerNode player={player} isActive={active} />
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MessageBubble — with role colors                                   */
/* ------------------------------------------------------------------ */
function MessageBubble({ msg }: { msg: ChatMessage }) {
  const player = useGameStore((s) =>
    s.players.find((p) => p.name === msg.sender),
  );
  const roleInfo = player ? ROLE_INFO[player.role] : null;
  const color = player ? ROLE_HEX[player.role] : null;

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
        <div className="flex items-center gap-1 text-[11px] mb-0.5">
          <span style={{ color: color ?? '#a855f7' }}>
            {roleInfo?.emoji ?? '🧠'}
          </span>
          <span
            className="font-semibold"
            style={{ color: color ?? '#a855f7' }}
          >
            {msg.sender}
          </span>
          {roleInfo && (
            <span
              className="opacity-50 text-[10px]"
              style={{ color: color ?? '#888' }}
            >
              {roleInfo.name}
            </span>
          )}
          <span className="text-gray-500 italic text-[10px]">nghĩ</span>
        </div>
        <div className="bg-purple-900/15 border border-purple-800/25 text-purple-200/70 text-xs px-2.5 py-1.5 rounded-lg rounded-tl-none italic ml-3 max-w-sm">
          {msg.content}
        </div>
      </div>
    );
  }

  if (msg.type === 'whisper') {
    return (
      <div className="my-1 ml-1">
        <div className="flex items-center gap-1 text-[11px] mb-0.5">
          <span className="text-red-400">🐺</span>
          <span className="font-semibold text-red-400">{msg.sender}</span>
          <span className="text-gray-500 italic text-[10px]">thì thầm</span>
        </div>
        <div className="bg-red-900/15 border border-red-800/20 text-red-200/70 text-xs px-2.5 py-1.5 rounded-lg rounded-tl-none ml-3 max-w-sm">
          {msg.content}
        </div>
      </div>
    );
  }

  if (msg.type === 'vote') {
    return (
      <div className="my-0.5 ml-1">
        <span className="bg-orange-500/10 border border-orange-500/15 text-orange-200/90 text-[11px] px-2.5 py-1 rounded-full inline-flex items-center gap-1">
          🗳️
          <span
            className="font-semibold"
            style={{ color: color ?? '#fb923c' }}
          >
            {msg.sender}
          </span>
          {roleInfo && (
            <span className="text-[10px] opacity-40">{roleInfo.emoji}</span>
          )}
          <span className="text-orange-300/70">{msg.content}</span>
        </span>
      </div>
    );
  }

  // speech
  return (
    <div className="my-1 ml-1">
      <div className="flex items-center gap-1 text-[11px] mb-0.5">
        <span style={{ color: color ?? '#60a5fa' }}>
          {roleInfo?.emoji ?? '💬'}
        </span>
        <span
          className="font-semibold"
          style={{ color: color ?? '#60a5fa' }}
        >
          {msg.sender}
        </span>
        {roleInfo && (
          <span
            className="opacity-40 text-[10px]"
            style={{ color: color ?? '#9ca3af' }}
          >
            {roleInfo.name}
          </span>
        )}
      </div>
      <div className="bg-gray-700/30 border border-gray-600/30 text-gray-100/90 text-xs px-2.5 py-1.5 rounded-lg rounded-tl-none ml-3 max-w-sm">
        {msg.content}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FilterBar                                                          */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/*  ApiLogPanel                                                        */
/* ------------------------------------------------------------------ */
function ApiLogPanel() {
  const apiLogs = useGameStore((s) => s.apiLogs);
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
            {/* Summary row */}
            <div className="flex items-center gap-2 px-2 py-1.5">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${hasError ? 'bg-red-500' : 'bg-green-500'}`} />
              <span className="text-gray-300 font-semibold truncate max-w-[80px]">
                {log.playerName}
              </span>
              <span className="text-gray-600">|</span>
              <span className="text-gray-400 truncate max-w-[70px]">
                {log.provider}/{log.model.split('/').pop()}
              </span>
              <span className="text-gray-600">|</span>
              <span className="text-gray-500">{log.phase}</span>
              <span className="ml-auto text-gray-500 flex-shrink-0">
                {log.durationMs >= 1000
                  ? `${(log.durationMs / 1000).toFixed(1)}s`
                  : `${log.durationMs}ms`}
              </span>
              <span className="text-gray-600 flex-shrink-0">
                {isExpanded ? '▼' : '▶'}
              </span>
            </div>

            {/* Expanded detail */}
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
type FilterType = 'all' | 'speech' | 'thought' | 'system' | 'vote' | 'whisper';

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
    { key: 'whisper', label: '🐺' },
    { key: 'vote', label: '🗳️' },
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
/*  Main Game Page                                                     */
/* ------------------------------------------------------------------ */
export default function GamePage() {
  const router = useRouter();
  const players = useGameStore((s) => s.players);
  const phase = useGameStore((s) => s.phase);
  const dayCount = useGameStore((s) => s.dayCount);
  const logs = useGameStore((s) => s.logs);
  const winner = useGameStore((s) => s.winner);
  const isRunning = useGameStore((s) => s.isRunning);
  const speed = useGameStore((s) => s.speed);
  const setSpeed = useGameStore((s) => s.setSpeed);
  const setRunning = useGameStore((s) => s.setRunning);
  const isWhisperingState = useGameStore((s) => s.isWhispering);
  const ttsSpeaking = useGameStore((s) => s.ttsSpeaking);

  const [filter, setFilter] = useState<FilterType>('all');
  const [showApiLog, setShowApiLog] = useState(false);
  const ttsEnabled = useGameStore((s) => s.ttsEnabled);
  const setTtsEnabled = useGameStore((s) => s.setTtsEnabled);
  const apiLogs = useGameStore((s) => s.apiLogs);
  const gameStartedRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (players.length === 0) router.push('/');
  }, [players, router]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  // start game loop (ref guard prevents double-fire in Strict Mode)
  useEffect(() => {
    if (players.length > 0 && !gameStartedRef.current) {
      gameStartedRef.current = true;
      runGameLoop();
    }
  }, [players]);

  // Cancel queued TTS when disabled or unmounted
  useEffect(() => {
    if (!ttsEnabled && typeof window !== 'undefined') window.speechSynthesis?.cancel();
  }, [ttsEnabled]);
  useEffect(() => () => { if (typeof window !== 'undefined') window.speechSynthesis?.cancel(); }, []);

  const filteredLogs =
    filter === 'all' ? logs : logs.filter((m) => m.type === filter);
  const night = isNightPhase(phase);

  return (
    <div
      className={`min-h-screen relative transition-colors duration-1000 ${
        night
          ? 'bg-gradient-to-br from-gray-950 via-indigo-950 to-gray-950'
          : 'bg-gradient-to-br from-gray-900 via-amber-950/20 to-gray-900'
      } text-white`}
    >
      {/* Dim overlay for TTS speaking */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-500 pointer-events-none ${
          ttsSpeaking ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-sm bg-black/40 border-b border-gray-700/30 lg:backdrop-blur-md lg:border-gray-700/50">
        <div className="max-w-[1400px] mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold">🐺 Ma Sói AI</h1>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                night
                  ? 'bg-indigo-800 text-indigo-200'
                  : 'bg-amber-800 text-amber-200'
              }`}
            >
              {PHASE_LABELS[phase]}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
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
              <span className="w-8 text-[10px]">
                {(speed / 1000).toFixed(1)}s
              </span>
            </div>
            {!winner && (
              <button
                onClick={() => setRunning(!isRunning)}
                className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded-lg"
              >
                {isRunning ? '⏸' : '▶️'}
              </button>
            )}
            <button
              onClick={() => setTtsEnabled(!ttsEnabled)}
              title={ttsEnabled ? 'Tắt TTS' : 'Bật TTS'}
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
      <div className="max-w-[1400px] mx-auto px-2 lg:px-4 py-2 lg:py-3 flex flex-col lg:flex-row gap-3 lg:gap-4 lg:h-[calc(100vh-48px)] overflow-y-auto lg:overflow-hidden">
        {/* Left: Arena */}
        <div className="flex-1 flex flex-col items-center justify-center min-w-0">
          <CircularArena />
          <div className="mt-3 flex gap-4 text-xs text-gray-400">
            <span>
              Sống:{' '}
              <b className="text-white">
                {players.filter((p) => p.alive).length}/{players.length}
              </b>
            </span>
            <span>
              🐺{' '}
              <b className="text-red-400">
                {players.filter((p) => p.alive && p.role === 'werewolf').length}
              </b>
            </span>
            <span>
              👥{' '}
              <b className="text-green-400">
                {players.filter((p) => p.alive && p.role !== 'werewolf').length}
              </b>
            </span>
          </div>
        </div>

        {/* Right: Chat / API Log */}
        <div className="w-full lg:w-[420px] flex-shrink-0 flex flex-col min-w-0 min-h-[400px] lg:min-h-0">
          <div className="flex items-center justify-between mb-1.5">
            {showApiLog ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-400 font-semibold">📡 API Log</span>
                <span className="text-[10px] text-gray-600">{apiLogs.length} calls</span>
              </div>
            ) : (
              <FilterBar active={filter} onChange={setFilter} />
            )}
            <button
              onClick={() => setShowApiLog(!showApiLog)}
              className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${
                showApiLog
                  ? 'bg-cyan-700 text-cyan-200'
                  : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
              }`}
            >
              {showApiLog ? '💬 Chat' : '📡 API'}
            </button>
          </div>

          {showApiLog ? (
            <ApiLogPanel />
          ) : (
          <div className="flex-1 overflow-y-auto rounded-xl bg-gray-900/75 border border-gray-700/50 px-3 py-2">
            {filteredLogs.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            <div ref={chatEndRef} />
          </div>
          )}

          {winner && (
            <div
              className={`mt-3 text-center py-3 rounded-xl font-bold text-lg animate-pulse ${
                winner === 'wolf'
                  ? 'bg-red-900/50 border-2 border-red-500 text-red-300'
                  : 'bg-green-900/50 border-2 border-green-500 text-green-300'
              }`}
            >
              {winner === 'wolf'
                ? '🐺 BẦY SÓI THẮNG!'
                : '👥 DÂN LÀNG THẮNG!'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
