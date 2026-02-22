'use client';

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { CameraControls, Text, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '@/store/gameStore';
import { Role, ROLE_INFO, GamePhase } from '@/lib/types';

const ROLE_COLORS: Record<Role, string> = {
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
/*  Player3D Component                                                 */
/* ------------------------------------------------------------------ */
function Player3D({
  player,
  position,
  focusState,
  dimmed,
}: {
  player: { id: string; name: string; role: Role; alive: boolean };
  position: [number, number, number];
  focusState: 'idle' | 'active' | 'speaking' | 'thinking';
  dimmed: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const roleInfo = ROLE_INFO[player.role];
  const color = ROLE_COLORS[player.role];
  const isDead = !player.alive;
  const isActive = focusState !== 'idle';
  const isSpeaking = focusState === 'speaking';
  const isThinking = focusState === 'thinking';

  // Animation for active/speaking state
  useFrame((state) => {
    if (!groupRef.current || !meshRef.current) return;

    if (isDead) {
      // Dead players lie down
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, -Math.PI / 2, 0.1);
      groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, 0.2, 0.1);
    } else {
      // Alive players stand up
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, 0, 0.1);
      
      if (isActive) {
        // Active player bounces slightly
        const speed = isThinking ? 3 : 5;
        const amplitude = isThinking ? 0.12 : 0.2;
        const bounce = Math.sin(state.clock.elapsedTime * speed) * amplitude;
        groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, 1 + bounce, 0.1);
        
        // Subtle body sway while keeping face-to-camera heading stable
        meshRef.current.rotation.z = THREE.MathUtils.lerp(
          meshRef.current.rotation.z,
          Math.sin(state.clock.elapsedTime * 3) * (isThinking ? 0.04 : 0.07),
          0.12,
        );
      } else {
        groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, 1, 0.1);
        meshRef.current.rotation.z = THREE.MathUtils.lerp(meshRef.current.rotation.z, 0, 0.1);
      }

      const targetScale = isActive ? (isSpeaking ? 1.08 : 1.04) : 1;
      groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.08);

      // Always orient player toward camera.
      const dx = state.camera.position.x - groupRef.current.position.x;
      const dz = state.camera.position.z - groupRef.current.position.z;
      const targetYaw = Math.atan2(dx, dz);
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetYaw, 0.14);
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Player Body (Capsule) */}
      <mesh ref={meshRef} castShadow receiveShadow>
        <capsuleGeometry args={[0.4, 0.8, 4, 16]} />
        <meshStandardMaterial 
          color={isDead ? '#4b5563' : color} 
          roughness={0.3}
          metalness={0.2}
          emissive={isActive && !isDead ? (isThinking ? '#38bdf8' : color) : '#000000'}
          emissiveIntensity={isActive ? (isSpeaking ? 0.7 : 0.45) : 0}
          transparent={dimmed}
          opacity={dimmed ? 0.35 : 1}
        />
      </mesh>

      {/* Speaking Indicator (Halo) */}
      {isSpeaking && !isDead && (
        <mesh position={[0, 1.2, 0]}>
          <torusGeometry args={[0.3, 0.05, 16, 32]} />
          <meshBasicMaterial color="#4ade80" />
        </mesh>
      )}

      {/* Thinking Indicator */}
      {isThinking && !isDead && (
        <mesh position={[0, 1.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.34, 0.03, 16, 64]} />
          <meshBasicMaterial color="#38bdf8" />
        </mesh>
      )}

      {/* Name and Emoji Text */}
      <group position={[0, isDead ? 0.5 : 1.5, 0]}>
        <Text
          position={[0, 0.3, 0]}
          fontSize={0.3}
          color={isDead ? '#9ca3af' : 'white'}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          {isDead ? '💀' : roleInfo.emoji}
        </Text>
        <Text
          position={[0, 0, 0]}
          fontSize={0.2}
          color={isDead ? '#9ca3af' : 'white'}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          {player.name}
        </Text>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Environment3D Component                                            */
