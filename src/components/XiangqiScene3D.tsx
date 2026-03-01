'use client';

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame, ThreeEvent } from '@react-three/fiber';
import { CameraControls, Text, Environment, ContactShadows, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { useXiangqiStore } from '@/store/xiangqiStore';
import { 
  BOARD_ROWS, 
  BOARD_COLS, 
  XiangqiBoard, 
  XiangqiPiece,
  XiangqiColor,
  getPieceChar,
} from '@/lib/xiangqi/types';

/* ------------------------------------------------------------------ */
/*  Board Component                                                    */
/* ------------------------------------------------------------------ */
function XiangqiBoard3D() {
  const cellSize = 0.7;
  const width = (BOARD_COLS - 1) * cellSize;
  const height = (BOARD_ROWS - 1) * cellSize;
  
  const lines = useMemo(() => {
    const result: React.ReactElement[] = [];
    
    // Vertical lines
    for (let col = 0; col < BOARD_COLS; col++) {
      const x = col * cellSize - width / 2;
      // Top half (black side)
      result.push(
        <mesh key={`v-top-${col}`} position={[x, 0.01, -height / 4]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.02, height / 2]} />
          <meshBasicMaterial color="#333" />
        </mesh>
      );
      // Bottom half (red side)
      result.push(
        <mesh key={`v-bot-${col}`} position={[x, 0.01, height / 4]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.02, height / 2]} />
          <meshBasicMaterial color="#333" />
        </mesh>
      );
    }
    
    // Horizontal lines
    for (let row = 0; row < BOARD_ROWS; row++) {
      const z = row * cellSize - height / 2;
      result.push(
        <mesh key={`h-${row}`} position={[0, 0.01, z]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
          <planeGeometry args={[0.02, width]} />
          <meshBasicMaterial color="#333" />
        </mesh>
      );
    }
    
    // Palace diagonals (both sides)
    const palaceWidth = 2 * cellSize;
    const palaceHeight = 2 * cellSize;
    
    // Black palace (top)
    const blackPalaceZ = -height / 2 + cellSize;
    result.push(
      <mesh key="palace-black-1" position={[0, 0.01, blackPalaceZ]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <planeGeometry args={[0.02, palaceWidth * Math.sqrt(2)]} />
        <meshBasicMaterial color="#333" />
      </mesh>
    );
    result.push(
      <mesh key="palace-black-2" position={[0, 0.01, blackPalaceZ]} rotation={[-Math.PI / 2, 0, -Math.PI / 4]}>
        <planeGeometry args={[0.02, palaceWidth * Math.sqrt(2)]} />
        <meshBasicMaterial color="#333" />
      </mesh>
    );
    
    // Red palace (bottom)
    const redPalaceZ = height / 2 - cellSize;
    result.push(
      <mesh key="palace-red-1" position={[0, 0.01, redPalaceZ]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <planeGeometry args={[0.02, palaceWidth * Math.sqrt(2)]} />
        <meshBasicMaterial color="#333" />
      </mesh>
    );
    result.push(
      <mesh key="palace-red-2" position={[0, 0.01, redPalaceZ]} rotation={[-Math.PI / 2, 0, -Math.PI / 4]}>
        <planeGeometry args={[0.02, palaceWidth * Math.sqrt(2)]} />
        <meshBasicMaterial color="#333" />
      </mesh>
    );
    
    return result;
  }, [cellSize, width, height]);
  
  return (
    <group>
      {/* Board base */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width + 1, height + 1]} />
        <meshStandardMaterial color="#deb887" roughness={0.8} />
      </mesh>
      
      {/* Board frame */}
      <mesh position={[0, -0.05, 0]}>
        <boxGeometry args={[width + 1.2, 0.1, height + 1.2]} />
        <meshStandardMaterial color="#8b4513" roughness={0.7} />
      </mesh>
      
      {lines}
      
      {/* River text */}
      <Text
        position={[-width / 4, 0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.3}
        color="#8b4513"
      >
        楚河
      </Text>
      <Text
        position={[width / 4, 0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.3}
        color="#8b4513"
      >
        漢界
      </Text>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Xiangqi Piece Component                                            */
/* ------------------------------------------------------------------ */
function XiangqiPiece3D({
  piece,
  position,
  isSelected,
  isLastMove,
  onClick,
}: {
  piece: XiangqiPiece;
  position: [number, number, number];
  isSelected: boolean;
  isLastMove: boolean;
  onClick: () => void;
}) {
  const meshRef = useRef<THREE.Group>(null);
  const char = getPieceChar(piece);
  
  useFrame((state) => {
    if (!meshRef.current) return;
    if (isSelected) {
      meshRef.current.position.y = 0.3 + Math.sin(state.clock.elapsedTime * 4) * 0.05;
    } else if (isLastMove) {
      meshRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 2) * 0.03);
    }
  });
  
  const baseColor = piece.color === 'red' ? '#8b0000' : '#1a1a1a';
  const textColor = piece.color === 'red' ? '#ffd700' : '#d4af37';
  const borderColor = isSelected ? '#ffeb3b' : isLastMove ? '#4caf50' : '#d4af37';
  
  return (
    <group
      ref={meshRef}
      position={position}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default';
      }}
    >
      {/* Piece body (cylinder) */}
      <mesh position={[0, 0.08, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.28, 0.16, 32]} />
        <meshStandardMaterial color={baseColor} roughness={0.4} />
      </mesh>
      
      {/* Border ring */}
      <mesh position={[0, 0.17, 0]}>
        <torusGeometry args={[0.25, 0.03, 8, 32]} />
        <meshStandardMaterial color={borderColor} metalness={0.6} roughness={0.3} />
      </mesh>
      
      {/* Chinese character */}
      <Text
        position={[0, 0.18, 0.01]}
        fontSize={0.25}
        color={textColor}
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        {char}
      </Text>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Scene Content                                                      */
/* ------------------------------------------------------------------ */
function SceneContent() {
  const board = useXiangqiStore((s) => s.board);
  const selectedSquare = useXiangqiStore((s) => s.selectedSquare);
  const lastMove = useXiangqiStore((s) => s.lastMove);
  const phase = useXiangqiStore((s) => s.phase);
  const gameMode = useXiangqiStore((s) => s.gameMode);
  const currentTurn = useXiangqiStore((s) => s.currentTurn);
  const players = useXiangqiStore((s) => s.players);
  const selectSquare = useXiangqiStore((s) => s.selectSquare);
  const makeMove = useXiangqiStore((s) => s.makeMove);
  const winner = useXiangqiStore((s) => s.winner);
  
  const cellSize = 0.7;
  const width = (BOARD_COLS - 1) * cellSize;
  const height = (BOARD_ROWS - 1) * cellSize;
  
  const cellToPosition = (row: number, col: number): [number, number, number] => {
    const x = col * cellSize - width / 2;
    const z = row * cellSize - height / 2;
    return [x, 0.05, z];
  };
  
  const handleCellClick = (row: number, col: number) => {
    if (phase !== 'playing') return;
    if (gameMode !== 'human_vs_ai') return;
    
    const humanPlayer = players?.find(p => p.isHuman);
    if (!humanPlayer || humanPlayer.color !== currentTurn) return;
    
    const piece = board[row][col];
    
    if (selectedSquare) {
      // Try to make move
      const result = makeMove(selectedSquare, { row, col });
      selectSquare(null);
    } else if (piece && piece.color === humanPlayer.color) {
      // Select piece
      selectSquare({ row, col });
    }
  };
  
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 12, 5]} intensity={1.2} castShadow />
      <pointLight position={[-5, 8, -5]} intensity={0.4} color="#ffeedd" />
      
      {/* Environment */}
      <Environment preset="apartment" />
      <ContactShadows position={[0, -0.1, 0]} scale={15} blur={2} opacity={0.4} />
      
      {/* Xiangqi Board */}
      <XiangqiBoard3D />
      
      {/* Pieces */}
      {board.map((row, rowIndex) =>
        row.map((piece, colIndex) => {
          if (!piece) return null;
          const isSelected = selectedSquare?.row === rowIndex && selectedSquare?.col === colIndex;
          const isLastMoveSquare = lastMove && (
            (lastMove.from.row === rowIndex && lastMove.from.col === colIndex) ||
            (lastMove.to.row === rowIndex && lastMove.to.col === colIndex)
          );
          
          return (
            <XiangqiPiece3D
              key={`${rowIndex}-${colIndex}`}
              piece={piece}
              position={cellToPosition(rowIndex, colIndex)}
              isSelected={isSelected}
              isLastMove={!!isLastMoveSquare}
              onClick={() => handleCellClick(rowIndex, colIndex)}
            />
          );
        })
      )}
      
      {/* Clickable empty squares */}
      {board.map((row, rowIndex) =>
        row.map((piece, colIndex) => {
          if (piece) return null;
          const pos = cellToPosition(rowIndex, colIndex);
          
          return (
            <mesh
              key={`empty-${rowIndex}-${colIndex}`}
              position={pos}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                handleCellClick(rowIndex, colIndex);
              }}
              onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                if (selectedSquare) {
                  e.stopPropagation();
                  document.body.style.cursor = 'pointer';
                }
              }}
              onPointerOut={() => {
                document.body.style.cursor = 'default';
              }}
            >
              <cylinderGeometry args={[0.25, 0.25, 0.02, 16]} />
              <meshBasicMaterial transparent opacity={0} />
            </mesh>
          );
        })
      )}
      
      {/* Last move indicator (for from square) */}
      {lastMove && (
        <mesh position={[...cellToPosition(lastMove.from.row, lastMove.from.col).slice(0, 1), 0.02, cellToPosition(lastMove.from.row, lastMove.from.col)[2]] as [number, number, number]}>
          <ringGeometry args={[0.2, 0.25, 32]} />
          <meshBasicMaterial color="#4caf50" transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
      )}
      
      {/* Victory sparkles */}
      {winner && winner !== 'draw' && (
        <Sparkles
          count={100}
          scale={12}
          size={3}
          speed={0.5}
          color={winner === 'red' ? '#ff0000' : '#000000'}
        />
      )}
      
      {/* Camera Controls */}
      <CameraControls
        makeDefault
        minDistance={6}
        maxDistance={20}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.2}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Export                                                        */
/* ------------------------------------------------------------------ */
export default function XiangqiScene3D() {
  return (
    <div className="w-full h-full min-h-[400px]">
      <Canvas
        shadows
        camera={{ position: [0, 12, 10], fov: 40 }}
        className="w-full h-full"
      >
        <SceneContent />
      </Canvas>
    </div>
  );
}
