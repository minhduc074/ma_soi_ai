'use client';

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { CameraControls, Text, Environment, ContactShadows, RoundedBox, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { useBlackjackStore } from '@/store/blackjackStore';
import {
  BlackjackPlayer,
  calculateHandValue,
  formatCard,
  getSpecialHand,
  SPECIAL_HAND_INFO,
} from '@/lib/blackjack/types';

const SKIN_TONES = ['#f5d0c5', '#d4a574', '#c68642', '#8d5524', '#6b4423'];
const HAIR_COLORS = ['#1a1a2e', '#4a3728', '#8b4513', '#cd853f', '#2c1810'];
const SUIT_COLORS = ['#1e3a5f', '#4a1942', '#0f3d0f', '#5c1a1a', '#2d2d44'];

/* ------------------------------------------------------------------ */
/*  Neon Light Component                                               */
/* ------------------------------------------------------------------ */
function NeonLight({ 
  position, 
  color, 
  intensity = 1 
}: { 
  position: [number, number, number]; 
  color: string;
  intensity?: number;
}) {
  return (
    <group position={position}>
      <mesh>
        <cylinderGeometry args={[0.03, 0.03, 0.8, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <pointLight color={color} intensity={intensity} distance={6} decay={2} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Casino Pillar Component                                            */
/* ------------------------------------------------------------------ */
function CasinoPillar({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Base */}
      <mesh position={[0, 0.15, 0]} castShadow>
        <boxGeometry args={[0.8, 0.3, 0.8]} />
        <meshStandardMaterial color="#4a3728" roughness={0.6} />
      </mesh>
      {/* Column */}
      <mesh position={[0, 2.5, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.3, 4.5, 16]} />
        <meshStandardMaterial color="#d4af37" metalness={0.3} roughness={0.5} />
      </mesh>
      {/* Capital */}
      <mesh position={[0, 4.85, 0]} castShadow>
        <boxGeometry args={[0.9, 0.2, 0.9]} />
        <meshStandardMaterial color="#d4af37" metalness={0.3} roughness={0.5} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Card3D Component — Detailed 3D card                                */
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
  const offsetX = index * 0.35;
  const offsetZ = index * 0.08;
  
  const isRed = cardText.includes('♥') || cardText.includes('♦');
  
  return (
    <group 
      ref={meshRef} 
      position={[position[0] + offsetX, position[1] + index * 0.02, position[2] + offsetZ]}
      rotation={[-Math.PI / 4, 0, 0]}
    >
      <RoundedBox args={[0.55, 0.75, 0.025]} radius={0.03} castShadow>
        <meshStandardMaterial 
          color={faceUp ? '#fffef5' : '#1e3a8a'} 
          roughness={0.3}
          metalness={0.1}
        />
      </RoundedBox>
      
      {/* Card pattern for back */}
      {!faceUp && (
        <>
          <mesh position={[0, 0, 0.015]}>
            <planeGeometry args={[0.45, 0.65]} />
            <meshBasicMaterial color="#1e40af" />
          </mesh>
          <mesh position={[0, 0, 0.016]}>
            <ringGeometry args={[0.12, 0.18, 16]} />
            <meshBasicMaterial color="#d4af37" />
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
/*  ChipStack3D Component — Premium casino chips                       */
/* ------------------------------------------------------------------ */
function ChipStack3D({
  position,
  count,
}: {
  position: [number, number, number];
  count: number;
}) {
  const stackHeight = Math.min(Math.floor(count / 80), 12);
  const chipColors = ['#dc2626', '#1d4ed8', '#16a34a', '#7c3aed', '#000000'];
  
  return (
    <group position={position}>
      {Array.from({ length: stackHeight }).map((_, i) => (
        <group key={i} position={[0, i * 0.07, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.18, 0.18, 0.05, 24]} />
            <meshStandardMaterial 
              color={chipColors[i % chipColors.length]}
              roughness={0.3}
              metalness={0.4}
            />
          </mesh>
          {/* Chip edge detail */}
          <mesh>
            <torusGeometry args={[0.18, 0.01, 8, 24]} />
            <meshStandardMaterial color="#d4af37" metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Dealer3D Component — Sophisticated dealer character                */
/* ------------------------------------------------------------------ */
function Dealer3D({
  player,
  position,
  focusState,
  dimmed,
}: {
  player: BlackjackPlayer;
  position: [number, number, number];
  focusState: 'idle' | 'active' | 'speaking' | 'thinking';
  dimmed: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  
  const handValue = calculateHandValue(player.hand);
  const isBusted = player.status === 'busted';
  const isActive = focusState !== 'idle';
  const isSpeaking = focusState === 'speaking';
  const isThinking = focusState === 'thinking';

  useFrame((state) => {
    if (!groupRef.current || !bodyRef.current) return;
    const t = state.clock.elapsedTime;

    // Breathing
    bodyRef.current.scale.y = 1 + Math.sin(t * 1.5) * 0.015;

    if (isActive) {
      const bounce = Math.sin(t * (isThinking ? 2.5 : 4)) * (isThinking ? 0.06 : 0.1);
      groupRef.current.position.y = THREE.MathUtils.lerp(
        groupRef.current.position.y,
        position[1] + bounce,
        0.1
      );
    } else {
      groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, position[1], 0.1);
    }

    const targetScale = isActive ? (isSpeaking ? 1.04 : 1.02) : 1;
    groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.08);

    // Face camera
    const dx = state.camera.position.x - groupRef.current.position.x;
    const dz = state.camera.position.z - groupRef.current.position.z;
    const targetYaw = Math.atan2(dx, dz);
    groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetYaw, 0.1);
  });

  const opacity = isBusted ? 0.6 : dimmed ? 0.45 : 1;

  return (
    <group ref={groupRef} position={position}>
      <group ref={bodyRef}>
        {/* Legs */}
        <mesh position={[-0.1, 0.4, 0]} castShadow>
          <capsuleGeometry args={[0.07, 0.55, 4, 8]} />
          <meshStandardMaterial color="#1a1a1a" transparent opacity={opacity} />
        </mesh>
        <mesh position={[0.1, 0.4, 0]} castShadow>
          <capsuleGeometry args={[0.07, 0.55, 4, 8]} />
          <meshStandardMaterial color="#1a1a1a" transparent opacity={opacity} />
        </mesh>
        
        {/* Torso - Red dealer vest */}
        <mesh position={[0, 0.95, 0]} castShadow>
          <capsuleGeometry args={[0.18, 0.45, 4, 12]} />
          <meshStandardMaterial 
            color={isBusted ? '#4b5563' : '#991b1b'}
            roughness={0.5}
            transparent
            opacity={opacity}
            emissive={isActive ? '#991b1b' : '#000000'}
            emissiveIntensity={isActive ? 0.2 : 0}
          />
        </mesh>
        
        {/* White shirt collar */}
        <mesh position={[0, 1.15, 0.08]} castShadow>
          <boxGeometry args={[0.25, 0.08, 0.05]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={opacity} />
        </mesh>
        
        {/* Bow tie */}
        <mesh position={[0, 1.1, 0.12]} castShadow>
          <boxGeometry args={[0.12, 0.05, 0.03]} />
          <meshStandardMaterial color="#1a1a1a" transparent opacity={opacity} />
        </mesh>
        
        {/* Arms */}
        <mesh position={[-0.28, 0.95, 0]} castShadow>
          <capsuleGeometry args={[0.05, 0.4, 4, 8]} />
          <meshStandardMaterial color="#f5d0c5" transparent opacity={opacity} />
        </mesh>
        <mesh position={[0.28, 0.95, 0]} castShadow>
          <capsuleGeometry args={[0.05, 0.4, 4, 8]} />
          <meshStandardMaterial color="#f5d0c5" transparent opacity={opacity} />
        </mesh>
        
        {/* Head */}
        <mesh position={[0, 1.4, 0]} castShadow>
          <sphereGeometry args={[0.16, 16, 16]} />
          <meshStandardMaterial color="#f5d0c5" transparent opacity={opacity} />
        </mesh>
        
        {/* Hair - slicked back */}
        <mesh position={[0, 1.48, -0.04]} castShadow>
          <sphereGeometry args={[0.14, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#1a1a1a" transparent opacity={opacity} />
        </mesh>
        
        {/* Eyes */}
        <mesh position={[-0.05, 1.42, 0.12]}>
          <sphereGeometry args={[0.025, 8, 8]} />
          <meshBasicMaterial color="#1a1a1a" />
        </mesh>
        <mesh position={[0.05, 1.42, 0.12]}>
          <sphereGeometry args={[0.025, 8, 8]} />
          <meshBasicMaterial color="#1a1a1a" />
        </mesh>
        
        {/* Dealer visor */}
        <mesh position={[0, 1.52, 0.08]} rotation={[-0.3, 0, 0]} castShadow>
          <cylinderGeometry args={[0.15, 0.18, 0.04, 16, 1, false, -Math.PI / 2, Math.PI]} />
          <meshStandardMaterial color="#059669" transparent opacity={opacity} />
        </mesh>
      </group>

      {/* Indicators */}
      {isSpeaking && (
        <group position={[0, 1.75, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.18, 0.02, 8, 32]} />
            <meshBasicMaterial color="#4ade80" transparent opacity={0.85} />
          </mesh>
          <Sparkles count={5} scale={0.5} size={2.5} speed={0.4} color="#4ade80" />
        </group>
      )}

      {isThinking && (
        <group position={[0, 1.75, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.2, 0.015, 8, 32]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={0.75} />
          </mesh>
          <Sparkles count={4} scale={0.4} size={2} speed={0.2} color="#38bdf8" />
        </group>
      )}

      {/* Info display */}
      <group position={[0, 1.85, 0]}>
        <Text
          position={[0, 0.2, 0]}
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
          color="#d4af37"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.015}
          outlineColor="#000000"
        >
          {player.name}
        </Text>
        
        {player.hand.length > 0 && (
          <Text
            position={[0, -0.22, 0]}
            fontSize={0.13}
            color={isBusted ? '#ef4444' : '#4ade80'}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.015}
            outlineColor="#000000"
          >
            {isBusted ? 'QUẮC!' : `${handValue} điểm`}
          </Text>
        )}
      </group>

      {/* Cards */}
      <group position={[0, 0.35, 0.9]}>
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
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Player3D Component — Stylish casino player                         */
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
  const bodyRef = useRef<THREE.Group>(null);
  const armLeftRef = useRef<THREE.Mesh>(null);
  const armRightRef = useRef<THREE.Mesh>(null);
  
  const handValue = calculateHandValue(player.hand);
  const specialHand = getSpecialHand(player.hand);
  const isBusted = player.status === 'busted';
  const isDealer = player.isDealer;
  const isActive = focusState !== 'idle';
  const isSpeaking = focusState === 'speaking';
  const isThinking = focusState === 'thinking';
  
  // Consistent appearance based on player id
  const hash = player.id.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const skinTone = SKIN_TONES[hash % SKIN_TONES.length];
  const hairColor = HAIR_COLORS[(hash * 3) % HAIR_COLORS.length];
  const suitColor = SUIT_COLORS[(hash * 7) % SUIT_COLORS.length];

  useFrame((state) => {
    if (!groupRef.current || !bodyRef.current) return;
    const t = state.clock.elapsedTime;

    if (isBusted) {
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, -0.25, 0.08);
    } else {
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, 0, 0.1);
    }

    // Breathing
    bodyRef.current.scale.y = 1 + Math.sin(t * 1.8) * 0.015;

    if (isActive) {
      const bounce = Math.sin(t * (isThinking ? 2.5 : 4)) * (isThinking ? 0.08 : 0.12);
      groupRef.current.position.y = THREE.MathUtils.lerp(
        groupRef.current.position.y,
        position[1] + bounce,
        0.1
      );
      
      // Arm gestures
      if (armLeftRef.current && armRightRef.current) {
        armLeftRef.current.rotation.x = Math.sin(t * 2.5) * (isSpeaking ? 0.25 : 0.08);
        armRightRef.current.rotation.x = Math.sin(t * 2.5 + Math.PI) * (isSpeaking ? 0.25 : 0.08);
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

  const opacity = isBusted ? 0.55 : dimmed ? 0.4 : 1;

  return (
    <group ref={groupRef} position={position} rotation={[0, rotation, 0]}>
      <group ref={bodyRef}>
        {/* Legs */}
        <mesh position={[-0.1, 0.38, 0]} castShadow>
          <capsuleGeometry args={[0.065, 0.5, 4, 8]} />
          <meshStandardMaterial color={isBusted ? '#4b5563' : '#1f2937'} transparent opacity={opacity} />
        </mesh>
        <mesh position={[0.1, 0.38, 0]} castShadow>
          <capsuleGeometry args={[0.065, 0.5, 4, 8]} />
          <meshStandardMaterial color={isBusted ? '#4b5563' : '#1f2937'} transparent opacity={opacity} />
        </mesh>
        
        {/* Torso - Suit jacket */}
        <mesh position={[0, 0.92, 0]} castShadow>
          <capsuleGeometry args={[0.17, 0.42, 4, 12]} />
          <meshStandardMaterial 
            color={isBusted ? '#4b5563' : suitColor}
            roughness={0.5}
            transparent
            opacity={opacity}
            emissive={isActive ? suitColor : '#000000'}
            emissiveIntensity={isActive ? 0.15 : 0}
          />
        </mesh>
        
        {/* White shirt */}
        <mesh position={[0, 0.92, 0.08]} castShadow>
          <boxGeometry args={[0.12, 0.35, 0.02]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={opacity} />
        </mesh>
        
        {/* Arms */}
        <mesh ref={armLeftRef} position={[-0.26, 0.92, 0]} castShadow>
          <capsuleGeometry args={[0.05, 0.38, 4, 8]} />
          <meshStandardMaterial color={isBusted ? '#6b7280' : skinTone} transparent opacity={opacity} />
        </mesh>
        <mesh ref={armRightRef} position={[0.26, 0.92, 0]} castShadow>
          <capsuleGeometry args={[0.05, 0.38, 4, 8]} />
          <meshStandardMaterial color={isBusted ? '#6b7280' : skinTone} transparent opacity={opacity} />
        </mesh>
        
        {/* Head */}
        <mesh position={[0, 1.38, 0]} castShadow>
          <sphereGeometry args={[0.15, 16, 16]} />
          <meshStandardMaterial color={isBusted ? '#6b7280' : skinTone} transparent opacity={opacity} />
        </mesh>
        
        {/* Hair */}
        <mesh position={[0, 1.47, -0.02]} castShadow>
          <sphereGeometry args={[0.13, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={isBusted ? '#374151' : hairColor} transparent opacity={opacity} />
        </mesh>
        
        {/* Eyes */}
        <mesh position={[-0.05, 1.4, 0.12]}>
          <sphereGeometry args={[0.022, 8, 8]} />
          <meshBasicMaterial color={isBusted ? '#9ca3af' : '#1a1a1a'} />
        </mesh>
        <mesh position={[0.05, 1.4, 0.12]}>
          <sphereGeometry args={[0.022, 8, 8]} />
          <meshBasicMaterial color={isBusted ? '#9ca3af' : '#1a1a1a'} />
        </mesh>
      </group>

      {/* Indicators */}
      {isSpeaking && (
        <group position={[0, 1.7, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.18, 0.018, 8, 32]} />
            <meshBasicMaterial color="#4ade80" transparent opacity={0.85} />
          </mesh>
          <Sparkles count={5} scale={0.5} size={2.5} speed={0.4} color="#4ade80" />
        </group>
      )}

      {isThinking && (
        <group position={[0, 1.7, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.2, 0.015, 8, 32]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={0.75} />
          </mesh>
          <Sparkles count={4} scale={0.4} size={2} speed={0.2} color="#38bdf8" />
        </group>
      )}

      {/* Info display */}
      <group position={[0, 1.85, 0]}>
        <Text
          position={[0, 0.2, 0]}
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

        {player.hand.length > 0 && (
          <Text
            position={[0, -0.22, 0]}
            fontSize={0.12}
            color={isBusted ? '#ef4444' : '#fbbf24'}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.015}
            outlineColor="#000000"
          >
            {isBusted ? 'QUẮC!' : `${handValue} điểm`}
          </Text>
        )}
        
        {specialHand !== 'normal' && specialHand !== 'quac' && (
          <Text
            position={[0, -0.38, 0]}
            fontSize={0.1}
            color="#4ade80"
            anchorX="center"
            anchorY="middle"
          >
            {SPECIAL_HAND_INFO[specialHand].name}
          </Text>
        )}

        {!isDealer && (
          <Text
            position={[0, -0.52, 0]}
            fontSize={0.11}
            color="#fbbf24"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.012}
            outlineColor="#000000"
          >
            {`💰 ${player.chips}`}
          </Text>
        )}
      </group>

      {/* Cards */}
      <group position={[0, 0.35, 0.85]}>
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

      {/* Chips */}
      {!isDealer && player.chips > 0 && (
        <ChipStack3D position={[0.75, 0, 0.55]} count={player.chips} />
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Table3D Component — Luxurious blackjack table                      */
/* ------------------------------------------------------------------ */
function Table3D() {
  return (
    <group>
      {/* Table top - green felt */}
      <mesh position={[0, 0, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[6.5, 48, 0, Math.PI]} />
        <meshStandardMaterial color="#1a5f2c" roughness={0.9} />
      </mesh>
      
      {/* Betting circles */}
      {[-3.5, -1.2, 1.2, 3.5].map((x, i) => (
        <mesh key={i} position={[x, 0.01, 2.5]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.35, 0.45, 32]} />
          <meshStandardMaterial color="#d4af37" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
      
      {/* Table edge - mahogany wood */}
      <mesh position={[0, -0.08, 0]} receiveShadow>
        <cylinderGeometry args={[6.7, 6.7, 0.16, 48, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#5c2a0a" roughness={0.6} />
      </mesh>
      
      {/* Gold trim */}
      <mesh position={[0, 0, 0]} receiveShadow>
        <cylinderGeometry args={[6.55, 6.55, 0.04, 48, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#d4af37" metalness={0.6} roughness={0.4} />
      </mesh>
      
      {/* Inner rail */}
      <mesh position={[0, 0.02, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[5.8, 6, 48, 1, 0, Math.PI]} />
        <meshStandardMaterial color="#3d1a0a" roughness={0.7} />
      </mesh>
      
      {/* Dealer area */}
      <mesh position={[0, 0.01, -3.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.5, 1]} />
        <meshStandardMaterial color="#0f4520" roughness={0.85} />
      </mesh>
      
      {/* "BLACKJACK PAYS 3 TO 2" text area */}
      <mesh position={[0, 0.012, -1.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[4, 0.3]} />
        <meshStandardMaterial color="#d4af37" transparent opacity={0.3} />
      </mesh>
      
      {/* Card shoe */}
      <mesh position={[5.5, 0.25, -2]} castShadow>
        <boxGeometry args={[0.4, 0.5, 0.8]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.4} />
      </mesh>
      
      {/* Chip tray */}
      <mesh position={[-5, 0.1, -2]} castShadow>
        <boxGeometry args={[1.5, 0.2, 0.6]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.4} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Environment3D Component — Luxury casino atmosphere                 */
/* ------------------------------------------------------------------ */
function BlackjackEnvironment3D() {
  return (
    <>
      {/* Main ambient */}
      <ambientLight intensity={0.35} color="#fef3c7" />
      
      {/* Spotlight on table */}
      <spotLight
        castShadow
        position={[0, 8, 0]}
        angle={0.6}
        penumbra={0.5}
        intensity={2}
        color="#fef3c7"
        shadow-mapSize={[512, 512]}
      />
      
      {/* Accent lights */}
      <pointLight position={[-6, 4, 3]} intensity={0.6} color="#ef4444" distance={10} />
      <pointLight position={[6, 4, 3]} intensity={0.6} color="#3b82f6" distance={10} />
      <pointLight position={[0, 3, -5]} intensity={0.4} color="#d4af37" distance={8} />
      
      {/* Rim lights */}
      <directionalLight position={[5, 3, -3]} intensity={0.3} color="#818cf8" />
      <directionalLight position={[-5, 3, -3]} intensity={0.3} color="#fb7185" />

      {/* Floor - Casino carpet pattern */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#1f1520" roughness={0.95} />
      </mesh>
      
      {/* Casino pillars */}
      <CasinoPillar position={[-10, 0, -8]} />
      <CasinoPillar position={[10, 0, -8]} />
      <CasinoPillar position={[-10, 0, 8]} />
      <CasinoPillar position={[10, 0, 8]} />
      
      {/* Neon lights */}
      <NeonLight position={[-8, 4, -6]} color="#ef4444" intensity={0.8} />
      <NeonLight position={[8, 4, -6]} color="#3b82f6" intensity={0.8} />
      <NeonLight position={[-8, 4, 6]} color="#a855f7" intensity={0.6} />
      <NeonLight position={[8, 4, 6]} color="#22c55e" intensity={0.6} />
      
      {/* Ceiling hint */}
      <mesh position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#0f0f15" roughness={0.9} />
      </mesh>
      
      {/* Chandelier hint */}
      <mesh position={[0, 5.5, 0]}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshStandardMaterial color="#d4af37" metalness={0.7} roughness={0.3} emissive="#fef3c7" emissiveIntensity={0.3} />
      </mesh>
      <pointLight position={[0, 5.5, 0]} intensity={1.5} color="#fef3c7" distance={15} />
      
      {/* Sparkle effects */}
      <Sparkles count={25} scale={25} size={1.5} speed={0.2} opacity={0.3} color="#d4af37" />

      {/* Shadows */}
      <ContactShadows
        resolution={512}
        scale={25}
        blur={2}
        opacity={0.55}
        far={12}
        color="#0a0510"
      />

      {/* Environment */}
      <Environment preset="city" />
      
      {/* Fog for atmosphere */}
      <fog attach="fog" args={['#1a1520', 18, 45]} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  CinematicCameraController Component                                */
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
  const controlsRef = useRef<CameraControls>(null);

  React.useEffect(() => {
    if (!controlsRef.current) return;

    if (!activePlayerId || (phase !== 'player_turns' && phase !== 'dealer_turn')) {
      controlsRef.current.setLookAt(0, 9, 12, 0, 0.3, 0, true);
      return;
    }

    if (activePlayerId === dealerId) {
      const distance = cameraMode === 'thinking' ? 2.8 : 3.5;
      const height = cameraMode === 'thinking' ? 3.2 : 2.8;
      controlsRef.current.setLookAt(0.9, height, -3 + distance, 0, 1.4, -3, true);
      return;
    }

    const playerIndex = players.findIndex((p) => p.id === activePlayerId);
    if (playerIndex >= 0 && playerPositions[playerIndex]) {
      const [x, y, z] = playerPositions[playerIndex].position;
      
      const dx = 0 - x;
      const dz = -3 - z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const dirX = dx / dist;
      const dirZ = dz / dist;

      const distance = cameraMode === 'thinking' ? 2.4 : cameraMode === 'speaking' ? 3.2 : 3.8;
      const sideOffset = cameraMode === 'thinking' ? 0.9 : 0.55;
      const camX = x + dirX * distance - dirZ * sideOffset;
      const camY = y + (cameraMode === 'thinking' ? 2.2 : 1.9);
      const camZ = z + dirZ * distance + dirX * sideOffset;

      controlsRef.current.setLookAt(camX, camY, camZ, x, y + 0.9, z, true);
    }
  }, [activePlayerId, cameraMode, dealerId, playerPositions, players, phase]);

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

  const playerPositions = useMemo(() => {
    const total = players.length;
    if (total === 0) return [];
    
    const radius = 4.5;
    return players.map((_, index) => {
      const spreadAngle = 0.75;
      const startAngle = -Math.PI / 2 * spreadAngle;
      const endAngle = Math.PI / 2 * spreadAngle;
      const angleStep = total > 1 ? (endAngle - startAngle) / (total - 1) : 0;
      const angle = startAngle + index * angleStep;
      
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius + 2;
      
      return {
        position: [x, 1, z] as [number, number, number],
        rotation: -angle,
      };
    });
  }, [players]);

  return (
    <div className="w-full h-full min-h-[300px] rounded-xl overflow-hidden border border-gray-700/50 shadow-2xl bg-gray-900">
      <Canvas 
        shadows 
        camera={{ position: [0, 9, 12], fov: 45 }}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
        dpr={1}
      >
        <color attach="background" args={['#0a0510']} />
        
        <BlackjackEnvironment3D />
        <Table3D />

        {/* Dealer */}
        {dealer && (
          <Dealer3D
            player={dealer}
            position={[0, 1, -3.5]}
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
