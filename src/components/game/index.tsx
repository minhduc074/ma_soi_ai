'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { Card, Badge, Slider, Toggle, Button, Tabs } from '@/components/ui';
import Link from 'next/link';

/* ------------------------------------------------------------------ */
/*  GameLayout - Main layout for all game pages                        */
/* ------------------------------------------------------------------ */
export interface GameLayoutProps {
  children: ReactNode;
  title: string;
  emoji: string;
  color: string; // Tailwind color class like 'red' | 'green' | 'purple'
  sidebar?: ReactNode;
  controls?: ReactNode;
}

export function GameLayout({
  children,
  title,
  emoji,
  color,
  sidebar,
  controls,
}: GameLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const colorClasses = {
    red: {
      gradient: 'from-red-600 to-pink-600',
      text: 'text-red-400',
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
    },
    green: {
      gradient: 'from-green-600 to-emerald-600',
      text: 'text-green-400',
      bg: 'bg-green-500/10',
      border: 'border-green-500/30',
    },
    purple: {
      gradient: 'from-purple-600 to-indigo-600',
      text: 'text-purple-400',
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/30',
    },
    blue: {
      gradient: 'from-blue-600 to-cyan-600',
      text: 'text-blue-400',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/30',
    },
  }[color] || {
    gradient: 'from-gray-600 to-gray-700',
    text: 'text-gray-400',
    bg: 'bg-gray-500/10',
    border: 'border-gray-500/30',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-950 to-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gray-900/80 backdrop-blur-xl border-b border-gray-800">
        <div className="max-w-[1800px] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-gray-400 hover:text-white transition-colors"
            >
              ← Trang chủ
            </Link>
            <div className="h-6 w-px bg-gray-700" />
            <h1 className="text-lg font-bold flex items-center gap-2">
              <span className="text-2xl">{emoji}</span>
              <span className={`bg-gradient-to-r ${colorClasses.gradient} bg-clip-text text-transparent`}>
                {title}
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {controls}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors lg:hidden"
            >
              {sidebarOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-[1800px] mx-auto flex">
        {/* Game Area */}
        <main className="flex-1 p-4 min-h-[calc(100vh-3.5rem)]">
          {children}
        </main>

        {/* Sidebar */}
        {sidebar && (
          <aside
            className={`w-[380px] border-l border-gray-800 bg-gray-900/50 transition-all duration-300 ${
              sidebarOpen ? 'translate-x-0' : 'translate-x-full'
            } fixed lg:relative right-0 top-14 h-[calc(100vh-3.5rem)] lg:translate-x-0 z-40`}
          >
            {sidebar}
          </aside>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  GameControlBar - Speed, TTS, Thought controls                      */
/* ------------------------------------------------------------------ */
export interface GameControlBarProps {
  speed: number;
  onSpeedChange: (speed: number) => void;
  ttsEnabled: boolean;
  onTtsChange: (enabled: boolean) => void;
  thoughtProbability: number;
  onThoughtChange: (prob: number) => void;
  isPaused?: boolean;
  onPauseToggle?: () => void;
  onReset?: () => void;
}

export function GameControlBar({
  speed,
  onSpeedChange,
  ttsEnabled,
  onTtsChange,
  thoughtProbability,
  onThoughtChange,
  isPaused,
  onPauseToggle,
  onReset,
}: GameControlBarProps) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      {/* Playback Controls */}
      <div className="flex items-center gap-2">
        {onPauseToggle && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onPauseToggle}
            className="!px-2"
          >
            {isPaused ? '▶️' : '⏸️'}
          </Button>
        )}
        {onReset && (
          <Button variant="ghost" size="sm" onClick={onReset} className="!px-2">
            🔄
          </Button>
        )}
      </div>

      {/* Speed */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Tốc độ</span>
        <input
          type="range"
          min={100}
          max={5000}
          step={100}
          value={speed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
          className="w-20 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
        />
        <span className="text-xs font-mono text-purple-400 w-12">
          {(speed / 1000).toFixed(1)}s
        </span>
      </div>

      {/* TTS */}
      <Toggle
        label="🔊"
        checked={ttsEnabled}
        onChange={onTtsChange}
        size="sm"
      />

      {/* Thought */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">🧠</span>
        <input
          type="range"
          min={0}
          max={100}
          step={10}
          value={thoughtProbability}
          onChange={(e) => onThoughtChange(Number(e.target.value))}
          className="w-16 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
        />
        <span className="text-xs font-mono text-purple-400 w-8">
          {thoughtProbability}%
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ChatPanel - Reusable chat/log panel                                */
/* ------------------------------------------------------------------ */
export type MessageType = 'system' | 'speech' | 'thought' | 'whisper' | 'vote';

export interface ChatMessage {
  id: string;
  type: MessageType;
  sender?: string;
  content: string;
  expression?: string;
  color?: string;
  meta?: {
    role?: string;
    model?: string;
    personality?: string;
  };
}

export interface ChatPanelProps {
  messages: ChatMessage[];
  title?: string;
  filter?: MessageType | 'all';
  onFilterChange?: (filter: MessageType | 'all') => void;
  className?: string;
}

export function ChatPanel({
  messages,
  title = '💬 Trò chuyện',
  filter = 'all',
  onFilterChange,
  className = '',
}: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const filteredMessages =
    filter === 'all'
      ? messages
      : messages.filter((m) => m.type === filter);

  const filters: Array<{ id: MessageType | 'all'; label: string }> = [
    { id: 'all', label: 'Tất cả' },
    { id: 'speech', label: '💬' },
    { id: 'thought', label: '🧠' },
    { id: 'system', label: '📢' },
  ];

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/50">
        <span className="text-sm font-semibold text-gray-300">{title}</span>
        {onFilterChange && (
          <div className="flex gap-1">
            {filters.map((f) => (
              <button
                key={f.id}
                onClick={() => onFilterChange(f.id)}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  filter === f.id
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-500 hover:text-white hover:bg-gray-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredMessages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const { type, sender, content, expression, color, meta } = message;

  if (type === 'system') {
    return (
      <div className="flex justify-center my-1.5">
        <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-200/90 text-[11px] px-3 py-1 rounded-full max-w-sm text-center">
          {content}
        </div>
      </div>
    );
  }

  if (type === 'thought') {
    return (
      <div className="my-1 ml-1">
        <div className="flex items-center gap-1 text-[11px] mb-0.5 flex-wrap">
          <span className="text-purple-400">{expression || '🧠'}</span>
          <span className="font-semibold text-purple-400">{sender}</span>
          {meta?.personality && (
            <Badge variant="purple" size="sm">
              {meta.personality}
            </Badge>
          )}
          {meta?.model && (
            <Badge size="sm">{meta.model}</Badge>
          )}
          <span className="text-gray-500 italic text-[10px]">nghĩ</span>
        </div>
        <div className="bg-purple-900/15 border border-purple-800/25 text-purple-200/70 text-xs px-2.5 py-1.5 rounded-lg rounded-tl-none italic ml-3 max-w-sm">
          {content}
        </div>
      </div>
    );
  }

  if (type === 'whisper') {
    return (
      <div className="my-1 ml-1">
        <div className="flex items-center gap-1 text-[11px] mb-0.5 flex-wrap">
          <span className="text-red-400">🐺</span>
          <span className="font-semibold text-red-400">{sender}</span>
          <span className="text-gray-500 italic text-[10px]">thì thầm</span>
        </div>
        <div className="bg-red-900/15 border border-red-800/20 text-red-200/70 text-xs px-2.5 py-1.5 rounded-lg rounded-tl-none ml-3 max-w-sm">
          {content}
        </div>
      </div>
    );
  }

  if (type === 'vote') {
    return (
      <div className="my-0.5 ml-1">
        <span className="bg-orange-500/10 border border-orange-500/15 text-orange-200/90 text-[11px] px-2.5 py-1 rounded-full inline-flex items-center gap-1">
          🗳️
          <span className="font-semibold" style={{ color: color || '#fb923c' }}>
            {sender}
          </span>
          <span className="text-orange-300/70">{content}</span>
        </span>
      </div>
    );
  }

  // speech (default)
  return (
    <div className="my-1 ml-1">
      <div className="flex items-center gap-1 text-[11px] mb-0.5 flex-wrap">
        <span style={{ color: color || '#60a5fa' }}>{expression || '💬'}</span>
        <span className="font-semibold" style={{ color: color || '#60a5fa' }}>
          {sender}
        </span>
        {meta?.role && (
          <span className="opacity-40 text-[10px]" style={{ color: color || '#9ca3af' }}>
            {meta.role}
          </span>
        )}
        {meta?.personality && (
          <Badge variant="info" size="sm">
            {meta.personality}
          </Badge>
        )}
        {meta?.model && (
          <Badge size="sm">{meta.model}</Badge>
        )}
      </div>
      <div className="bg-gray-700/30 border border-gray-600/30 text-gray-100/90 text-xs px-2.5 py-1.5 rounded-lg rounded-tl-none ml-3 max-w-sm">
        {content}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ApiLogPanel - Reusable API log viewer                              */
/* ------------------------------------------------------------------ */
export interface ApiLog {
  id: string;
  playerName: string;
  provider: string;
  model: string;
  phase: string;
  systemPrompt: string;
  userPrompt: string;
  response?: object;
  error?: string;
  durationMs: number;
}

export interface ApiLogPanelProps {
  logs: ApiLog[];
  className?: string;
}

export function ApiLogPanel({ logs, className = '' }: ApiLogPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  return (
    <div className={`flex-1 overflow-y-auto rounded-xl bg-gray-900/75 border border-gray-700/50 px-3 py-2 text-[11px] font-mono ${className}`}>
      {logs.length === 0 && (
        <div className="text-gray-600 text-center py-8">Chưa có API call nào</div>
      )}
      {logs.map((log) => {
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
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  hasError ? 'bg-red-500' : 'bg-green-500'
                }`}
              />
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
/*  GameCard - Card for game selection                                 */
/* ------------------------------------------------------------------ */
export interface GameCardProps {
  title: string;
  description: string;
  emoji: string;
  href: string;
  color: 'red' | 'green' | 'purple' | 'blue';
  players: string;
  features: string[];
  isSelected?: boolean;
  onClick?: () => void;
}

export function GameCard({
  title,
  description,
  emoji,
  href,
  color,
  players,
  features,
  isSelected,
  onClick,
}: GameCardProps) {
  const colors = {
    red: {
      gradient: 'from-red-600 to-pink-600',
      shadow: 'shadow-red-500/20',
      ring: 'ring-red-500',
      bg: 'bg-red-500/10',
    },
    green: {
      gradient: 'from-green-600 to-emerald-600',
      shadow: 'shadow-green-500/20',
      ring: 'ring-green-500',
      bg: 'bg-green-500/10',
    },
    purple: {
      gradient: 'from-purple-600 to-indigo-600',
      shadow: 'shadow-purple-500/20',
      ring: 'ring-purple-500',
      bg: 'bg-purple-500/10',
    },
    blue: {
      gradient: 'from-blue-600 to-cyan-600',
      shadow: 'shadow-blue-500/20',
      ring: 'ring-blue-500',
      bg: 'bg-blue-500/10',
    },
  };

  const c = colors[color];

  const content = (
    <div
      className={`relative overflow-hidden rounded-2xl border transition-all duration-300 cursor-pointer group ${
        isSelected
          ? `ring-2 ${c.ring} border-transparent`
          : 'border-gray-700/50 hover:border-gray-600'
      }`}
      onClick={onClick}
    >
      {/* Gradient Background */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${c.gradient} opacity-5 group-hover:opacity-10 transition-opacity`}
      />

      <div className="relative p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="text-5xl">{emoji}</div>
          <Badge variant="default">{players}</Badge>
        </div>

        {/* Title & Description */}
        <h3
          className={`text-xl font-bold mb-2 bg-gradient-to-r ${c.gradient} bg-clip-text text-transparent`}
        >
          {title}
        </h3>
        <p className="text-gray-400 text-sm mb-4 line-clamp-2">{description}</p>

        {/* Features */}
        <div className="flex flex-wrap gap-2">
          {features.map((f) => (
            <span
              key={f}
              className={`text-xs px-2 py-1 rounded-full ${c.bg} text-gray-300`}
            >
              {f}
            </span>
          ))}
        </div>
      </div>
    </div>
  );

  if (onClick) {
    return content;
  }

  return <Link href={href}>{content}</Link>;
}

/* ------------------------------------------------------------------ */
/*  PlayerSetupCard - Player configuration card                        */
/* ------------------------------------------------------------------ */
export interface PlayerSetupCardProps {
  name: string;
  model: string;
  personality: string;
  provider: string;
  onNameChange: (name: string) => void;
  onRemove?: () => void;
  index: number;
}

export function PlayerSetupCard({
  name,
  model,
  personality,
  provider,
  onNameChange,
  onRemove,
  index,
}: PlayerSetupCardProps) {
  const shortModel = model.split('/').pop()?.replace(':free', '') || model;
  const shortPersonality = personality.split(' - ')[0];

  return (
    <Card
      variant="interactive"
      padding="sm"
      className="flex items-center gap-3 group"
    >
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white font-bold text-sm">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="text-white font-semibold bg-transparent border-none outline-none w-full text-sm"
        />
        <div className="flex items-center gap-2 mt-0.5">
          <Badge size="sm">{provider}</Badge>
          <span className="text-[10px] text-gray-500 truncate">{shortModel}</span>
        </div>
      </div>
      <Badge variant="purple" size="sm">
        {shortPersonality}
      </Badge>
      {onRemove && (
        <button
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all"
        >
          ✕
        </button>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  PhaseIndicator - Game phase display                                */
/* ------------------------------------------------------------------ */
export interface PhaseIndicatorProps {
  phase: string;
  phaseLabel: string;
  round?: number;
  isNight?: boolean;
}

export function PhaseIndicator({
  phase,
  phaseLabel,
  round,
  isNight,
}: PhaseIndicatorProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-4xl">{isNight ? '🌙' : '☀️'}</div>
      {round !== undefined && (
        <div className="text-sm font-bold text-white/90">
          {isNight ? 'Đêm' : 'Ngày'} {round}
        </div>
      )}
      <Badge
        variant={isNight ? 'purple' : 'warning'}
        className="font-medium"
      >
        {phaseLabel}
      </Badge>
    </div>
  );
}
