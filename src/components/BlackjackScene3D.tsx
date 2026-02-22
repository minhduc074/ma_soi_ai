'use client';

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { CameraControls, Text, Environment, ContactShadows, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { useBlackjackStore } from '@/store/blackjackStore';
import {
  BlackjackPlayer,
  calculateHandValue,
  Expression,
  formatCard,
  getSpecialHand,
  SPECIAL_HAND_INFO,
} from '@/lib/blackjack/types';

/* ------------------------------------------------------------------ */
/*  Card3D Component — A simple 3D card                                */
/* ------------------------------------------------------------------ */
function Card3D({
  position,
  faceUp,
  cardText,
  index,
}: {
  position: [number, number, number];
  faceUp: boolean;
  cardText: string;
  index: number;
}) {
  const meshRef = useRef<THREE.Group>(null);
  
  // Slight offset for stacking effect
  const offsetX = index * 0.3;
  const offsetZ = index * 0.1;
  
  return (
    <group 
      ref={meshRef} 
      position={[position[0] + offsetX, position[1], position[2] + offsetZ]}
      rotation={[-Math.PI / 4, 0, 0]}
    >
      <RoundedBox args={[0.5, 0.7, 0.02]} radius={0.02} castShadow>
        <meshStandardMaterial color={faceUp ? '#ffffff' : '#1e40af'} />
      </RoundedBox>
      
      {faceUp && (
        <Text
          position={[0, 0, 0.02]}
          fontSize={0.2}
          color="#000000"
          anchorX="center"
          anchorY="middle"
        >
          {cardText}
        </Text>
      )}
      
      {!faceUp && (
        <Text
          position={[0, 0, 0.02]}
          fontSize={0.25}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          🂠
        </Text>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  ChipStack3D Component — Visual chips                               */
/* ------------------------------------------------------------------ */
function ChipStack3D({
  position,
  count,
}: {
  position: [number, number, number];
  count: number;
}) {
  const stackHeight = Math.min(Math.floor(count / 100), 10);
  
  return (
    <group position={position}>
      {Array.from({ length: stackHeight }).map((_, i) => (
        <mesh key={i} position={[0, i * 0.08, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.2, 0.06, 16]} />
          <meshStandardMaterial 
            color={i % 2 === 0 ? '#ef4444' : '#3b82f6'}
            roughness={0.3}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Player3D Component for Blackjack                                   */
/* ------------------------------------------------------------------ */
function BlackjackPlayer3D({
  player,
  position,
  focusState,
  dimmed,
  rotation = 0,
}: {
  player: BlackjackPlayer;
  position: [number, number, number];
  focusState: 'idle' | 'active' | 'speaking' | 'thinking';
  dimmed: boolean;
  rotation?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  
  const handValue = calculateHandValue(player.hand);
  const specialHand = getSpecialHand(player.hand);
  const isBusted = player.status === 'busted';
  const isDealer = player.isDealer;
  const isActive = focusState !== 'idle';
  const isSpeaking = focusState === 'speaking';
  const isThinking = focusState === 'thinking';
  
  const playerColor = isDealer ? '#dc2626' : '#3b82f6';

  // Animation
  useFrame((state) => {
    if (!groupRef.current || !meshRef.current) return;

    if (isBusted) {
      // Busted players tilt
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, -0.3, 0.1);
    } else {
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, 0, 0.1);
    }

    if (isActive) {
      const bounce = Math.sin(state.clock.elapsedTime * (isThinking ? 3 : 5)) * (isThinking ? 0.1 : 0.15);
      groupRef.current.position.y = THREE.MathUtils.lerp(
        groupRef.current.position.y,
        position[1] + bounce,
        0.1
      );
      meshRef.current.rotation.z = THREE.MathUtils.lerp(
        meshRef.current.rotation.z,
        Math.sin(state.clock.elapsedTime * 3) * (isThinking ? 0.03 : 0.06),
        0.12,
      );
    } else {
      groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, position[1], 0.1);
      meshRef.current.rotation.z = THREE.MathUtils.lerp(meshRef.current.rotation.z, 0, 0.1);
    }

    const targetScale = isActive ? (isSpeaking ? 1.06 : 1.03) : 1;
    groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.08);

    // Always orient player toward camera.
    const dx = state.camera.position.x - groupRef.current.position.x;
    const dz = state.camera.position.z - groupRef.current.position.z;
    const targetYaw = Math.atan2(dx, dz);
    groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetYaw, 0.16);
  });

  return (
    <group ref={groupRef} position={position} rotation={[0, rotation, 0]}>
      {/* Player Body */}
      <mesh ref={meshRef} castShadow receiveShadow>
        <capsuleGeometry args={[0.35, 0.7, 4, 16]} />
        <meshStandardMaterial
          color={isBusted ? '#4b5563' : playerColor}
          roughness={0.3}
          metalness={0.2}
          emissive={isActive ? (isThinking ? '#38bdf8' : playerColor) : '#000000'}
          emissiveIntensity={isActive ? (isSpeaking ? 0.65 : 0.45) : 0}
          transparent={dimmed}
          opacity={dimmed ? 0.38 : 1}
        />
      </mesh>

      {/* Speaking Indicator */}
      {isSpeaking && (
        <mesh position={[0, 1, 0]}>
          <torusGeometry args={[0.25, 0.04, 16, 32]} />
          <meshBasicMaterial color="#4ade80" />
        </mesh>
      )}

      {isThinking && (
        <mesh position={[0, 1.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.28, 0.028, 16, 64]} />
          <meshBasicMaterial color="#38bdf8" />
        </mesh>
      )}

      {/* Expression & Name */}
      <group position={[0, 1.3, 0]}>
        <Text
          position={[0, 0.25, 0]}
          fontSize={0.35}
          color="white"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          {player.expression}
        </Text>
        <Text
          position={[0, -0.05, 0]}
          fontSize={0.18}
          color="white"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          {player.name}
        </Text>
        
        {/* Score display */}
        {player.hand.length > 0 && (
          <Text
            position={[0, -0.3, 0]}
            fontSize={0.15}
            color={isBusted ? '#ef4444' : '#fbbf24'}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.02}
            outlineColor="#000000"
          >
            {isBusted ? 'QUẮC!' : `${handValue} điểm`}
          </Text>
        )}
        
        {/* Special hand indicator */}
        {specialHand !== 'normal' && specialHand !== 'quac' && (
          <Text
            position={[0, -0.5, 0]}
            fontSize={0.12}
            color="#4ade80"
            anchorX="center"
            anchorY="middle"
          >
            {SPECIAL_HAND_INFO[specialHand].name}
          </Text>
        )}

        {/* Chip count */}
        {!isDealer && (
          <Text
            position={[0, -0.68, 0]}
            fontSize={0.13}
            color="#fbbf24"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.015}
            outlineColor="#000000"
          >
            {`💰 ${player.chips}`}
          </Text>
        )}
      </group>

      {/* Cards in front of player */}
      <group position={[0, 0.3, 0.8]}>
        {player.hand.map((card, i) => (
          <Card3D
            key={i}
            position={[0, 0, 0]}
            faceUp={card.faceUp}
            cardText={formatCard(card)}
            index={i}
          />
        ))}
      </group>

      {/* Chips (only for non-dealer) */}
      {!isDealer && player.chips > 0 && (
        <ChipStack3D position={[0.8, 0, 0.5]} count={player.chips} />
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Table3D Component — The blackjack table                            */
/* ------------------------------------------------------------------ */
function Table3D() {
  return (
    <group>
      {/* Table top */}
      <mesh position={[0, 0, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[6, 32, 0, Math.PI]} />
        <meshStandardMaterial color="#166534" roughness={0.8} />
      </mesh>
      
      {/* Table edge */}
      <mesh position={[0, -0.1, 0]} receiveShadow>
        <cylinderGeometry args={[6.2, 6.2, 0.2, 32, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#78350f" />
      </mesh>
      
      {/* Dealer area marker */}
      <mesh position={[0, 0.01, -3]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2, 0.8]} />
        <meshStandardMaterial color="#15803d" />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Environment3D Component                                            */
/* ------------------------------------------------------------------ */
function BlackjackEnvironment3D() {
  return (
    <>
      {/* Lighting — Casino atmosphere */}
      <ambientLight intensity={0.4} />
      <directionalLight
        castShadow
        position={[0, 10, 5]}
        intensity={1}
        color="#fef08a"
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[0, 5, 0]} intensity={0.8} color="#fbbf24" distance={12} />
      <pointLight position={[-5, 3, 0]} intensity={0.5} color="#ef4444" distance={8} />
      <pointLight position={[5, 3, 0]} intensity={0.5} color="#3b82f6" distance={8} />

      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#1f2937" roughness={0.9} />
      </mesh>

      {/* Shadows */}
      <ContactShadows
        resolution={1024}
        scale={20}
        blur={2}
        opacity={0.5}
        far={10}
        color="#000000"
      />

      {/* Environment */}
      <Environment preset="city" background blur={0.8} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  CinematicCameraController Component                                  */
/* ------------------------------------------------------------------ */
function CinematicCameraController({
  activePlayerId,
  dealerId,
  playerPositions,
  players,
  phase,
  cameraMode,
}: {
  activePlayerId: string | null;
  dealerId: string | undefined;
  playerPositions: { position: [number, number, number]; rotation: number }[];
  players: BlackjackPlayer[];
  phase: string;
  cameraMode: 'idle' | 'speaking' | 'thinking';
}) {
  const controlsRef = useRef<any>(null);

  React.useEffect(() => {
    if (!controlsRef.current) return;

    // Only focus during player turns or dealer turn
    if (!activePlayerId || (phase !== 'player_turns' && phase !== 'dealer_turn')) {
      // Default overview
      controlsRef.current.setLookAt(0, 8, 10, 0, 0.4, 0, true);
      return;
    }

    if (activePlayerId === dealerId) {
      const distance = cameraMode === 'thinking' ? 2.4 : 3;
      const height = cameraMode === 'thinking' ? 2.9 : 2.5;
      controlsRef.current.setLookAt(0.8, height, -3 + distance, 0, 1.2, -3, true);
      return;
    }

    // Focus on active player
    const playerIndex = players.findIndex((p) => p.id === activePlayerId);
    if (playerIndex >= 0 && playerPositions[playerIndex]) {
      const [x, y, z] = playerPositions[playerIndex].position;
      
      // Calculate camera position: slightly in front and to the side
      // Player is facing dealer at (0, 1, -3)
      const dx = 0 - x;
      const dz = -3 - z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const dirX = dx / dist;
      const dirZ = dz / dist;

      const distance = cameraMode === 'thinking' ? 2.1 : cameraMode === 'speaking' ? 2.8 : 3.3;
      const sideOffset = cameraMode === 'thinking' ? 0.85 : 0.55;
      const camX = x + dirX * distance - dirZ * sideOffset;
      const camY = y + (cameraMode === 'thinking' ? 1.9 : 1.6);
      const camZ = z + dirZ * distance + dirX * sideOffset;

      controlsRef.current.setLookAt(camX, camY, camZ, x, y + 0.7, z, true);
    }
  }, [activePlayerId, cameraMode, dealerId, playerPositions, players, phase]);

  return (
    <CameraControls
      ref={controlsRef}
      smoothTime={0.75}
      minPolarAngle={Math.PI / 6}
      maxPolarAngle={Math.PI / 2.5}
      minDistance={3}
      maxDistance={18}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Main BlackjackScene3D Component                                    */
/* ------------------------------------------------------------------ */
export default function BlackjackScene3D() {
  const players = useBlackjackStore((s) => s.players);
  const dealer = useBlackjackStore((s) => s.dealer);
  const activePlayerId = useBlackjackStore((s) => s.activePlayerId);
  const isSpeakingTTS = useBlackjackStore((s) => s.isSpeakingTTS);
  const logs = useBlackjackStore((s) => s.logs);
  const phase = useBlackjackStore((s) => s.phase);

  const activeMessageType = useMemo(() => {
    if (!activePlayerId) return null;
    const active =
      players.find((p) => p.id === activePlayerId) ??
      (dealer?.id === activePlayerId ? dealer : null);
    if (!active) return null;

    for (let i = logs.length - 1; i >= 0; i--) {
      const log = logs[i];
      if (log.sender === active.name && (log.type === 'thought' || log.type === 'speech')) {
        return log.type;
      }
    }
    return null;
  }, [activePlayerId, dealer, logs, players]);

  const cameraMode: 'idle' | 'speaking' | 'thinking' =
    !activePlayerId || !isSpeakingTTS
      ? 'idle'
      : activeMessageType === 'thought'
        ? 'thinking'
        : 'speaking';

  // Calculate positions in a semicircle
  const playerPositions = useMemo(() => {
    const total = players.length;
    if (total === 0) return [];
    
    const radius = 4;
    // Spread across the front semicircle (facing the dealer)
    return players.map((_, index) => {
      // Distribute from -PI/2 * 0.8 to PI/2 * 0.8
      const spreadAngle = 0.8;
      const startAngle = -Math.PI / 2 * spreadAngle;
      const endAngle = Math.PI / 2 * spreadAngle;
      const angleStep = total > 1 ? (endAngle - startAngle) / (total - 1) : 0;
      const angle = startAngle + index * angleStep;
      
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius + 2;
      
      return {
        position: [x, 1, z] as [number, number, number],
        rotation: -angle, // Face toward dealer
      };
    });
  }, [players]);

  return (
    <div className="w-full h-full min-h-[300px] rounded-xl overflow-hidden border border-gray-700/50 shadow-2xl bg-gray-900">
      <Canvas shadows camera={{ position: [0, 8, 10], fov: 45 }}>
        <color attach="background" args={['#0f172a']} />
        
        <BlackjackEnvironment3D />
        <Table3D />

        {/* Dealer */}
        {dealer && (
          <BlackjackPlayer3D
            player={dealer}
            position={[0, 1, -3]}
            focusState={
              dealer.id !== activePlayerId
                ? 'idle'
                : cameraMode === 'thinking'
                  ? 'thinking'
                  : cameraMode === 'speaking'
                    ? 'speaking'
                    : 'active'
            }
            dimmed={!!activePlayerId && dealer.id !== activePlayerId}
            rotation={Math.PI}
          />
        )}

        {/* Players */}
        {players.map((player, index) => {
          const posData = playerPositions[index];
          const isActive = player.id === activePlayerId;

          return posData ? (
            <BlackjackPlayer3D
              key={player.id}
              player={player}
              position={posData.position}
              focusState={
                !isActive
                  ? 'idle'
                  : cameraMode === 'thinking'
                    ? 'thinking'
                    : cameraMode === 'speaking'
                      ? 'speaking'
                      : 'active'
              }
              dimmed={!!activePlayerId && !isActive}
              rotation={posData.rotation}
            />
          ) : null;
        })}

        {/* Controls */}
        <CinematicCameraController
          activePlayerId={activePlayerId}
          dealerId={dealer?.id}
          playerPositions={playerPositions}
          players={players}
          phase={phase}
          cameraMode={cameraMode}
        />
      </Canvas>
    </div>
  );
}
