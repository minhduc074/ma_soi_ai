'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useXitoStore } from '@/store/xitoStore';
import { runXitoLoop } from '@/lib/xito/engine';
import {
  XitoApiLogEntry,
  XitoChatMessage,
  XitoPhase,
  XitoPlayer,
  formatHand,
  evaluateHand,
  getAllCards,
  getVisibleCards,
  HAND_RANK_EMOJI,
  HAND_RANK_NAME,
} from '@/lib/xito/types';
import XitoScene3D from '@/components/XitoScene3D';

function getPublicXitoStats(player: XitoPlayer) {
  const visibleCards = getVisibleCards(player);
  const hiddenCount = (player.holeCard ? 1 : 0) + player.faceUpCards.filter((c) => !c.faceUp).length;
  const evalVisible = evaluateHand(visibleCards);
  return {
    visibleCount: visibleCards.length,
    hiddenCount,
    rank: evalVisible.rank,
  };
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const PHASE_LABELS: Record<XitoPhase, string> = {
  setup: '⚙️ Chuẩn bị',
  deal_initial: '🎴 Chia 3 lá đầu',
  betting_round_1: '💰 Cược 1',
  deal_4th: '🎴 Lật lá 4',
  betting_round_2: '💰 Cược 2',
  deal_5th: '🎴 Lật lá 5',
  betting_round_3: '💰 Cược 3',
  showdown: '🎯 Lật bài',
  round_end: '🔄 Kết thúc ván',
  game_over: '🏁 Kết thúc',
};

/* ------------------------------------------------------------------ */
/*  PlayerCard — hiển thị thông tin người chơi                         */
/* ------------------------------------------------------------------ */
function PlayerCard({
  player,
  isActive,
  isSpeaking,
}: {
  player: XitoPlayer;
  isActive: boolean;
  isSpeaking: boolean;
}) {
  const allCards = getAllCards(player);
  const handEval = evaluateHand(allCards);
  const publicCards = getVisibleCards(player);
  const privateCards = [
    ...(player.holeCard ? [{ ...player.holeCard, faceUp: true }] : []),
    ...player.faceUpCards.filter((c) => !c.faceUp).map((c) => ({ ...c, faceUp: true })),
  ];
  const shortModel = player.model.split('/').pop()?.replace(':free', '') || player.model;
  const isFolded = player.status === 'folded';
  const isAllIn = player.status === 'all_in';

  return (
    <div
      className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all duration-300 ${
        isActive ? 'scale-105 ring-2 ring-yellow-500' : ''
      } ${isFolded ? 'opacity-50' : ''} ${
        isAllIn ? 'bg-red-900/30' : 'bg-gray-800/50'
      }`}
    >
      {/* Expression & Name */}
      <div className="flex items-center gap-2">
        <span className="text-2xl">{player.expression}</span>
        <span className={`font-semibold ${isFolded ? 'text-gray-500 line-through' : 'text-white'}`}>
          {player.name}
        </span>
        {isSpeaking && (
          <span className="text-green-400 animate-pulse">🔊</span>
        )}
      </div>

      {/* Cards */}
      <div className="text-xs font-mono text-center leading-tight">
        <div className="text-cyan-300">
          {`Công khai: ${publicCards.length > 0 ? formatHand(publicCards) : 'chưa lật'}`}
        </div>
        <div className="text-purple-300/80">
          {`Riêng tư: ${privateCards.length > 0 ? formatHand(privateCards) : 'chưa có'}`}
        </div>
      </div>

      {/* Hand evaluation */}
      <div className="flex items-center gap-2 text-sm">
        {allCards.length >= 2 && !isFolded && (
          <span className="text-green-400">
            {HAND_RANK_EMOJI[handEval.rank]} {HAND_RANK_NAME[handEval.rank]}
          </span>
        )}
        {isFolded && <span className="text-red-400">❌ Bỏ bài</span>}
        {isAllIn && <span className="text-red-400">🔥 ALL-IN</span>}
      </div>

      {/* Chips & Bet */}
      <div className="text-xs text-gray-400">
        💰 {player.chips} chips
        {player.roundBet > 0 && (
          <span className="text-green-400"> | Cược: {player.roundBet}</span>
        )}
      </div>

      {/* Model */}
      <span className="text-[8px] text-gray-500 bg-gray-900/50 px-1.5 py-0.5 rounded">
        {shortModel}
      </span>

      {/* Personality */}
      {player.personality && (
        <span className="text-[9px] text-gray-400 text-center max-w-[100px] truncate">
          {player.personality.split(' - ')[0]}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MessageBubble                                                      */
/* ------------------------------------------------------------------ */
function MessageBubble({ msg }: { msg: XitoChatMessage }) {
  const players = useXitoStore((s) => s.players);
  const player = players.find((p) => p.name === msg.sender);
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
          <span className="text-purple-400">{msg.expression || '🧠'}</span>
          <span className="font-semibold text-purple-400">{msg.sender}</span>
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

  // speech
  return (
    <div className="my-1 ml-1">
      <div className="flex items-center gap-1 text-[11px] mb-0.5 flex-wrap">
        <span className="text-blue-400">{msg.expression || '💬'}</span>
        <span className="font-semibold text-blue-400">{msg.sender}</span>
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
/*  ApiLogPanel                                                        */
/* ------------------------------------------------------------------ */
function ApiLogPanel() {
  const apiLogs = useXitoStore((s) => s.apiLogs);
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
/*  Main Xito Page                                                     */
/* ------------------------------------------------------------------ */
function XitoPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const players = useXitoStore((s) => s.players);
  const phase = useXitoStore((s) => s.phase);
  const roundCount = useXitoStore((s) => s.roundCount);
  const pot = useXitoStore((s) => s.pot);
  const currentBet = useXitoStore((s) => s.currentBet);
  const logs = useXitoStore((s) => s.logs);
  const isRunning = useXitoStore((s) => s.isRunning);
  const speed = useXitoStore((s) => s.speed);
  const setSpeed = useXitoStore((s) => s.setSpeed);
  const thoughtProbability = useXitoStore((s) => s.thoughtProbability);
  const setThoughtProbability = useXitoStore((s) => s.setThoughtProbability);
  const setRunning = useXitoStore((s) => s.setRunning);
  const activePlayerId = useXitoStore((s) => s.activePlayerId);
  const isSpeakingTTS = useXitoStore((s) => s.isSpeakingTTS);
  const ttsEnabled = useXitoStore((s) => s.ttsEnabled);
  const setTtsEnabled = useXitoStore((s) => s.setTtsEnabled);
  const isSimulating = useXitoStore((s) => s.isSimulating);
  const apiLogs = useXitoStore((s) => s.apiLogs);

  const [filter, setFilter] = useState<FilterType>('all');
  const [activeTab, setActiveTab] = useState<'chat' | 'api'>('chat');
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

  // Start game loop
  useEffect(() => {
    const runBackground = searchParams.get('background') !== 'false';
    if (players.length > 0 && !gameStartedRef.current) {
      gameStartedRef.current = true;
      runXitoLoop(runBackground);
    }
  }, [players, searchParams]);

  // Cancel TTS
  useEffect(() => {
    if (!ttsEnabled && typeof window !== 'undefined') window.speechSynthesis?.cancel();
  }, [ttsEnabled]);
  useEffect(() => () => { if (typeof window !== 'undefined') window.speechSynthesis?.cancel(); }, []);

  const filteredLogs =
    filter === 'all' ? logs : logs.filter((m) => m.type === filter);

  const isGameOver = phase === 'game_over';

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-950 via-gray-950 to-purple-950 text-white">
      {/* Simulation overlay */}
      {isSimulating && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4 animate-bounce">🎰</div>
            <div className="text-xl font-bold text-white mb-2">Đang mô phỏng ván đấu...</div>
            <div className="text-sm text-gray-400">Các AI đang chơi Stud Poker (Xì Tố), vui lòng đợi kết quả</div>
            <div className="mt-4 text-xs text-gray-500">
              {logs.length} sự kiện đã xử lý
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-black/40 border-b border-gray-700/50">
        <div className="max-w-[1400px] mx-auto px-3 md:px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3">
            <h1 className="text-sm md:text-base font-bold">🎰 Stud Poker AI</h1>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-800 text-purple-200">
              {PHASE_LABELS[phase]}
            </span>
            <span className="text-xs text-gray-400">Ván {roundCount}</span>
            <span className="text-xs text-yellow-400 font-semibold">💰 Pot: {pot}</span>
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
            {!isGameOver && (
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
          <div className="w-full h-[40vh] md:flex-1 max-h-[540px] rounded-xl overflow-hidden">
            <XitoScene3D />
          </div>

          {/* Player chip bar */}
          <div className="flex gap-2 overflow-x-auto pb-1 flex-shrink-0">
            {players.map((p) => {
              const eliminated = p.chips <= 0 && p.status === 'folded';
              const isFolded = p.status === 'folded';
              const isAllIn = p.status === 'all_in';
              const cardStats = getPublicXitoStats(p);
              return (
                <div
                  key={p.id}
                  className={`flex-shrink-0 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs border transition-all ${
                    eliminated
                      ? 'opacity-40 bg-gray-800/30 border-gray-700/30'
                      : p.id === activePlayerId
                      ? 'bg-yellow-900/40 border-yellow-500/60 ring-1 ring-yellow-500'
                      : isFolded
                      ? 'opacity-60 bg-gray-800/30 border-gray-700/30'
                      : isAllIn
                      ? 'bg-red-900/40 border-red-500/60'
                      : 'bg-gray-800/50 border-gray-700/40'
                  }`}
                >
                  <span className="text-xl">{p.expression}</span>
                  <div className="flex flex-col min-w-[60px]">
                    <span className={`font-semibold ${eliminated || isFolded ? 'text-gray-500' : 'text-white'}`}>
                      {p.name}
                    </span>
                    <span className={`text-[11px] font-mono ${
                      eliminated ? 'text-red-500' : 
                      isFolded ? 'text-gray-500' :
                      'text-yellow-400'
                    }`}>
                      {eliminated ? '💸 Hết chips' : isFolded ? '❌ Bỏ bài' : `💰 ${p.chips}`}
                    </span>
                    <span className="text-[10px] text-cyan-200/80">
                      {`🃏 ${cardStats.visibleCount}${cardStats.hiddenCount > 0 ? ` + 🂠 ${cardStats.hiddenCount}` : ''} | ${HAND_RANK_EMOJI[cardStats.rank]}`}
                    </span>
                  </div>
                  {!eliminated && !isFolded && p.roundBet > 0 && (
                    <span className="text-[10px] text-green-400 bg-green-900/30 px-1.5 py-0.5 rounded">
                      Cược {p.roundBet}
                    </span>
                  )}
                  {isAllIn && (
                    <span className="text-[10px] text-red-400 bg-red-900/30 px-1.5 py-0.5 rounded">
                      🔥
                    </span>
                  )}
                </div>
              );
            })}
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
              <div className="text-center py-3 rounded-xl font-bold text-lg bg-purple-900/50 border-2 border-purple-500 text-purple-300">
                🏆 Game kết thúc!
              </div>
              <div className="flex gap-2 justify-center">
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
/*  Wrapper with Suspense boundary                                     */
/* ------------------------------------------------------------------ */
export default function XitoPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-bounce">🎰</div>
          <div>Đang tải...</div>
        </div>
      </div>
    }>
      <XitoPageContent />
    </Suspense>
  );
}
