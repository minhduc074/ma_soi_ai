'use client';

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { CameraControls, Text, Environment, ContactShadows, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { useXitoStore } from '@/store/xitoStore';
import {
  XitoPlayer,
  formatCard,
  evaluateHand,
  getAllCards,
  HAND_RANK_EMOJI,
  HAND_RANK_NAME,
} from '@/lib/xito/types';

/* ------------------------------------------------------------------ */
/*  Card3D Component — A simple 3D card                                */
/* ------------------------------------------------------------------ */
function Card3D({
  position,
  faceUp,
  cardText,
  index,
  isHoleCard = false,
}: {
  position: [number, number, number];
  faceUp: boolean;
  cardText: string;
  index: number;
  isHoleCard?: boolean;
}) {
  const meshRef = useRef<THREE.Group>(null);
  
  // Offset for stacking effect - hole card slightly back
  const offsetX = isHoleCard ? -0.2 : index * 0.35;
  const offsetZ = isHoleCard ? -0.15 : index * 0.08;
  
  return (
    <group 
      ref={meshRef} 
      position={[position[0] + offsetX, position[1], position[2] + offsetZ]}
      rotation={[-Math.PI / 4, 0, 0]}
    >
      <RoundedBox args={[0.5, 0.7, 0.02]} radius={0.02} castShadow>
        <meshStandardMaterial color={faceUp ? '#ffffff' : '#7c3aed'} />
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
            color={i % 3 === 0 ? '#ef4444' : i % 3 === 1 ? '#3b82f6' : '#fbbf24'}
            roughness={0.3}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Pot3D Component — Central pot display                              */
/* ------------------------------------------------------------------ */
function Pot3D({ amount }: { amount: number }) {
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.5;
    }
  });

  const stackCount = Math.min(Math.ceil(amount / 50), 15);
  
  return (
    <group position={[0, 0.3, 0]}>
      <group ref={groupRef}>
        {Array.from({ length: stackCount }).map((_, i) => {
          const angle = (i / stackCount) * Math.PI * 2;
          const radius = 0.3 + (i % 3) * 0.1;
          const x = Math.cos(angle) * radius;
          const z = Math.sin(angle) * radius;
          const height = Math.floor(i / 5) * 0.08;
          
          return (
            <mesh key={i} position={[x, height, z]} castShadow>
              <cylinderGeometry args={[0.15, 0.15, 0.05, 16]} />
              <meshStandardMaterial 
                color={i % 3 === 0 ? '#ef4444' : i % 3 === 1 ? '#22c55e' : '#fbbf24'}
                roughness={0.3}
                metalness={0.2}
              />
            </mesh>
          );
        })}
      </group>
      
      <Text
        position={[0, 0.8, 0]}
        fontSize={0.25}
        color="#fbbf24"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        {`💰 ${amount}`}
      </Text>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Player3D Component for Xì Tố                                       */
/* ------------------------------------------------------------------ */
function XitoPlayer3D({
  player,
  position,
  focusState,
  dimmed,
  rotation = 0,
}: {
  player: XitoPlayer;
  position: [number, number, number];
  focusState: 'idle' | 'active' | 'speaking' | 'thinking';
  dimmed: boolean;
  rotation?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  
  const allCards = getAllCards(player);
  const handEval = evaluateHand(allCards);
  const isFolded = player.status === 'folded';
  const isAllIn = player.status === 'all_in';
  const isActive = focusState !== 'idle';
  const isSpeaking = focusState === 'speaking';
  const isThinking = focusState === 'thinking';
  
  const playerColor = isFolded ? '#4b5563' : isAllIn ? '#dc2626' : '#3b82f6';

  // Animation
  useFrame((state) => {
    if (!groupRef.current || !meshRef.current) return;

    if (isFolded) {
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
          color={playerColor}
          roughness={0.3}
          metalness={0.2}
          emissive={isActive ? playerColor : '#000000'}
          emissiveIntensity={isActive ? (isSpeaking ? 0.65 : 0.45) : 0}
          transparent={isFolded}
          opacity={isFolded ? 0.5 : dimmed ? 0.38 : 1}
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

      {/* All-in Indicator */}
      {isAllIn && (
        <Text
          position={[0, 1.6, 0]}
          fontSize={0.2}
          color="#ef4444"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          🔥 ALL-IN
        </Text>
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
        
        {/* Hand evaluation (only show if has cards) */}
        {allCards.length >= 2 && !isFolded && (
          <Text
            position={[0, -0.3, 0]}
            fontSize={0.12}
            color="#4ade80"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.015}
            outlineColor="#000000"
          >
            {`${HAND_RANK_EMOJI[handEval.rank]} ${HAND_RANK_NAME[handEval.rank]}`}
          </Text>
        )}

        {/* Status for folded */}
        {isFolded && (
          <Text
            position={[0, -0.3, 0]}
            fontSize={0.15}
            color="#ef4444"
            anchorX="center"
            anchorY="middle"
          >
            ❌ BỎ BÀI
          </Text>
        )}

        {/* Chip count */}
        <Text
          position={[0, -0.5, 0]}
          fontSize={0.13}
          color="#fbbf24"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.015}
          outlineColor="#000000"
        >
          {`💰 ${player.chips}`}
        </Text>
        
        {/* Current bet */}
        {player.roundBet > 0 && (
          <Text
            position={[0, -0.68, 0]}
            fontSize={0.11}
            color="#22c55e"
            anchorX="center"
            anchorY="middle"
          >
            {`Cược: ${player.roundBet}`}
          </Text>
        )}
      </group>

      {/* Cards in front of player */}
      {!isFolded && (
        <group position={[0, 0.3, 0.8]}>
          {/* Hole card (face down) */}
          {player.holeCard && (
            <Card3D
              position={[0, 0, 0]}
              faceUp={false}
              cardText=""
              index={0}
              isHoleCard={true}
            />
          )}
          
          {/* Face up cards */}
          {player.faceUpCards.map((card, i) => (
            <Card3D
              key={i}
              position={[0, 0, 0]}
              faceUp={card.faceUp}
              cardText={formatCard(card)}
              index={i}
            />
          ))}
        </group>
      )}

      {/* Chips (visual) */}
      {player.chips > 0 && (
        <ChipStack3D position={[0.9, 0, 0.5]} count={player.chips} />
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Table3D Component — Circular poker table                           */
/* ------------------------------------------------------------------ */
function Table3D() {
  return (
    <group>
      {/* Table top - full circle */}
      <mesh position={[0, 0, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[5, 64]} />
        <meshStandardMaterial color="#166534" roughness={0.8} />
      </mesh>
      
      {/* Table edge */}
      <mesh position={[0, -0.1, 0]} receiveShadow>
        <cylinderGeometry args={[5.2, 5.2, 0.2, 64]} />
        <meshStandardMaterial color="#78350f" />
      </mesh>
      
      {/* Center marker */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.8, 1, 32]} />
        <meshStandardMaterial color="#15803d" />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Environment3D Component                                            */
/* ------------------------------------------------------------------ */
function XitoEnvironment3D() {
  return (
    <>
      {/* Lighting — Casino/Poker atmosphere */}
      <ambientLight intensity={0.4} />
      <directionalLight
        castShadow
        position={[0, 10, 5]}
        intensity={1}
        color="#fef08a"
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[0, 5, 0]} intensity={1} color="#fbbf24" distance={12} />
      <pointLight position={[-4, 3, -4]} intensity={0.5} color="#a855f7" distance={8} />
      <pointLight position={[4, 3, -4]} intensity={0.5} color="#06b6d4" distance={8} />
      <pointLight position={[-4, 3, 4]} intensity={0.5} color="#ef4444" distance={8} />
      <pointLight position={[4, 3, 4]} intensity={0.5} color="#22c55e" distance={8} />

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
/*  CinematicCameraController Component                                */
/* ------------------------------------------------------------------ */
function CinematicCameraController({
  activePlayerId,
  playerPositions,
  players,
  phase,
  cameraMode,
}: {
  activePlayerId: string | null;
  playerPositions: { position: [number, number, number]; rotation: number }[];
  players: XitoPlayer[];
  phase: string;
  cameraMode: 'idle' | 'speaking' | 'thinking';
}) {
  const controlsRef = useRef<any>(null);

  React.useEffect(() => {
    if (!controlsRef.current) return;

    // Default overview for non-action phases
    if (!activePlayerId || phase === 'setup' || phase === 'game_over' || phase === 'round_end') {
      controlsRef.current.setLookAt(0, 10, 10, 0, 0.4, 0, true);
      return;
    }

    // Focus on active player
    const playerIndex = players.findIndex((p) => p.id === activePlayerId);
    if (playerIndex >= 0 && playerPositions[playerIndex]) {
      const [x, y, z] = playerPositions[playerIndex].position;
      
      // Camera position: adaptive cinematic shot based on speech/thought mode
      const angle = Math.atan2(z, x);
      const camDist = cameraMode === 'thinking' ? 2.8 : cameraMode === 'speaking' ? 3.6 : 4.4;
      const sideOffset = cameraMode === 'thinking' ? 0.8 : 0.45;
      const camX = x + Math.cos(angle + Math.PI) * camDist - Math.sin(angle) * sideOffset;
      const camY = y + (cameraMode === 'thinking' ? 2.1 : 1.9);
      const camZ = z + Math.sin(angle + Math.PI) * camDist + Math.cos(angle) * sideOffset;

      controlsRef.current.setLookAt(camX, camY, camZ, x, y + 0.7, z, true);
    }
  }, [activePlayerId, cameraMode, playerPositions, players, phase]);

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
/*  Main XitoScene3D Component                                         */
/* ------------------------------------------------------------------ */
export default function XitoScene3D() {
  const players = useXitoStore((s) => s.players);
  const pot = useXitoStore((s) => s.pot);
  const activePlayerId = useXitoStore((s) => s.activePlayerId);
  const isSpeakingTTS = useXitoStore((s) => s.isSpeakingTTS);
  const logs = useXitoStore((s) => s.logs);
  const phase = useXitoStore((s) => s.phase);

  const activeMessageType = useMemo(() => {
    if (!activePlayerId) return null;
    const active = players.find((p) => p.id === activePlayerId);
    if (!active) return null;

    for (let i = logs.length - 1; i >= 0; i--) {
      const log = logs[i];
      if (log.sender === active.name && (log.type === 'thought' || log.type === 'speech')) {
        return log.type;
      }
    }
    return null;
  }, [activePlayerId, logs, players]);

  const cameraMode: 'idle' | 'speaking' | 'thinking' =
    !activePlayerId || !isSpeakingTTS
      ? 'idle'
      : activeMessageType === 'thought'
        ? 'thinking'
        : 'speaking';

  // Calculate positions in a full circle around the table
  const playerPositions = useMemo(() => {
    const total = players.length;
    if (total === 0) return [];
    
    const radius = 4;
    return players.map((_, index) => {
      // Distribute evenly around the circle
      const angle = (index / total) * Math.PI * 2 - Math.PI / 2; // Start from top
      
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      
      return {
        position: [x, 1, z] as [number, number, number],
        rotation: -angle + Math.PI / 2, // Face toward center
      };
    });
  }, [players]);

  return (
    <div className="w-full h-full min-h-[300px] rounded-xl overflow-hidden border border-gray-700/50 shadow-2xl bg-gray-900">
      <Canvas shadows camera={{ position: [0, 10, 10], fov: 45 }}>
        <color attach="background" args={['#0f172a']} />
        
        <XitoEnvironment3D />
        <Table3D />

        {/* Central Pot */}
        {pot > 0 && <Pot3D amount={pot} />}

        {/* Players */}
        {players.map((player, index) => {
          const posData = playerPositions[index];
          const isActive = player.id === activePlayerId;

          return posData ? (
            <XitoPlayer3D
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

        {/* Camera Controls */}
        <CinematicCameraController
          activePlayerId={activePlayerId}
          playerPositions={playerPositions}
          players={players}
          phase={phase}
          cameraMode={cameraMode}
        />
      </Canvas>
    </div>
  );
}
