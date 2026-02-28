'use client';

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { CameraControls, Text, Environment, ContactShadows, RoundedBox, Sparkles } from '@react-three/drei';
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

const SKIN_TONES = ['#f5d0c5', '#d4a574', '#c68642', '#8d5524', '#6b4423'];
const HAIR_COLORS = ['#1a1a2e', '#4a3728', '#8b4513', '#cd853f', '#2c1810'];
const OUTFIT_COLORS = ['#1e3a5f', '#4a1942', '#0f3d0f', '#5c1a1a', '#2d2d44', '#3d2817'];

/* ------------------------------------------------------------------ */
/*  Decorative Components                                              */
/* ------------------------------------------------------------------ */
function PokerLamp({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Lamp shade */}
      <mesh position={[0, 0, 0]} castShadow>
        <coneGeometry args={[0.8, 0.4, 16, 1, true]} />
        <meshStandardMaterial color="#2d5a27" side={THREE.DoubleSide} roughness={0.7} />
      </mesh>
      {/* Gold trim */}
      <mesh position={[0, -0.2, 0]}>
        <torusGeometry args={[0.8, 0.03, 8, 32]} />
        <meshStandardMaterial color="#d4af37" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Light bulb */}
      <mesh position={[0, 0.1, 0]}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshBasicMaterial color="#fef3c7" />
      </mesh>
      <pointLight position={[0, 0, 0]} intensity={2.5} color="#fef3c7" distance={10} decay={2} />
    </group>
  );
}

