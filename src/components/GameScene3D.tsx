'use client';

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Environment, ContactShadows, Float } from '@react-three/drei';
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
  isActive,
  isSpeaking,
}: {
  player: { id: string; name: string; role: Role; alive: boolean };
  position: [number, number, number];
  isActive: boolean;
  isSpeaking: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const roleInfo = ROLE_INFO[player.role];
  const color = ROLE_COLORS[player.role];
  const isDead = !player.alive;

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
        const bounce = Math.sin(state.clock.elapsedTime * 5) * 0.2;
        groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, 1 + bounce, 0.1);
        
        // Rotate slightly
        meshRef.current.rotation.y += 0.02;
      } else {
        groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, 1, 0.1);
        meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, 0, 0.1);
      }
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
          emissive={isActive && !isDead ? color : '#000000'}
          emissiveIntensity={isActive ? 0.5 : 0}
        />
      </mesh>

      {/* Speaking Indicator (Halo) */}
      {isSpeaking && !isDead && (
        <mesh position={[0, 1.2, 0]}>
          <torusGeometry args={[0.3, 0.05, 16, 32]} />
          <meshBasicMaterial color="#4ade80" />
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

/* ------------------------------------------------------------------ */
/*  Main GameScene3D Component                                         */
/* ------------------------------------------------------------------ */
export default function GameScene3D() {
  const players = useGameStore((s) => s.players);
  const activePlayerId = useGameStore((s) => s.activePlayerId);
  const isSpeakingTTS = useGameStore((s) => s.isSpeakingTTS);
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
          const active = player.id === activePlayerId;
          const speaking = active && isSpeakingTTS;

          return (
            <Player3D
              key={player.id}
              player={player}
              position={playerPositions[index]}
              isActive={active}
              isSpeaking={speaking}
            />
          );
        })}

        {/* Controls */}
        <OrbitControls 
          enablePan={false}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 2.1}
          minDistance={4}
          maxDistance={15}
        />
      </Canvas>
    </div>
  );
}
