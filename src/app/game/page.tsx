'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useGameStore } from '@/store/gameStore';
import { runGameLoop, runReplay } from '@/lib/game/engine';
import { ApiLogEntry, ChatMessage, Role, ROLE_INFO, GamePhase, DayVoteRecord, Player } from '@/lib/types';
import GameScene3D from '@/components/GameScene3D';
import GameScene2D from '@/components/GameScene2D';

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
  day_rebuttal: '🔥 Phản biện',
  day_voting: '🗳️ Bỏ phiếu',
  day_execution: '⚖️ Hành hình',
  day_last_words: '🪦 Lời cuối',
  hunter_shot: '🏹 Thợ săn kéo theo',
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
  isSpeaking,
  expression,
}: {
  player: Player;
  isActive: boolean;
  isSpeaking: boolean;
  expression?: string;
}) {
  const roleInfo = ROLE_INFO[player.role];
  const color = ROLE_HEX[player.role];
  const isDead = !player.alive;
  // Extract short model name
  const shortModel = player.model.split('/').pop()?.replace(':free', '') || player.model;

  return (
    <div
      className={`relative flex flex-col items-center gap-0.5 transition-all duration-300 ${
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
      {/* Model badge */}
      <span
        className="text-[8px] text-gray-500 max-w-[80px] truncate bg-gray-800/60 px-1.5 py-0.5 rounded-full"
        title={`${player.provider}: ${player.model}`}
      >
        {shortModel}
      </span>
      <span
        className="text-[9px] text-gray-400 max-w-[80px] text-center leading-tight line-clamp-2"
        title={player.personality}
      >
        {player.personality?.split(' - ')[0] || 'Bình thường'}
      </span>
      {isSpeaking && (
        <span className="text-[10px] text-green-400 animate-pulse" aria-label="Speaking" role="status">🔊</span>
      )}
      {expression && !isDead && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-30 animate-bounce">
          <div className="relative bg-white/90 text-gray-900 text-[11px] font-bold px-2 py-1 rounded-xl shadow-lg whitespace-nowrap border border-gray-200">
            {expression}
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white/90 rotate-45 border-b border-r border-gray-200"></div>
          </div>
        </div>
      )}
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
  const isSpeakingTTS = useGameStore((s) => s.isSpeakingTTS);
  const phase = useGameStore((s) => s.phase);
  const dayCount = useGameStore((s) => s.dayCount);
  const playerExpressions = useGameStore((s) => s.playerExpressions);
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
        const speaking = active && isSpeakingTTS;

        return (
          <div
            key={player.id}
            className={`absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ${
              active && isWhispering ? 'z-50' : 'z-20'
            }`}
            style={{ left: `${x}%`, top: `${y}%` }}
          >
          <PlayerNode player={player} isActive={active} isSpeaking={speaking} expression={playerExpressions[player.name]} />
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
  const shortModel = player?.model.split('/').pop()?.replace(':free', '') || '';
  const personality = player?.personality?.split(' - ')[0] || '';

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
          {personality && (
            <span className="text-[9px] text-purple-400/60 bg-purple-900/30 px-1 rounded">
              {personality}
            </span>
          )}
          {shortModel && (
            <span className="text-[8px] text-gray-500 bg-gray-800/50 px-1 rounded">
              {shortModel}
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
        <div className="flex items-center gap-1 text-[11px] mb-0.5 flex-wrap">
          <span className="text-red-400">🐺</span>
          <span className="font-semibold text-red-400">{msg.sender}</span>
          {personality && (
            <span className="text-[9px] text-red-400/60 bg-red-900/30 px-1 rounded">
              {personality}
            </span>
          )}
          {shortModel && (
            <span className="text-[8px] text-gray-500 bg-gray-800/50 px-1 rounded">
              {shortModel}
            </span>
          )}
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
      <div className="flex items-center gap-1 text-[11px] mb-0.5 flex-wrap">
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
        {personality && (
          <span className="text-[9px] text-blue-400/60 bg-blue-900/30 px-1 rounded">
            {personality}
          </span>
        )}
        {shortModel && (
          <span className="text-[8px] text-gray-500 bg-gray-800/50 px-1 rounded">
            {shortModel}
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
/*  VoteHistoryPanel                                                   */
/* ------------------------------------------------------------------ */
function VoteHistoryPanel() {
  const voteHistory = useGameStore((s) => s.voteHistory);
  const players = useGameStore((s) => s.players);

  if (voteHistory.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto rounded-xl bg-gray-900/75 border border-gray-700/50 px-3 py-2">
        <div className="text-gray-600 text-center py-8 text-xs">Chưa có lịch sử vote</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto rounded-xl bg-gray-900/75 border border-gray-700/50 px-3 py-2 text-[11px]">
      {voteHistory.map((record, idx) => {
        // Build tally
        const tally: Record<string, { count: number; voters: string[] }> = {};
        Object.entries(record.votes).forEach(([voterId, targetId]) => {
          if (!tally[targetId]) tally[targetId] = { count: 0, voters: [] };
          tally[targetId].count++;
          const voter = players.find((p) => p.id === voterId);
          tally[targetId].voters.push(voter?.name ?? '?');
        });
        const sortedTally = Object.entries(tally).sort((a, b) => b[1].count - a[1].count);

        return (
          <div key={idx} className="mb-3 p-2 rounded-lg bg-gray-800/40 border border-gray-700/30">
            <div className="font-semibold text-gray-300 mb-1.5">📅 Ngày {record.dayCount}</div>

            {/* Night deaths */}
            {record.nightDeaths.length > 0 && (
              <div className="text-red-300/80 mb-1">
                💀 Bị loại đêm:{' '}
                {record.nightDeaths.map((id) => {
                  const p = players.find((pl) => pl.id === id);
                  return p ? `${p.name} (${ROLE_INFO[p.role].emoji})` : id;
                }).join(', ')}
              </div>
            )}

            {/* Vote details */}
            <div className="space-y-1">
              {sortedTally.map(([targetId, data]) => {
                const target = players.find((p) => p.id === targetId);
                const isEliminated = record.eliminated === targetId;
                return (
                  <div key={targetId} className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded ${isEliminated ? 'bg-red-900/20 border border-red-800/30' : ''}`}>
                    <span className="text-orange-400 font-bold w-4 text-center">{data.count}</span>
                    <span className="text-gray-500">→</span>
                    <span className={`font-semibold ${isEliminated ? 'text-red-400' : 'text-gray-200'}`}>
                      {target?.name ?? '?'} {isEliminated ? '💀' : ''}
                    </span>
                    <span className="text-gray-600 ml-auto text-[10px]">
                      bởi: {data.voters.join(', ')}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Result */}
            {record.eliminated ? (
              <div className="text-red-400/80 mt-1 text-[10px]">
                ⚖️ {players.find((p) => p.id === record.eliminated)?.name} bị trục xuất
                ({ROLE_INFO[players.find((p) => p.id === record.eliminated)?.role ?? 'villager'].name})
              </div>
            ) : (
              <div className="text-gray-500 mt-1 text-[10px]">⚖️ Hòa, không ai bị loại</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

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
function GamePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const players = useGameStore((s) => s.players);
  const phase = useGameStore((s) => s.phase);
  const dayCount = useGameStore((s) => s.dayCount);
  const logs = useGameStore((s) => s.logs);
  const winner = useGameStore((s) => s.winner);
  const isRunning = useGameStore((s) => s.isRunning);
  const speed = useGameStore((s) => s.speed);
  const setSpeed = useGameStore((s) => s.setSpeed);
  const thoughtProbability = useGameStore((s) => s.thoughtProbability);
  const setThoughtProbability = useGameStore((s) => s.setThoughtProbability);
  const setRunning = useGameStore((s) => s.setRunning);
  const exportSavedGame = useGameStore((s) => s.exportSavedGame);
  const isReplayMode = useGameStore((s) => s.isReplayMode);
  const isReplaying = useGameStore((s) => s.isReplaying);
  const stopReplay = useGameStore((s) => s.stopReplay);
  const replayLogs = useGameStore((s) => s.replayLogs);
  const replayIndex = useGameStore((s) => s.replayIndex);

  const isSimulating = useGameStore((s) => s.isSimulating);
  const [filter, setFilter] = useState<FilterType>('all');
  const [activeTab, setActiveTab] = useState<'chat' | 'api' | 'votes'>('chat');
  const [use3D, setUse3D] = useState(false); // Default to 2D for better compatibility
  const ttsEnabled = useGameStore((s) => s.ttsEnabled);
  const setTtsEnabled = useGameStore((s) => s.setTtsEnabled);
  const isSpeakingTTS = useGameStore((s) => s.isSpeakingTTS);
  const isThinkingTTS = useGameStore((s) => s.isThinkingTTS);
  const apiLogs = useGameStore((s) => s.apiLogs);
  const gameStartedRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (players.length === 0) router.push('/');
  }, [players, router]);

  useEffect(() => {
    if (!isSimulating) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs.length, isSimulating]);

  // start game loop (ref guard prevents double-fire in Strict Mode)
  useEffect(() => {
    const isReplay = searchParams.get('replay') === 'true';
    const runBackground = searchParams.get('background') !== 'false';
    if (players.length > 0 && !gameStartedRef.current) {
      gameStartedRef.current = true;
      if (isReplay) {
        runReplay();
      } else {
        runGameLoop(runBackground);
      }
    }
  }, [players, searchParams]);

  const handleDownload = () => {
    const data = exportSavedGame();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `masoi_${new Date().toISOString().slice(0, 10)}_${data.winner}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
      {/* Simulation overlay */}
      {isSimulating && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4 animate-spin" style={{ animationDuration: '3s' }}>🐺</div>
            <div className="text-xl font-bold text-white mb-2">Đang mô phỏng trận đấu...</div>
            <div className="text-sm text-gray-400">Các AI đang chơi, vui lòng đợi kết quả</div>
            <div className="mt-4 text-xs text-gray-500">
              {logs.length} sự kiện đã xử lý
            </div>
          </div>
        </div>
      )}

      {/* Dim overlay — only when TTS is reading a thought, does NOT cover the chat panel */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-500 pointer-events-none ${
          isThinkingTTS ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-black/40 border-b border-gray-700/50">
        <div className="max-w-[1400px] mx-auto px-3 md:px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3">
            <h1 className="text-sm md:text-base font-bold">🐺 Ma Sói AI</h1>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium hidden sm:inline ${
                night
                  ? 'bg-indigo-800 text-indigo-200'
                  : 'bg-amber-800 text-amber-200'
              }`}
            >
              {PHASE_LABELS[phase]}
            </span>
            {isReplayMode && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-800 text-blue-200 hidden sm:inline">
                🎬 Replay {replayIndex}/{replayLogs.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400" title="Tỉ lệ sinh suy nghĩ (tiết kiệm token)">
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
              <span className="w-8 text-[10px]">
                {thoughtProbability}%
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400" title="Tốc độ game">
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
                onClick={() => {
                  if (isReplayMode) {
                    if (isReplaying) {
                      stopReplay();
                    } else {
                      runReplay();
                    }
                  } else {
                    setRunning(!isRunning);
                  }
                }}
                className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded-lg"
              >
                {isReplayMode ? (isReplaying ? '⏸' : '▶️') : (isRunning ? '⏸' : '▶️')}
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
      <div className="max-w-[1400px] mx-auto px-3 md:px-4 py-3 flex flex-col md:flex-row gap-3 md:gap-4 md:h-[calc(100vh-48px)]">
        {/* Left: Arena */}
        <div className="md:flex-1 flex flex-col items-center justify-center min-w-0 relative">
          <div className="w-full h-[40vh] md:h-full max-h-[600px]">
            {use3D ? <GameScene3D /> : <GameScene2D />}
          </div>
          
          {/* 2D/3D Toggle */}
          <button
            onClick={() => setUse3D(!use3D)}
            className="absolute top-4 right-4 z-20 px-3 py-1.5 rounded-lg bg-black/50 hover:bg-black/70 text-white text-sm font-medium backdrop-blur-sm border border-white/20 transition-all"
          >
            {use3D ? '🎮 3D' : '🖼️ 2D'}
          </button>
          
          {/* Overlay Info */}
          <div className="absolute top-4 left-4 z-10 pointer-events-none">
            <div className="text-4xl mb-1 drop-shadow-lg">{night ? '🌙' : '☀️'}</div>
            <div className="text-lg font-bold text-white drop-shadow-md">Ngày {dayCount}</div>
            <div
              className={`text-xs mt-1 px-3 py-1 rounded-full font-medium shadow-lg ${
                night
                  ? 'bg-indigo-900/80 text-indigo-200 border border-indigo-500/30'
                  : 'bg-amber-900/80 text-amber-200 border border-amber-500/30'
              }`}
            >
              {PHASE_LABELS[phase]}
            </div>
          </div>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4 text-xs text-gray-200 bg-black/40 backdrop-blur-sm px-4 py-2 rounded-full border border-white/10">
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

        {/* Right: Chat / API Log — z-50 so it appears above the dim overlay */}
        <div className="relative z-50 md:w-[420px] flex-shrink-0 flex flex-col min-w-0 min-h-[200px] max-h-[45vh] md:max-h-none md:h-auto">
          <div className="flex items-center justify-between mb-1.5">
            {activeTab === 'chat' ? (
              <FilterBar active={filter} onChange={setFilter} />
            ) : activeTab === 'api' ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-400 font-semibold">📡 API Log</span>
                <span className="text-[10px] text-gray-600">{apiLogs.length} calls</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-400 font-semibold">📊 Lịch sử Vote</span>
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
                onClick={() => setActiveTab('votes')}
                className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${
                  activeTab === 'votes'
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                }`}
              >
                📊
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
          ) : activeTab === 'votes' ? (
            <VoteHistoryPanel />
          ) : (
          <div className="flex-1 overflow-y-auto rounded-xl bg-gray-900/75 border border-gray-700/50 px-3 py-2">
            {filteredLogs.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            <div ref={chatEndRef} />
          </div>
          )}

          {winner && (
            <div className="mt-3 space-y-2">
              <div
                className={`text-center py-3 rounded-xl font-bold text-lg animate-pulse ${
                  winner === 'wolf'
                    ? 'bg-red-900/50 border-2 border-red-500 text-red-300'
                    : 'bg-green-900/50 border-2 border-green-500 text-green-300'
                }`}
              >
                {winner === 'wolf'
                  ? '🐺 BẦY SÓI THẮNG!'
                  : '👥 DÂN LÀNG THẮNG!'}
              </div>
              <div className="flex gap-2 justify-center">
                {!isReplayMode && (
                  <button
                    onClick={handleDownload}
                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors"
                  >
                    📥 Lưu trận đấu
                  </button>
                )}
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

/* ------------------------------------------------------------------ */
/*  Wrapper with Suspense boundary for useSearchParams                 */
/* ------------------------------------------------------------------ */
export default function GamePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-bounce">🐺</div>
          <div>Đang tải...</div>
        </div>
      </div>
    }>
      <GamePageContent />
    </Suspense>
  );
}