function WallDecor({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Frame */}
      <mesh castShadow>
        <boxGeometry args={[2, 1.5, 0.1]} />
        <meshStandardMaterial color="#5c2a0a" roughness={0.6} />
      </mesh>
      {/* Picture */}
      <mesh position={[0, 0, 0.06]}>
        <planeGeometry args={[1.7, 1.2]} />
        <meshStandardMaterial color="#1a1520" />
      </mesh>
      {/* Card symbols decoration */}
      <Text position={[-0.4, 0, 0.08]} fontSize={0.4} color="#ef4444">♥</Text>
      <Text position={[0, 0, 0.08]} fontSize={0.4} color="#1a1a1a">♠</Text>
      <Text position={[0.4, 0, 0.08]} fontSize={0.4} color="#ef4444">♦</Text>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Card3D Component — Premium poker cards                             */
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
  
  const offsetX = isHoleCard ? -0.25 : index * 0.38;
  const offsetZ = isHoleCard ? -0.12 : index * 0.06;
  const isRed = cardText.includes('♥') || cardText.includes('♦');
  
  return (
    <group 
      ref={meshRef} 
      position={[position[0] + offsetX, position[1] + index * 0.015, position[2] + offsetZ]}
      rotation={[-Math.PI / 4, 0, 0]}
    >
      <RoundedBox args={[0.55, 0.75, 0.025]} radius={0.03} castShadow>
        <meshStandardMaterial 
          color={faceUp ? '#fffef5' : '#7c3aed'} 
          roughness={0.25}
          metalness={0.1}
        />
      </RoundedBox>
      
      {/* Card back pattern */}
      {!faceUp && (
        <>
          <mesh position={[0, 0, 0.015]}>
            <planeGeometry args={[0.45, 0.65]} />
            <meshBasicMaterial color="#6d28d9" />
          </mesh>
          <mesh position={[0, 0, 0.016]}>
            <ringGeometry args={[0.1, 0.16, 16]} />
            <meshBasicMaterial color="#c4b5fd" />
          </mesh>
        </>
      )}
      
      {faceUp && (
        <Text
          position={[0, 0, 0.02]}
          fontSize={0.22}
          color={isRed ? '#dc2626' : '#1a1a1a'}
          anchorX="center"
          anchorY="middle"
          fontWeight="bold"
        >
          {cardText}
        </Text>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  ChipStack3D Component — Premium poker chips                        */
/* ------------------------------------------------------------------ */
function ChipStack3D({
  position,
  count,
}: {
  position: [number, number, number];
  count: number;
}) {
  const stackHeight = Math.min(Math.floor(count / 70), 12);
  const chipColors = ['#dc2626', '#16a34a', '#2563eb', '#7c3aed', '#000000'];
  
  return (
    <group position={position}>
      {Array.from({ length: stackHeight }).map((_, i) => (
        <group key={i} position={[0, i * 0.065, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.16, 0.16, 0.045, 24]} />
            <meshStandardMaterial 
              color={chipColors[i % chipColors.length]}
              roughness={0.35}
              metalness={0.4}
            />
          </mesh>
          <mesh>
            <torusGeometry args={[0.16, 0.008, 8, 24]} />
            <meshStandardMaterial color="#d4af37" metalness={0.65} roughness={0.35} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Pot3D Component — Animated central pot                             */
/* ------------------------------------------------------------------ */
function Pot3D({ amount }: { amount: number }) {
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.4;
    }
  });

  const stackCount = Math.min(Math.ceil(amount / 40), 18);
  const chipColors = ['#dc2626', '#16a34a', '#fbbf24', '#2563eb', '#7c3aed'];
  
  return (
    <group position={[0, 0.35, 0]}>
      <group ref={groupRef}>
        {Array.from({ length: stackCount }).map((_, i) => {
          const angle = (i / stackCount) * Math.PI * 2;
          const radius = 0.25 + (i % 4) * 0.08;
          const x = Math.cos(angle) * radius;
          const z = Math.sin(angle) * radius;
          const height = Math.floor(i / 6) * 0.065;
          
          return (
            <group key={i} position={[x, height, z]}>
              <mesh castShadow>
                <cylinderGeometry args={[0.13, 0.13, 0.04, 20]} />
                <meshStandardMaterial 
                  color={chipColors[i % chipColors.length]}
                  roughness={0.35}
                  metalness={0.35}
                />
              </mesh>
            </group>
          );
        })}
      </group>
      
      <Text
        position={[0, 0.9, 0]}
        fontSize={0.22}
        color="#fbbf24"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        {`💰 ${amount}`}
      </Text>
      
      <Sparkles count={8} scale={1} size={2} speed={0.3} color="#fbbf24" />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Player3D Component — Stylish poker player                          */
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
  const bodyRef = useRef<THREE.Group>(null);
  const armLeftRef = useRef<THREE.Mesh>(null);
  const armRightRef = useRef<THREE.Mesh>(null);
  
  const allCards = getAllCards(player);
  const handEval = evaluateHand(allCards);
  const isFolded = player.status === 'folded';
  const isAllIn = player.status === 'all_in';
  const isActive = focusState !== 'idle';
  const isSpeaking = focusState === 'speaking';
  const isThinking = focusState === 'thinking';
  
  // Consistent appearance
  const hash = player.id.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const skinTone = SKIN_TONES[hash % SKIN_TONES.length];
  const hairColor = HAIR_COLORS[(hash * 3) % HAIR_COLORS.length];
  const outfitColor = OUTFIT_COLORS[(hash * 7) % OUTFIT_COLORS.length];
  
  const playerColor = isFolded ? '#4b5563' : isAllIn ? '#dc2626' : outfitColor;

  useFrame((state) => {
    if (!groupRef.current || !bodyRef.current) return;
    const t = state.clock.elapsedTime;

    if (isFolded) {
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, -0.25, 0.08);
    } else {
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, 0, 0.1);
    }

    // Breathing
    bodyRef.current.scale.y = 1 + Math.sin(t * 1.8) * 0.012;

    if (isActive) {
      const bounce = Math.sin(t * (isThinking ? 2.5 : 4)) * (isThinking ? 0.08 : 0.12);
      groupRef.current.position.y = THREE.MathUtils.lerp(
        groupRef.current.position.y,
        position[1] + bounce,
        0.1
      );
      
      if (armLeftRef.current && armRightRef.current) {
        armLeftRef.current.rotation.x = Math.sin(t * 2.5) * (isSpeaking ? 0.22 : 0.08);
        armRightRef.current.rotation.x = Math.sin(t * 2.5 + Math.PI) * (isSpeaking ? 0.22 : 0.08);
      }
    } else {
      groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, position[1], 0.1);
      if (armLeftRef.current && armRightRef.current) {
        armLeftRef.current.rotation.x = THREE.MathUtils.lerp(armLeftRef.current.rotation.x, 0, 0.1);
        armRightRef.current.rotation.x = THREE.MathUtils.lerp(armRightRef.current.rotation.x, 0, 0.1);
      }
    }

    const targetScale = isActive ? (isSpeaking ? 1.04 : 1.02) : 1;
    groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.08);

    // Face camera
    const dx = state.camera.position.x - groupRef.current.position.x;
    const dz = state.camera.position.z - groupRef.current.position.z;
    const targetYaw = Math.atan2(dx, dz);
    groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetYaw, 0.12);
  });

  const opacity = isFolded ? 0.5 : dimmed ? 0.4 : 1;

  return (
    <group ref={groupRef} position={position} rotation={[0, rotation, 0]}>
      <group ref={bodyRef}>
        {/* Legs */}
        <mesh position={[-0.1, 0.38, 0]} castShadow>
          <capsuleGeometry args={[0.065, 0.5, 4, 8]} />
          <meshStandardMaterial color="#1f2937" transparent opacity={opacity} />
        </mesh>
        <mesh position={[0.1, 0.38, 0]} castShadow>
          <capsuleGeometry args={[0.065, 0.5, 4, 8]} />
          <meshStandardMaterial color="#1f2937" transparent opacity={opacity} />
        </mesh>
        
        {/* Torso */}
        <mesh position={[0, 0.92, 0]} castShadow>
          <capsuleGeometry args={[0.17, 0.42, 4, 12]} />
          <meshStandardMaterial 
            color={playerColor}
            roughness={0.5}
            transparent
            opacity={opacity}
            emissive={isActive && !isFolded ? playerColor : '#000000'}
            emissiveIntensity={isActive ? 0.15 : 0}
          />
        </mesh>
        
        {/* Shirt collar/buttons */}
        <mesh position={[0, 0.92, 0.1]} castShadow>
          <boxGeometry args={[0.08, 0.3, 0.015]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={opacity} />
        </mesh>
        
        {/* Arms */}
        <mesh ref={armLeftRef} position={[-0.26, 0.92, 0]} castShadow>
          <capsuleGeometry args={[0.05, 0.38, 4, 8]} />
          <meshStandardMaterial color={isFolded ? '#6b7280' : skinTone} transparent opacity={opacity} />
        </mesh>
        <mesh ref={armRightRef} position={[0.26, 0.92, 0]} castShadow>
          <capsuleGeometry args={[0.05, 0.38, 4, 8]} />
          <meshStandardMaterial color={isFolded ? '#6b7280' : skinTone} transparent opacity={opacity} />
        </mesh>
        
        {/* Head */}
        <mesh position={[0, 1.38, 0]} castShadow>
          <sphereGeometry args={[0.15, 16, 16]} />
          <meshStandardMaterial color={isFolded ? '#6b7280' : skinTone} transparent opacity={opacity} />
        </mesh>
        
        {/* Hair */}
        <mesh position={[0, 1.47, -0.02]} castShadow>
          <sphereGeometry args={[0.13, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={isFolded ? '#374151' : hairColor} transparent opacity={opacity} />
        </mesh>
        
        {/* Eyes */}
        <mesh position={[-0.05, 1.4, 0.12]}>
          <sphereGeometry args={[0.022, 8, 8]} />
          <meshBasicMaterial color={isFolded ? '#9ca3af' : '#1a1a1a'} />
        </mesh>
        <mesh position={[0.05, 1.4, 0.12]}>
          <sphereGeometry args={[0.022, 8, 8]} />
          <meshBasicMaterial color={isFolded ? '#9ca3af' : '#1a1a1a'} />
        </mesh>
        
        {/* Sunglasses for poker face */}
        {!isFolded && (
          <mesh position={[0, 1.4, 0.14]}>
            <boxGeometry args={[0.18, 0.04, 0.02]} />
            <meshStandardMaterial color="#1a1a1a" transparent opacity={0.8} />
          </mesh>
        )}
      </group>

      {/* Indicators */}
      {isSpeaking && !isFolded && (
        <group position={[0, 1.7, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.18, 0.018, 8, 32]} />
            <meshBasicMaterial color="#4ade80" transparent opacity={0.85} />
          </mesh>
          <Sparkles count={5} scale={0.5} size={2.5} speed={0.4} color="#4ade80" />
        </group>
      )}

      {isThinking && !isFolded && (
        <group position={[0, 1.7, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.2, 0.015, 8, 32]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={0.75} />
          </mesh>
          <Sparkles count={4} scale={0.4} size={2} speed={0.2} color="#38bdf8" />
        </group>
      )}

      {/* All-in effect */}
      {isAllIn && (
        <group position={[0, 1.85, 0]}>
          <Text
            fontSize={0.16}
            color="#ef4444"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.02}
            outlineColor="#000000"
          >
            🔥 ALL-IN
          </Text>
          <Sparkles count={8} scale={0.6} size={3} speed={0.5} color="#ef4444" />
        </group>
      )}

      {/* Info display */}
      <group position={[0, isFolded ? 1.4 : 1.75, 0]}>
        <Text
          position={[0, 0.22, 0]}
          fontSize={0.28}
          color="white"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          {player.expression}
        </Text>
        <Text
          position={[0, -0.02, 0]}
          fontSize={0.14}
          color="white"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.015}
          outlineColor="#000000"
        >
          {player.name}
        </Text>
        
        {/* Hand evaluation */}
        {allCards.length >= 2 && !isFolded && (
          <Text
            position={[0, -0.22, 0]}
            fontSize={0.1}
            color="#4ade80"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.012}
            outlineColor="#000000"
          >
            {`${HAND_RANK_EMOJI[handEval.rank]} ${HAND_RANK_NAME[handEval.rank]}`}
          </Text>
        )}

        {/* Folded status */}
        {isFolded && (
          <Text
            position={[0, -0.22, 0]}
            fontSize={0.12}
            color="#ef4444"
            anchorX="center"
            anchorY="middle"
          >
            ❌ BỎ BÀI
          </Text>
        )}

        {/* Chips */}
        <Text
          position={[0, -0.38, 0]}
          fontSize={0.11}
          color="#fbbf24"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.012}
          outlineColor="#000000"
        >
          {`💰 ${player.chips}`}
        </Text>
        
        {/* Current bet */}
        {player.roundBet > 0 && (
          <Text
            position={[0, -0.52, 0]}
            fontSize={0.1}
            color="#22c55e"
            anchorX="center"
            anchorY="middle"
          >
            {`Cược: ${player.roundBet}`}
          </Text>
        )}
      </group>

      {/* Cards */}
      {!isFolded && (
        <group position={[0, 0.35, 0.85]}>
          {player.holeCard && (
            <Card3D
              position={[0, 0, 0]}
              faceUp={false}
              cardText=""
              index={0}
              isHoleCard={true}
            />
          )}
          
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

      {/* Chips visual */}
      {player.chips > 0 && !isFolded && (
        <ChipStack3D position={[0.8, 0, 0.55]} count={player.chips} />
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Table3D Component — Premium poker table                            */
/* ------------------------------------------------------------------ */
function Table3D() {
  return (
    <group>
      {/* Table top - green felt */}
      <mesh position={[0, 0, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[5.5, 64]} />
        <meshStandardMaterial color="#1a5f2c" roughness={0.92} />
      </mesh>
      
      {/* Inner race track */}
      <mesh position={[0, 0.01, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4.2, 4.6, 64]} />
        <meshStandardMaterial color="#0f4520" roughness={0.9} />
      </mesh>
      
      {/* Table edge - mahogany */}
      <mesh position={[0, -0.1, 0]} receiveShadow>
        <cylinderGeometry args={[5.7, 5.7, 0.2, 64]} />
        <meshStandardMaterial color="#5c2a0a" roughness={0.55} />
      </mesh>
      
      {/* Gold trim */}
      <mesh position={[0, 0, 0]} receiveShadow>
        <cylinderGeometry args={[5.55, 5.55, 0.05, 64]} />
        <meshStandardMaterial color="#d4af37" metalness={0.55} roughness={0.45} />
      </mesh>
      
      {/* Padded rail */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[5.1, 5.5, 64]} />
        <meshStandardMaterial color="#3d2817" roughness={0.75} />
      </mesh>
      
      {/* Center logo area */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.2, 32]} />
        <meshStandardMaterial color="#0f3d1a" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.8, 1, 32]} />
        <meshStandardMaterial color="#d4af37" metalness={0.5} roughness={0.5} transparent opacity={0.6} />
      </mesh>
      
      {/* Dealer button area */}
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.04, 16]} />
        <meshStandardMaterial color="#ffffff" roughness={0.4} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Environment3D Component — VIP poker room                           */
/* ------------------------------------------------------------------ */
function XitoEnvironment3D() {
  return (
    <>
      {/* Ambient */}
      <ambientLight intensity={0.3} color="#fef3c7" />
      
      {/* Main table lamp */}
      <PokerLamp position={[0, 4, 0]} />
      
      {/* Accent spotlights */}
      <spotLight
        castShadow
        position={[0, 6, 0]}
        angle={0.7}
        penumbra={0.4}
        intensity={1.5}
        color="#fef3c7"
        shadow-mapSize={[512, 512]}
      />
      
      {/* Corner accent lights - reduced to 2 */}
      <pointLight position={[-6, 3, -6]} intensity={0.5} color="#a855f7" distance={10} />
      <pointLight position={[6, 3, -6]} intensity={0.5} color="#06b6d4" distance={10} />
      
      {/* Rim lights */}
      <directionalLight position={[4, 3, -4]} intensity={0.25} color="#a855f7" />
      <directionalLight position={[-4, 3, -4]} intensity={0.25} color="#06b6d4" />

      {/* Floor - Rich carpet */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
        <planeGeometry args={[35, 35]} />
        <meshStandardMaterial color="#1a1520" roughness={0.95} />
      </mesh>
      
      {/* Wall hints */}
      <mesh position={[0, 3, -12]} receiveShadow>
        <planeGeometry args={[30, 8]} />
        <meshStandardMaterial color="#2d1f2d" roughness={0.9} />
      </mesh>
      
      {/* Wall decorations */}
      <WallDecor position={[-6, 3, -11.8]} />
      <WallDecor position={[6, 3, -11.8]} />
      
      {/* Corner velvet curtains hinted */}
      <mesh position={[-12, 3, -6]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[15, 8]} />
        <meshStandardMaterial color="#4a1942" roughness={0.85} />
      </mesh>
      <mesh position={[12, 3, -6]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[15, 8]} />
        <meshStandardMaterial color="#4a1942" roughness={0.85} />
      </mesh>
      
      {/* Ceiling */}
      <mesh position={[0, 5.5, 0]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[35, 35]} />
        <meshStandardMaterial color="#0f0f15" roughness={0.92} />
      </mesh>
      
      {/* Ambient sparkle */}
      <Sparkles count={20} scale={22} size={1.2} speed={0.15} opacity={0.25} color="#d4af37" />

      {/* Shadows */}
      <ContactShadows
        resolution={512}
        scale={22}
        blur={2}
        opacity={0.5}
        far={12}
        color="#0a0510"
      />

      {/* Environment */}
      <Environment preset="city" />
      
      {/* Atmosphere fog */}
      <fog attach="fog" args={['#1a1520', 16, 40]} />
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
  const controlsRef = useRef<CameraControls>(null);

  React.useEffect(() => {
    if (!controlsRef.current) return;

    if (!activePlayerId || phase === 'setup' || phase === 'game_over' || phase === 'round_end') {
      controlsRef.current.setLookAt(0, 11, 12, 0, 0.3, 0, true);
      return;
    }

    const playerIndex = players.findIndex((p) => p.id === activePlayerId);
    if (playerIndex >= 0 && playerPositions[playerIndex]) {
      const [x, y, z] = playerPositions[playerIndex].position;
      
      const angle = Math.atan2(z, x);
      const camDist = cameraMode === 'thinking' ? 3 : cameraMode === 'speaking' ? 3.8 : 4.5;
      const sideOffset = cameraMode === 'thinking' ? 0.9 : 0.5;
      const camX = x + Math.cos(angle + Math.PI) * camDist - Math.sin(angle) * sideOffset;
      const camY = y + (cameraMode === 'thinking' ? 2.2 : 2);
      const camZ = z + Math.sin(angle + Math.PI) * camDist + Math.cos(angle) * sideOffset;

      controlsRef.current.setLookAt(camX, camY, camZ, x, y + 0.9, z, true);
    }
  }, [activePlayerId, cameraMode, playerPositions, players, phase]);

  return (
    <CameraControls
      ref={controlsRef}
      smoothTime={0.8}
      minPolarAngle={Math.PI / 6}
      maxPolarAngle={Math.PI / 2.3}
      minDistance={3.5}
      maxDistance={20}
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

  const playerPositions = useMemo(() => {
    const total = players.length;
    if (total === 0) return [];
    
    const radius = 4.5;
    return players.map((_, index) => {
      const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
      
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      
      return {
        position: [x, 1, z] as [number, number, number],
        rotation: -angle + Math.PI / 2,
      };
    });
  }, [players]);

  return (
    <div className="w-full h-full min-h-[300px] rounded-xl overflow-hidden border border-gray-700/50 shadow-2xl bg-gray-900">
      <Canvas 
        shadows={{ type: THREE.PCFShadowMap }}
        camera={{ position: [0, 11, 12], fov: 45 }}
        gl={{ 
          antialias: false, 
          alpha: false, 
          powerPreference: 'high-performance',
          failIfMajorPerformanceCaveat: false,
          preserveDrawingBuffer: true,
        }}
        dpr={1}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            console.warn('WebGL context lost, will attempt recovery...');
          });
          gl.domElement.addEventListener('webglcontextrestored', () => {
            console.log('WebGL context restored');
          });
        }}
      >
        <color attach="background" args={['#0a0510']} />
        
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
