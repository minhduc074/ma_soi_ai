'use client';

import React from 'react';
import { useGameStore } from '@/store/gameStore';
import { Role, ROLE_INFO, GamePhase } from '@/lib/types';

const ROLE_COLORS: Record<Role, string> = {
  werewolf: '#dc2626',
  villager: '#78716c',
  seer: '#9333ea',
  guard: '#2563eb',
  witch: '#059669',
  hunter: '#d97706',
};

const SKIN_TONES = ['#f5d0c5', '#d4a574', '#c68642', '#8d5524', '#6b4423'];
const HAIR_COLORS = ['#1a1a2e', '#4a3728', '#8b4513', '#cd853f', '#2c1810'];

function isNightPhase(phase: GamePhase) {
  return phase.startsWith('night');
}

/* ------------------------------------------------------------------ */
/*  Avatar Component                                                   */
/* ------------------------------------------------------------------ */
function Avatar({ 
  name, 
  role,
  alive,
  isActive,
  isSpeaking,
  isThinking,
  expression,
  dimmed,
}: { 
  name: string;
  role: Role;
  alive: boolean;
  isActive: boolean;
  isSpeaking: boolean;
  isThinking: boolean;
  expression?: string;
  dimmed: boolean;
}) {
  const nameHash = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const skinTone = SKIN_TONES[nameHash % SKIN_TONES.length];
  const hairColor = HAIR_COLORS[(nameHash * 7) % HAIR_COLORS.length];
  const roleColor = ROLE_COLORS[role];
  const roleEmoji = ROLE_INFO[role].emoji;

  return (
    <div 
      className={`
        relative flex flex-col items-center transition-all duration-500
        ${dimmed ? 'opacity-40 scale-90' : 'opacity-100 scale-100'}
        ${!alive ? 'grayscale' : ''}
        ${isActive ? 'z-10' : 'z-0'}
      `}
    >
      {/* Glow effect when active */}
      {isActive && (
        <div 
          className="absolute inset-0 rounded-full blur-xl opacity-50 animate-pulse"
          style={{ backgroundColor: roleColor, transform: 'scale(1.5)' }}
        />
      )}

      {/* Character body */}
      <div className="relative">
        {/* Head */}
        <div 
          className={`
            w-16 h-16 rounded-full border-4 relative
            ${isActive ? 'animate-bounce' : ''}
            ${isSpeaking ? 'ring-4 ring-yellow-400 ring-opacity-75' : ''}
          `}
          style={{ 
            backgroundColor: skinTone,
            borderColor: roleColor,
          }}
        >
          {/* Hair */}
          <div 
            className="absolute -top-2 left-1/2 -translate-x-1/2 w-14 h-8 rounded-t-full"
            style={{ backgroundColor: hairColor }}
          />
          
          {/* Eyes */}
          <div className="absolute top-6 left-3 w-2 h-2 bg-gray-800 rounded-full" />
          <div className="absolute top-6 right-3 w-2 h-2 bg-gray-800 rounded-full" />
          
          {/* Mouth - expression based */}
          <div 
            className={`
              absolute bottom-3 left-1/2 -translate-x-1/2 
              ${expression === '😠' || expression === '😤' ? 'w-4 h-1 bg-red-600' : ''}
              ${expression === '😊' || expression === '😄' ? 'w-4 h-2 bg-pink-400 rounded-b-full' : ''}
              ${expression === '😰' || expression === '😨' ? 'w-3 h-3 bg-gray-800 rounded-full' : ''}
              ${!expression || expression === '🤔' ? 'w-3 h-1 bg-pink-400 rounded-full' : ''}
            `}
          />

          {/* Thinking indicator */}
          {isThinking && (
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-2xl animate-bounce">
              💭
            </div>
          )}

          {/* Speaking indicator */}
          {isSpeaking && !isThinking && (
            <div className="absolute -right-2 -top-2 text-xl animate-pulse">
              🗣️
            </div>
          )}
        </div>

        {/* Body */}
        <div 
          className="w-12 h-10 mx-auto -mt-1 rounded-b-lg"
          style={{ backgroundColor: roleColor }}
        />

        {/* Death mark */}
        {!alive && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-4xl">💀</span>
          </div>
        )}
      </div>

      {/* Name tag */}
      <div 
        className={`
          mt-2 px-3 py-1 rounded-full text-sm font-bold text-white
          ${isActive ? 'ring-2 ring-white' : ''}
        `}
        style={{ backgroundColor: roleColor }}
      >
        {roleEmoji} {name}
      </div>

      {/* Expression */}
      {expression && alive && (
        <div className="text-2xl mt-1 animate-bounce">
          {expression}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main 2D Scene                                                      */
/* ------------------------------------------------------------------ */
export default function GameScene2D() {
  const players = useGameStore((s) => s.players);
  const phase = useGameStore((s) => s.phase);
  const activePlayerId = useGameStore((s) => s.activePlayerId);
  const isSpeakingTTS = useGameStore((s) => s.isSpeakingTTS);
  const isThinkingTTS = useGameStore((s) => s.isThinkingTTS);
  const playerExpressions = useGameStore((s) => s.playerExpressions);

  const isNight = isNightPhase(phase);
  const alivePlayers = players.filter(p => p.alive);
  const deadPlayers = players.filter(p => !p.alive);

  return (
    <div 
      className={`
        w-full h-full min-h-[300px] rounded-xl overflow-hidden 
        border border-gray-700/50 shadow-2xl
        transition-all duration-1000 relative
        ${isNight 
          ? 'bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900' 
          : 'bg-gradient-to-b from-sky-400 via-sky-300 to-green-400'
        }
      `}
    >
      {/* Sky elements */}
      {isNight ? (
        <>
          {/* Moon */}
          <div className="absolute top-6 right-10 w-16 h-16 bg-yellow-100 rounded-full shadow-lg shadow-yellow-200/50" />
          {/* Stars */}
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-white rounded-full animate-pulse"
              style={{
                top: `${Math.random() * 40}%`,
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 2}s`,
              }}
            />
          ))}
        </>
      ) : (
        <>
          {/* Sun */}
          <div className="absolute top-6 right-10 w-20 h-20 bg-yellow-300 rounded-full shadow-lg shadow-yellow-400/50 animate-pulse" />
          {/* Clouds */}
          <div className="absolute top-10 left-10 w-24 h-8 bg-white/80 rounded-full" />
          <div className="absolute top-16 left-20 w-16 h-6 bg-white/60 rounded-full" />
          <div className="absolute top-8 left-1/3 w-20 h-7 bg-white/70 rounded-full" />
        </>
      )}

      {/* Ground */}
      <div 
        className={`
          absolute bottom-0 left-0 right-0 h-1/3
          ${isNight 
            ? 'bg-gradient-to-t from-slate-800 to-transparent' 
            : 'bg-gradient-to-t from-green-600 to-transparent'
          }
        `}
      />

      {/* Village fire (night) */}
      {isNight && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2">
          <div className="text-4xl animate-pulse">🔥</div>
        </div>
      )}

      {/* Trees */}
      <div className="absolute bottom-12 left-4 text-4xl">🌲</div>
      <div className="absolute bottom-16 left-16 text-3xl">🌲</div>
      <div className="absolute bottom-12 right-4 text-4xl">🌲</div>
      <div className="absolute bottom-16 right-16 text-3xl">🌲</div>

      {/* Alive Players - Circle arrangement */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-[90%] h-[70%]">
          {alivePlayers.map((player, index) => {
            const total = alivePlayers.length;
            const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
            const radiusX = 42;
            const radiusY = 35;
            const x = 50 + Math.cos(angle) * radiusX;
            const y = 50 + Math.sin(angle) * radiusY;
            const isActive = player.id === activePlayerId;

            return (
              <div
                key={player.id}
                className="absolute transition-all duration-500"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <Avatar
                  name={player.name}
                  role={player.role}
                  alive={player.alive}
                  isActive={isActive}
                  isSpeaking={isActive && isSpeakingTTS && !isThinkingTTS}
                  isThinking={isActive && isThinkingTTS}
                  expression={playerExpressions[player.name]}
                  dimmed={!!activePlayerId && !isActive}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Dead Players - Bottom row */}
      {deadPlayers.length > 0 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-4">
          {deadPlayers.map((player) => (
            <div key={player.id} className="scale-75">
              <Avatar
                name={player.name}
                role={player.role}
                alive={false}
                isActive={false}
                isSpeaking={false}
                isThinking={false}
                dimmed={true}
              />
            </div>
          ))}
        </div>
      )}

      {/* Phase indicator */}
      <div className="absolute top-4 left-4 px-4 py-2 bg-black/50 rounded-lg text-white font-bold">
        {isNight ? '🌙 Đêm' : '☀️ Ngày'}
      </div>
    </div>
  );
}
