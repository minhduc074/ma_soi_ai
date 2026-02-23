'use client';

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { CameraControls, Text, Environment, ContactShadows, Sparkles, Stars } from '@react-three/drei';
import * as THREE from 'three';
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
/*  Particle Effects                                                   */
/* ------------------------------------------------------------------ */
function Fireflies({ count = 50 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 1] = Math.random() * 5 + 0.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 20;
    }
    return pos;
  }, [count]);

  useFrame((state) => {
    if (!ref.current) return;
    const time = state.clock.elapsedTime;
    const posArray = ref.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < count; i++) {
      posArray[i * 3 + 1] += Math.sin(time * 2 + i) * 0.002;
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial size={0.08} color="#fbbf24" transparent opacity={0.8} />
    </points>
  );
}

/* ------------------------------------------------------------------ */
/*  Tree Component                                                     */
/* ------------------------------------------------------------------ */
function Tree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      {/* Trunk */}
      <mesh position={[0, 0.8, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.25, 1.6, 8]} />
        <meshStandardMaterial color="#5d4037" roughness={0.9} />
      </mesh>
      {/* Foliage layers */}
      <mesh position={[0, 2, 0]} castShadow>
        <coneGeometry args={[1.2, 1.5, 8]} />
        <meshStandardMaterial color="#2d5016" roughness={0.8} />
      </mesh>
      <mesh position={[0, 2.8, 0]} castShadow>
        <coneGeometry args={[0.9, 1.2, 8]} />
        <meshStandardMaterial color="#3d6b22" roughness={0.8} />
      </mesh>
      <mesh position={[0, 3.5, 0]} castShadow>
        <coneGeometry args={[0.5, 0.9, 8]} />
        <meshStandardMaterial color="#4a7c2a" roughness={0.8} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Rock Component                                                     */
/* ------------------------------------------------------------------ */
function Rock({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <mesh position={position} scale={scale} castShadow receiveShadow>
      <dodecahedronGeometry args={[0.4, 0]} />
      <meshStandardMaterial color="#6b7280" roughness={0.9} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/*  Campfire Component                                                 */
/* ------------------------------------------------------------------ */
function Campfire({ isNight }: { isNight: boolean }) {
  const flameRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (!flameRef.current) return;
    const t = state.clock.elapsedTime;
    flameRef.current.scale.y = 1 + Math.sin(t * 10) * 0.15;
    flameRef.current.rotation.y = t * 2;
  });

  return (
    <group position={[0, 0.1, 0]}>
      {/* Stone ring */}
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(angle) * 1.2, 0.15, Math.sin(angle) * 1.2]} castShadow>
            <dodecahedronGeometry args={[0.25, 0]} />
            <meshStandardMaterial color="#4b5563" roughness={0.9} />
          </mesh>
        );
      })}
      
      {/* Logs */}
      {[0, 60, 120].map((angle, i) => (
        <mesh key={i} position={[0, 0.15, 0]} rotation={[0, (angle * Math.PI) / 180, Math.PI / 6]} castShadow>
          <cylinderGeometry args={[0.08, 0.1, 1.4, 8]} />
          <meshStandardMaterial color="#3d2817" roughness={0.9} />
        </mesh>
      ))}
      
      {/* Fire glow base */}
      <mesh position={[0, 0.2, 0]}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshBasicMaterial color="#ff6b35" transparent opacity={0.6} />
      </mesh>
      
      {/* Animated flames */}
      <group ref={flameRef} position={[0, 0.4, 0]}>
        <mesh position={[0, 0.3, 0]}>
          <coneGeometry args={[0.25, 0.8, 8]} />
          <meshBasicMaterial color="#ff8c42" transparent opacity={0.9} />
        </mesh>
        <mesh position={[0.1, 0.2, 0.1]}>
          <coneGeometry args={[0.15, 0.5, 6]} />
          <meshBasicMaterial color="#ffd166" transparent opacity={0.8} />
        </mesh>
        <mesh position={[-0.08, 0.25, -0.08]}>
          <coneGeometry args={[0.12, 0.45, 6]} />
          <meshBasicMaterial color="#ffec8b" transparent opacity={0.7} />
        </mesh>
      </group>
      
      {/* Fire light */}
      <pointLight 
        position={[0, 0.8, 0]} 
        intensity={isNight ? 3 : 1} 
        color="#ff8c42" 
        distance={isNight ? 12 : 6} 
        decay={2}
      />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Character3D Component - Detailed humanoid character                */