/* ------------------------------------------------------------------ */
function Environment3D({ isNight }: { isNight: boolean }) {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={isNight ? 0.2 : 0.6} />
      <directionalLight
        castShadow
        position={isNight ? [5, 10, -5] : [5, 10, 5]}
        intensity={isNight ? 0.5 : 1.5}
        color={isNight ? '#818cf8' : '#fef08a'}
        shadow-mapSize={[1024, 1024]}
      />
      {isNight && (
        <pointLight position={[0, 2, 0]} intensity={1} color="#6366f1" distance={10} />
      )}

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial 
          color={isNight ? '#1e1b4b' : '#166534'} 
          roughness={0.8}
        />
      </mesh>

      {/* Center Firepit/Altar */}
      <mesh position={[0, 0.2, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[1.5, 1.5, 0.4, 32]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
      
      {/* Fire/Light source in center */}
      {isNight && (
        <mesh position={[0, 0.5, 0]}>
          <sphereGeometry args={[0.3, 16, 16]} />
          <meshBasicMaterial color="#fbbf24" />
          <pointLight intensity={2} color="#fbbf24" distance={8} />
        </mesh>
      )}

      {/* Shadows */}
      <ContactShadows
        resolution={1024}
        scale={20}
        blur={2}
        opacity={0.5}
        far={10}
        color="#000000"
      />
      
      {/* Sky/Environment */}
      <Environment preset={isNight ? 'night' : 'sunset'} background blur={0.5} />
    </>
  );
}

function CinematicCameraController({
  activePlayerId,
  isSpeaking,
  isThinking,
  playerPositions,
  players,
  isNight,
}: {
  activePlayerId: string | null;
  isSpeaking: boolean;
  isThinking: boolean;
  playerPositions: [number, number, number][];
  players: { id: string }[];
  isNight: boolean;
}) {
  const controlsRef = useRef<any>(null);

  React.useEffect(() => {
    if (!controlsRef.current) return;

    if (!activePlayerId) {
      controlsRef.current.setLookAt(0, isNight ? 6.8 : 6.2, isNight ? 9.5 : 8.5, 0, 0.8, 0, true);
      return;
    }

    const activeIndex = players.findIndex((p) => p.id === activePlayerId);
    if (activeIndex < 0 || !playerPositions[activeIndex]) {
      controlsRef.current.setLookAt(0, 6.5, 9, 0, 0.8, 0, true);
      return;
    }

    const [x, y, z] = playerPositions[activeIndex];
    const norm = Math.sqrt(x * x + z * z) || 1;
    const dirX = x / norm;
    const dirZ = z / norm;

    const shotDistance = isThinking ? 2.2 : isSpeaking ? 2.8 : 3.4;
    const sideOffset = isThinking ? 0.8 : 0.45;
    const camX = x + dirX * shotDistance - dirZ * sideOffset;
    const camY = y + (isThinking ? 1.8 : 1.6);
    const camZ = z + dirZ * shotDistance + dirX * sideOffset;
    const lookY = y + (isThinking ? 1.05 : 0.85);

    controlsRef.current.setLookAt(camX, camY, camZ, x, lookY, z, true);
  }, [activePlayerId, isNight, isSpeaking, isThinking, playerPositions, players]);

  return (
    <CameraControls
      ref={controlsRef}
      smoothTime={0.75}
      minPolarAngle={Math.PI / 5}
      maxPolarAngle={Math.PI / 2.15}
      minDistance={2.5}
      maxDistance={14}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Main GameScene3D Component                                         */
/* ------------------------------------------------------------------ */
export default function GameScene3D() {
  const players = useGameStore((s) => s.players);
  const activePlayerId = useGameStore((s) => s.activePlayerId);
  const isSpeakingTTS = useGameStore((s) => s.isSpeakingTTS);
  const isThinkingTTS = useGameStore((s) => s.isThinkingTTS);
  const phase = useGameStore((s) => s.phase);
  const isNight = isNightPhase(phase);

  const total = players.length;
  const radius = total <= 6 ? 4 : total <= 9 ? 5 : 6;

  // Calculate positions in a circle
  const playerPositions = useMemo(() => {
    return players.map((_, index) => {
      const angle = (index / total) * 2 * Math.PI;
      // Start from bottom (z is forward/backward in 3D)
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;
      return [x, 0, z] as [number, number, number];
    });
  }, [players, total, radius]);

  return (
    <div className="w-full h-full min-h-[300px] rounded-xl overflow-hidden border border-gray-700/50 shadow-2xl">
      <Canvas shadows camera={{ position: [0, 6, 8], fov: 50 }}>
        <color attach="background" args={[isNight ? '#0f172a' : '#87ceeb']} />
        
        <Environment3D isNight={isNight} />

        {/* Players */}
        {players.map((player, index) => {
          const isActive = player.id === activePlayerId;
          let focusState: 'idle' | 'active' | 'speaking' | 'thinking' = 'idle';
          if (isActive) {
            focusState = isSpeakingTTS ? (isThinkingTTS ? 'thinking' : 'speaking') : 'active';
          }
          const dimmed = !!activePlayerId && !isActive;

          return (
            <Player3D
              key={player.id}
              player={player}
              position={playerPositions[index]}
              focusState={focusState}
              dimmed={dimmed}
            />
          );
        })}

        {/* Cinematic camera */}
        <CinematicCameraController
          activePlayerId={activePlayerId}
          isSpeaking={isSpeakingTTS}
          isThinking={isThinkingTTS}
          playerPositions={playerPositions}
          players={players}
          isNight={isNight}
        />
      </Canvas>
    </div>
  );
}
