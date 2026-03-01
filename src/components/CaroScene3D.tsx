'use client';

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame, ThreeEvent } from '@react-three/fiber';
import { CameraControls, Text, Environment, ContactShadows, RoundedBox, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { useCaroStore } from '@/store/caroStore';
import { BOARD_SIZE, CaroBoard, WinInfo } from '@/lib/caro/types';

/* ------------------------------------------------------------------ */
/*  Board Grid Component                                               */
/* ------------------------------------------------------------------ */
function BoardGrid() {
  const lines = useMemo(() => {
    const result: React.ReactElement[] = [];
    const size = BOARD_SIZE;
    const cellSize = 0.5;
    const halfSize = (size * cellSize) / 2;
    
    // Grid lines
    for (let i = 0; i <= size; i++) {
      const pos = -halfSize + i * cellSize;
      // Horizontal
      result.push(
        <mesh key={`h${i}`} position={[0, 0.01, pos]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[size * cellSize, 0.02]} />
          <meshBasicMaterial color="#4a4a4a" transparent opacity={0.6} />
        </mesh>
      );
      // Vertical
      result.push(
        <mesh key={`v${i}`} position={[pos, 0.01, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
          <planeGeometry args={[size * cellSize, 0.02]} />
          <meshBasicMaterial color="#4a4a4a" transparent opacity={0.6} />
        </mesh>
      );
    }
    
    return result;
  }, []);
  
  return (
    <group>
      {/* Board base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, 0, 0]}>
        <planeGeometry args={[BOARD_SIZE * 0.5 + 0.5, BOARD_SIZE * 0.5 + 0.5]} />
        <meshStandardMaterial color="#deb887" roughness={0.8} />
      </mesh>
      {lines}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  X Piece Component                                                  */
/* ------------------------------------------------------------------ */
function XPiece({ 
  position, 
  isLast, 
  isWinning 
}: { 
  position: [number, number, number]; 
  isLast: boolean;
  isWinning: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (!groupRef.current) return;
    if (isLast || isWinning) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.5;
      groupRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 3) * 0.05);
    }
  });
  
  const color = isWinning ? '#ffd700' : isLast ? '#ff6b6b' : '#e74c3c';
  
  return (
    <group ref={groupRef} position={position}>
      {/* X shape using two crossed boxes */}
      <mesh rotation={[0, Math.PI / 4, 0]} castShadow>
        <boxGeometry args={[0.35, 0.08, 0.08]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.2} />
      </mesh>
      <mesh rotation={[0, -Math.PI / 4, 0]} castShadow>
        <boxGeometry args={[0.35, 0.08, 0.08]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.2} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  O Piece Component                                                  */
/* ------------------------------------------------------------------ */
function OPiece({ 
  position, 
  isLast, 
  isWinning 
}: { 
  position: [number, number, number]; 
  isLast: boolean;
  isWinning: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (!meshRef.current) return;
    if (isLast || isWinning) {
      meshRef.current.rotation.z = state.clock.elapsedTime * 0.5;
      meshRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 3) * 0.05);
    }
  });
  
  const color = isWinning ? '#ffd700' : isLast ? '#6bb3ff' : '#3498db';
  
  return (
    <mesh ref={meshRef} position={position} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <torusGeometry args={[0.15, 0.04, 16, 32]} />
      <meshStandardMaterial color={color} roughness={0.3} metalness={0.2} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/*  Pieces Container                                                   */
/* ------------------------------------------------------------------ */
function Pieces({ 
  board, 
  lastMove, 
  winInfo,
  onCellClick,
}: { 
  board: CaroBoard;
  lastMove: { row: number; col: number } | null;
  winInfo: WinInfo | null;
  onCellClick: (row: number, col: number) => void;
}) {
  const cellSize = 0.5;
  const halfSize = (BOARD_SIZE * cellSize) / 2;
  
  const isWinningCell = (row: number, col: number) => {
    if (!winInfo) return false;
    return winInfo.cells.some(c => c.row === row && c.col === col);
  };
  
  return (
    <group>
      {board.map((row, r) =>
        row.map((cell, c) => {
          const x = -halfSize + c * cellSize + cellSize / 2;
          const z = -halfSize + r * cellSize + cellSize / 2;
          const isLast = lastMove?.row === r && lastMove?.col === c;
          const isWinning = isWinningCell(r, c);
          
          if (cell === 'X') {
            return <XPiece key={`${r}-${c}`} position={[x, 0.1, z]} isLast={isLast} isWinning={isWinning} />;
          }
          if (cell === 'O') {
            return <OPiece key={`${r}-${c}`} position={[x, 0.1, z]} isLast={isLast} isWinning={isWinning} />;
          }
          
          // Empty cell - clickable
          return (
            <mesh
              key={`${r}-${c}`}
              position={[x, 0.02, z]}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                onCellClick(r, c);
              }}
              onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation();
                document.body.style.cursor = 'pointer';
              }}
              onPointerOut={() => {
                document.body.style.cursor = 'default';
              }}
            >
              <boxGeometry args={[cellSize * 0.9, 0.01, cellSize * 0.9]} />
              <meshBasicMaterial transparent opacity={0} />
            </mesh>
          );
        })
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Win Line Effect                                                    */
/* ------------------------------------------------------------------ */
function WinLine({ winInfo }: { winInfo: WinInfo }) {
  const cellSize = 0.5;
  const halfSize = (BOARD_SIZE * cellSize) / 2;
  
  const start = winInfo.cells[0];
  const end = winInfo.cells[winInfo.cells.length - 1];
  
  const startX = -halfSize + start.col * cellSize + cellSize / 2;
  const startZ = -halfSize + start.row * cellSize + cellSize / 2;
  const endX = -halfSize + end.col * cellSize + cellSize / 2;
  const endZ = -halfSize + end.row * cellSize + cellSize / 2;
  
  const midX = (startX + endX) / 2;
  const midZ = (startZ + endZ) / 2;
  const length = Math.sqrt((endX - startX) ** 2 + (endZ - startZ) ** 2) + cellSize;
  const angle = Math.atan2(endZ - startZ, endX - startX);
  
  return (
    <mesh position={[midX, 0.2, midZ]} rotation={[0, -angle, 0]}>
      <boxGeometry args={[length, 0.05, 0.1]} />
      <meshStandardMaterial 
        color="#ffd700" 
        emissive="#ffd700"
        emissiveIntensity={0.5}
        roughness={0.2}
        metalness={0.8}
      />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/*  Scene Content                                                      */
/* ------------------------------------------------------------------ */
function SceneContent() {
  const board = useCaroStore((s) => s.board);
  const lastMove = useCaroStore((s) => s.lastMove);
  const winInfo = useCaroStore((s) => s.winInfo);
  const phase = useCaroStore((s) => s.phase);
  const gameMode = useCaroStore((s) => s.gameMode);
  const currentPlayer = useCaroStore((s) => s.currentPlayer);
  const players = useCaroStore((s) => s.players);
  const makeMove = useCaroStore((s) => s.makeMove);
  
  const handleCellClick = (row: number, col: number) => {
    if (phase !== 'playing') return;
    if (gameMode !== 'human_vs_ai') return;
    
    const humanPlayer = players?.find(p => p.isHuman);
    if (!humanPlayer || humanPlayer.color !== currentPlayer) return;
    
    makeMove(row, col);
  };
  
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow />
      <pointLight position={[-5, 8, -5]} intensity={0.5} color="#ffeedd" />
      
      {/* Environment */}
      <Environment preset="apartment" />
      <ContactShadows position={[0, -0.01, 0]} scale={20} blur={2} opacity={0.4} />
      
      {/* Board */}
      <BoardGrid />
      
      {/* Pieces */}
      <Pieces 
        board={board} 
        lastMove={lastMove} 
        winInfo={winInfo}
        onCellClick={handleCellClick}
      />
      
      {/* Win line effect */}
      {winInfo && <WinLine winInfo={winInfo} />}
      
      {/* Victory sparkles */}
      {winInfo && (
        <Sparkles
          count={100}
          scale={8}
          size={3}
          speed={0.5}
          color="#ffd700"
        />
      )}
      
      {/* Camera Controls */}
      <CameraControls
        makeDefault
        minDistance={5}
        maxDistance={15}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.5}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Export                                                        */
/* ------------------------------------------------------------------ */
export default function CaroScene3D() {
  return (
    <div className="w-full h-full min-h-[400px]">
      <Canvas
        shadows
        camera={{ position: [0, 8, 8], fov: 45 }}
        className="w-full h-full"
      >
        <SceneContent />
      </Canvas>
    </div>
  );
}