/* ------------------------------------------------------------------ */
function Character3D({
  player,
  position,
  focusState,
  dimmed,
  expression,
}: {
  player: { id: string; name: string; role: Role; alive: boolean };
  position: [number, number, number];
  focusState: 'idle' | 'active' | 'speaking' | 'thinking';
  dimmed: boolean;
  expression?: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const armLeftRef = useRef<THREE.Mesh>(null);
  const armRightRef = useRef<THREE.Mesh>(null);
  
  const roleInfo = ROLE_INFO[player.role];
  const color = ROLE_COLORS[player.role];
  const isDead = !player.alive;
  const isActive = focusState !== 'idle';
  const isSpeaking = focusState === 'speaking';
  const isThinking = focusState === 'thinking';
  
  // Consistent appearance based on player id
  const hash = player.id.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const skinTone = SKIN_TONES[hash % SKIN_TONES.length];
  const hairColor = HAIR_COLORS[(hash * 3) % HAIR_COLORS.length];

  useFrame((state) => {
    if (!groupRef.current || !bodyRef.current) return;
    const t = state.clock.elapsedTime;

    if (isDead) {
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, -Math.PI / 2, 0.08);
      groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, 0.3, 0.08);
    } else {
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, 0, 0.1);
      
      // Breathing animation
      const breathe = Math.sin(t * 2) * 0.02;
      bodyRef.current.scale.y = 1 + breathe;
      
      if (isActive) {
        const bounce = Math.sin(t * (isThinking ? 3 : 5)) * (isThinking ? 0.08 : 0.12);
        groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, position[1] + bounce, 0.1);
        
        // Arm animation
        if (armLeftRef.current && armRightRef.current) {
          armLeftRef.current.rotation.x = Math.sin(t * 3) * (isSpeaking ? 0.3 : 0.1);
          armRightRef.current.rotation.x = Math.sin(t * 3 + Math.PI) * (isSpeaking ? 0.3 : 0.1);
        }
      } else {
        groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, position[1], 0.1);
        if (armLeftRef.current && armRightRef.current) {
          armLeftRef.current.rotation.x = THREE.MathUtils.lerp(armLeftRef.current.rotation.x, 0, 0.1);
          armRightRef.current.rotation.x = THREE.MathUtils.lerp(armRightRef.current.rotation.x, 0, 0.1);
        }
      }

      const targetScale = isActive ? (isSpeaking ? 1.05 : 1.02) : 1;
      groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.08);

      // Face camera
      const dx = state.camera.position.x - groupRef.current.position.x;
      const dz = state.camera.position.z - groupRef.current.position.z;
      const targetYaw = Math.atan2(dx, dz);
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetYaw, 0.12);
    }
  });

  const opacity = isDead ? 0.5 : dimmed ? 0.4 : 1;

  return (
    <group ref={groupRef} position={position}>
      <group ref={bodyRef}>
        {/* Legs */}
        <mesh position={[-0.12, 0.35, 0]} castShadow>
          <capsuleGeometry args={[0.08, 0.5, 4, 8]} />
          <meshStandardMaterial color={isDead ? '#4b5563' : '#1f2937'} transparent opacity={opacity} />
        </mesh>
        <mesh position={[0.12, 0.35, 0]} castShadow>
          <capsuleGeometry args={[0.08, 0.5, 4, 8]} />
          <meshStandardMaterial color={isDead ? '#4b5563' : '#1f2937'} transparent opacity={opacity} />
        </mesh>
        
        {/* Torso - colored by role */}
        <mesh position={[0, 0.9, 0]} castShadow>
          <capsuleGeometry args={[0.2, 0.4, 4, 12]} />
          <meshStandardMaterial 
            color={isDead ? '#4b5563' : color}
            roughness={0.6}
            transparent
            opacity={opacity}
            emissive={isActive && !isDead ? color : '#000000'}
            emissiveIntensity={isActive ? 0.3 : 0}
          />
        </mesh>
        
        {/* Arms */}
        <mesh ref={armLeftRef} position={[-0.32, 0.9, 0]} castShadow>
          <capsuleGeometry args={[0.06, 0.35, 4, 8]} />
          <meshStandardMaterial color={isDead ? '#6b7280' : skinTone} transparent opacity={opacity} />
        </mesh>
        <mesh ref={armRightRef} position={[0.32, 0.9, 0]} castShadow>
          <capsuleGeometry args={[0.06, 0.35, 4, 8]} />
          <meshStandardMaterial color={isDead ? '#6b7280' : skinTone} transparent opacity={opacity} />
        </mesh>
        
        {/* Head */}
        <mesh position={[0, 1.35, 0]} castShadow>
          <sphereGeometry args={[0.18, 16, 16]} />
          <meshStandardMaterial color={isDead ? '#6b7280' : skinTone} transparent opacity={opacity} />
        </mesh>
        
        {/* Hair */}
        <mesh position={[0, 1.45, -0.02]} castShadow>
          <sphereGeometry args={[0.16, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={isDead ? '#374151' : hairColor} transparent opacity={opacity} />
        </mesh>
        
        {/* Eyes */}
        <mesh position={[-0.06, 1.38, 0.14]}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshBasicMaterial color={isDead ? '#9ca3af' : '#1a1a1a'} />
        </mesh>
        <mesh position={[0.06, 1.38, 0.14]}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshBasicMaterial color={isDead ? '#9ca3af' : '#1a1a1a'} />
        </mesh>
        
        {/* Role-specific accessory */}
        {player.role === 'werewolf' && !isDead && (
          <>
            {/* Wolf ears */}
            <mesh position={[-0.12, 1.55, 0]} rotation={[0, 0, -0.3]} castShadow>
              <coneGeometry args={[0.05, 0.12, 4]} />
              <meshStandardMaterial color="#374151" />
            </mesh>
            <mesh position={[0.12, 1.55, 0]} rotation={[0, 0, 0.3]} castShadow>
              <coneGeometry args={[0.05, 0.12, 4]} />
              <meshStandardMaterial color="#374151" />
            </mesh>
          </>
        )}
        {player.role === 'witch' && !isDead && (
          /* Witch hat */
          <group position={[0, 1.55, 0]}>
            <mesh>
              <coneGeometry args={[0.15, 0.35, 8]} />
              <meshStandardMaterial color="#1a1a2e" />
            </mesh>
            <mesh position={[0, -0.1, 0]}>
              <cylinderGeometry args={[0.22, 0.22, 0.03, 16]} />
              <meshStandardMaterial color="#1a1a2e" />
            </mesh>
          </group>
        )}
        {player.role === 'guard' && !isDead && (
          /* Shield on back */
          <mesh position={[0, 0.9, -0.25]} rotation={[0.2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.15, 0.18, 0.05, 6]} />
            <meshStandardMaterial color="#60a5fa" metalness={0.6} roughness={0.3} />
          </mesh>
        )}
        {player.role === 'hunter' && !isDead && (
          /* Bow on back */
          <mesh position={[0.2, 1, -0.15]} rotation={[0, 0.5, 0.3]} castShadow>
            <torusGeometry args={[0.15, 0.015, 8, 16, Math.PI]} />
            <meshStandardMaterial color="#8b4513" />
          </mesh>
        )}
        {player.role === 'seer' && !isDead && (
          /* Mystical orb */
          <mesh position={[0.25, 0.7, 0.1]}>
            <sphereGeometry args={[0.06, 16, 16]} />
            <meshStandardMaterial color="#a855f7" emissive="#a855f7" emissiveIntensity={0.5} transparent opacity={0.8} />
          </mesh>
        )}
      </group>

      {/* Speaking indicator - animated rings */}
      {isSpeaking && !isDead && (
        <group position={[0, 1.7, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.2, 0.02, 8, 32]} />
            <meshBasicMaterial color="#4ade80" transparent opacity={0.8} />
          </mesh>
          <Sparkles count={6} scale={0.8} size={3} speed={0.4} color="#4ade80" />
        </group>
      )}

      {/* Thinking indicator */}
      {isThinking && !isDead && (
        <group position={[0, 1.7, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.22, 0.015, 8, 32]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={0.7} />
          </mesh>
          <Sparkles count={5} scale={0.6} size={2} speed={0.2} color="#38bdf8" />
        </group>
      )}

      {/* Name and role */}
      <group position={[0, isDead ? 0.6 : 1.9, 0]}>
        <Text
          position={[0, 0.25, 0]}
          fontSize={0.22}
          color={isDead ? '#6b7280' : 'white'}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          {isDead ? '💀' : roleInfo.emoji}
        </Text>
        <Text
          position={[0, 0, 0]}
          fontSize={0.16}
          color={isDead ? '#6b7280' : 'white'}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.015}
          outlineColor="#000000"
        >
          {player.name}
        </Text>
        {/* Expression bubble */}
        {expression && !isDead && (
          <Text
            position={[0, 0.55, 0]}
            fontSize={0.35}
            anchorX="center"
            anchorY="middle"
          >
            {expression}
          </Text>
        )}
      </group>
      
      {/* Death effect */}
      {isDead && (
        <mesh position={[0, 0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.3, 0.8, 32]} />
          <meshBasicMaterial color="#ef4444" transparent opacity={0.3} />
        </mesh>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  VillageEnvironment3D Component - Detailed village scene            */
/* ------------------------------------------------------------------ */
function VillageEnvironment3D({ isNight }: { isNight: boolean }) {
  return (
    <>
      {/* Main lighting */}
      <ambientLight intensity={isNight ? 0.15 : 0.5} color={isNight ? '#4c5c9c' : '#fff5eb'} />
      
      {/* Sun/Moon light */}
      <directionalLight
        castShadow
        position={isNight ? [-8, 15, -8] : [8, 15, 5]}
        intensity={isNight ? 0.3 : 1.2}
        color={isNight ? '#a5b4fc' : '#fef3c7'}
        shadow-mapSize={[512, 512]}
        shadow-camera-far={50}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      
      {/* Rim light for characters */}
      <directionalLight
        position={[0, 5, -10]}
        intensity={isNight ? 0.2 : 0.4}
        color={isNight ? '#818cf8' : '#fbbf24'}
      />

      {/* Ground - layered for depth */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <circleGeometry args={[25, 64]} />
        <meshStandardMaterial 
          color={isNight ? '#1a2e1a' : '#2d5a27'} 
          roughness={0.95}
        />
      </mesh>
      
      {/* Inner clearing */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} receiveShadow>
        <circleGeometry args={[9, 48]} />
        <meshStandardMaterial 
          color={isNight ? '#2d3a2d' : '#5a7d4a'} 
          roughness={0.9}
        />
      </mesh>
      
      {/* Dirt path around campfire */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <ringGeometry args={[1.8, 3.5, 32]} />
        <meshStandardMaterial color={isNight ? '#3d3529' : '#8b7355'} roughness={0.95} />
      </mesh>

      {/* Campfire */}
      <Campfire isNight={isNight} />
      
      {/* Trees around the clearing */}
      <Tree position={[-10, 0, -8]} scale={1.2} />
      <Tree position={[-12, 0, -3]} scale={0.9} />
      <Tree position={[-11, 0, 4]} scale={1.1} />
      <Tree position={[-9, 0, 9]} scale={1.0} />
      <Tree position={[10, 0, -7]} scale={1.1} />
      <Tree position={[12, 0, 0]} scale={0.85} />
      <Tree position={[11, 0, 6]} scale={1.15} />
      <Tree position={[8, 0, 10]} scale={0.95} />
      <Tree position={[0, 0, -12]} scale={1.0} />
      <Tree position={[-5, 0, -11]} scale={1.2} />
      <Tree position={[5, 0, -10]} scale={0.9} />
      <Tree position={[-3, 0, 12]} scale={1.0} />
      <Tree position={[4, 0, 11]} scale={1.1} />
      
      {/* Scattered rocks */}
      <Rock position={[-3, 0.15, -5]} scale={0.8} />
      <Rock position={[4, 0.1, -4]} scale={0.6} />
      <Rock position={[-5, 0.12, 3]} scale={0.7} />
      <Rock position={[5, 0.08, 5]} scale={0.5} />
      <Rock position={[6.5, 0.15, -2]} scale={0.9} />
      <Rock position={[-6, 0.1, -3]} scale={0.65} />
      
      {/* Log benches around campfire */}
      <mesh position={[-2.5, 0.2, 2.5]} rotation={[Math.PI / 2, 0, 0.8]} castShadow>
        <cylinderGeometry args={[0.2, 0.25, 2.2, 8]} />
        <meshStandardMaterial color="#4a3728" roughness={0.9} />
      </mesh>
      <mesh position={[2.5, 0.2, 2.5]} rotation={[Math.PI / 2, 0, -0.8]} castShadow>
        <cylinderGeometry args={[0.2, 0.25, 2.2, 8]} />
        <meshStandardMaterial color="#3d2e21" roughness={0.9} />
      </mesh>

      {/* Night-specific elements */}
      {isNight && (
        <>
          {/* Stars */}
          <Stars radius={80} depth={50} count={800} factor={4} saturation={0.2} fade speed={0.3} />
          
          {/* Moon */}
          <mesh position={[-15, 20, -25]}>
            <sphereGeometry args={[2.5, 32, 32]} />
            <meshBasicMaterial color="#f5f5dc" />
            <pointLight intensity={0.5} color="#f5f5dc" distance={100} />
          </mesh>
          
          {/* Fireflies */}
          <Fireflies count={20} />
          
          {/* Night fog */}
          <fog attach="fog" args={['#0a1628', 15, 40]} />
        </>
      )}
      
      {/* Day-specific elements */}
      {!isNight && (
        <>
          {/* Sparkles for magical feeling */}
          <Sparkles count={20} scale={20} size={2} speed={0.3} opacity={0.3} color="#fef08a" />
        </>
      )}

      {/* Shadows */}
      <ContactShadows
        resolution={512}
        scale={30}
        blur={2}
        opacity={isNight ? 0.4 : 0.6}
        far={15}
        color={isNight ? '#0a1628' : '#1a3a1a'}
      />
      
      {/* Sky/Environment */}
      <Environment preset={isNight ? 'night' : 'sunset'} />
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
  const controlsRef = useRef<CameraControls>(null);

  React.useEffect(() => {
    if (!controlsRef.current) return;

    if (!activePlayerId) {
      controlsRef.current.setLookAt(0, isNight ? 7.5 : 6.5, isNight ? 11 : 10, 0, 0.5, 0, true);
      return;
    }

    const activeIndex = players.findIndex((p) => p.id === activePlayerId);
    if (activeIndex < 0 || !playerPositions[activeIndex]) {
      controlsRef.current.setLookAt(0, 7, 10, 0, 0.5, 0, true);
      return;
    }

    const [x, y, z] = playerPositions[activeIndex];
    const norm = Math.sqrt(x * x + z * z) || 1;
    const dirX = x / norm;
    const dirZ = z / norm;

    // Zoom out more during speech to hide expression emoji (at y~2.45)
    const shotDistance = isThinking ? 2.5 : isSpeaking ? 4.5 : 4;
    const sideOffset = isThinking ? 0.9 : 0.5;
    const camX = x + dirX * shotDistance - dirZ * sideOffset;
    const camY = y + (isThinking ? 2.2 : isSpeaking ? 2.6 : 1.9);
    const camZ = z + dirZ * shotDistance + dirX * sideOffset;
    const lookY = y + (isThinking ? 1.3 : isSpeaking ? 0.8 : 1.1);

    controlsRef.current.setLookAt(camX, camY, camZ, x, lookY, z, true);
  }, [activePlayerId, isNight, isSpeaking, isThinking, playerPositions, players]);

  return (
    <CameraControls
      ref={controlsRef}
      smoothTime={0.8}
      minPolarAngle={Math.PI / 5}
      maxPolarAngle={Math.PI / 2.1}
      minDistance={3}
      maxDistance={16}
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
  const playerExpressions = useGameStore((s) => s.playerExpressions);
  const isNight = isNightPhase(phase);

  const total = players.length;
  const radius = total <= 6 ? 4.5 : total <= 9 ? 5.5 : 6.5;

  // Calculate positions in a circle
  const playerPositions = useMemo(() => {
    return players.map((_, index) => {
      const angle = (index / total) * 2 * Math.PI;
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;
      return [x, 0, z] as [number, number, number];
    });
  }, [players, total, radius]);

  return (
    <div className="w-full h-full min-h-[300px] rounded-xl overflow-hidden border border-gray-700/50 shadow-2xl">
      <Canvas 
        shadows 
        camera={{ position: [0, 7, 10], fov: 50 }}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
        dpr={1}
      >
        <color attach="background" args={[isNight ? '#0a1628' : '#87ceeb']} />
        
        <VillageEnvironment3D isNight={isNight} />

        {/* Players */}
        {players.map((player, index) => {
          const isActive = player.id === activePlayerId;
          let focusState: 'idle' | 'active' | 'speaking' | 'thinking' = 'idle';
          if (isActive) {
            focusState = isSpeakingTTS ? (isThinkingTTS ? 'thinking' : 'speaking') : 'active';
          }
          const dimmed = !!activePlayerId && !isActive;

          return (
            <Character3D
              key={player.id}
              player={player}
              position={playerPositions[index]}
              focusState={focusState}
              dimmed={dimmed}
              expression={playerExpressions[player.name]}
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
