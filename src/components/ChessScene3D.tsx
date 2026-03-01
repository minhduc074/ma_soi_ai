'use client';

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame, ThreeEvent } from '@react-three/fiber';
import { CameraControls, Text, Environment, ContactShadows, RoundedBox, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { useChessStore } from '@/store/chessStore';
import { PIECE_UNICODE, PieceSymbol } from '@/lib/chess/types';

/* ------------------------------------------------------------------ */
/*  Board Component                                                    */
/* ------------------------------------------------------------------ */
function ChessBoard() {
  const squares = useMemo(() => {
    const result: React.ReactElement[] = [];
    const squareSize = 0.8;
    const offset = (8 * squareSize) / 2 - squareSize / 2;
    
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const isLight = (row + col) % 2 === 0;
        const x = col * squareSize - offset;
        const z = row * squareSize - offset;
        
        result.push(
          <mesh
            key={`${row}-${col}`}
            position={[x, 0, z]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
          >
            <planeGeometry args={[squareSize, squareSize]} />
            <meshStandardMaterial
              color={isLight ? '#f0d9b5' : '#b58863'}
              roughness={0.6}
            />
          </mesh>
        );
      }
    }
    
    return result;
  }, []);
  
  // Board frame
  const frameSize = 8 * 0.8 + 0.4;
  
  return (
    <group>
      {/* Board base/frame */}
      <mesh position={[0, -0.1, 0]} receiveShadow>
        <boxGeometry args={[frameSize, 0.2, frameSize]} />
        <meshStandardMaterial color="#5c4033" roughness={0.7} />
      </mesh>
      {squares}
      
      {/* Coordinate labels */}
      {['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((letter, i) => (
        <Text
          key={`col-${letter}`}
          position={[(i - 3.5) * 0.8, 0.01, 3.5 * 0.8 + 0.35]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.15}
          color="#333"
        >
          {letter}
        </Text>
      ))}
      {['1', '2', '3', '4', '5', '6', '7', '8'].map((num, i) => (
        <Text
          key={`row-${num}`}
          position={[-3.5 * 0.8 - 0.35, 0.01, (i - 3.5) * 0.8]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.15}
          color="#333"
        >
          {num}
        </Text>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Chess Piece Component                                              */
/* ------------------------------------------------------------------ */
function ChessPiece({
  type,
  color,
  position,
  isSelected,
  isLastMove,
  onClick,
}: {
  type: PieceSymbol;
  color: 'w' | 'b';
  position: [number, number, number];
  isSelected: boolean;
  isLastMove: boolean;
  onClick: () => void;
}) {
  const meshRef = useRef<THREE.Group>(null);
  const pieceChar = PIECE_UNICODE[color === 'w' ? type.toUpperCase() : type.toLowerCase()];
  
  useFrame((state) => {
    if (!meshRef.current) return;
    if (isSelected) {
      meshRef.current.position.y = 0.4 + Math.sin(state.clock.elapsedTime * 4) * 0.05;
    } else if (isLastMove) {
      meshRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 2) * 0.03);
    }
  });
  
  const baseColor = color === 'w' ? '#f5f5dc' : '#2c2c2c';
  const highlightColor = isSelected ? '#ffeb3b' : isLastMove ? '#4caf50' : baseColor;
  
  // Simple piece representation using cylinder + text
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
      {/* Base */}
      <mesh position={[0, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.3, 0.2, 24]} />
        <meshStandardMaterial
          color={highlightColor}
          roughness={0.4}
          metalness={0.1}
        />
      </mesh>
      
      {/* Body */}
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.2, 0.3, 24]} />
        <meshStandardMaterial
          color={baseColor}
          roughness={0.4}
          metalness={0.1}
        />
      </mesh>
      
      {/* Piece symbol */}
      <Text
        position={[0, 0.55, 0.01]}
        fontSize={0.35}
        color={color === 'w' ? '#000' : '#fff'}
        anchorX="center"
        anchorY="middle"
      >
        {pieceChar}
      </Text>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Valid Move Indicator                                               */
/* ------------------------------------------------------------------ */
function ValidMoveIndicator({ position }: { position: [number, number, number] }) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (!meshRef.current) return;
    meshRef.current.scale.setScalar(0.8 + Math.sin(state.clock.elapsedTime * 3) * 0.1);
  });
  
  return (
    <mesh ref={meshRef} position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.15, 32]} />
      <meshBasicMaterial color="#4caf50" transparent opacity={0.6} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/*  Scene Content                                                      */
/* ------------------------------------------------------------------ */
function SceneContent() {
  const chess = useChessStore((s) => s.chess);
  const selectedSquare = useChessStore((s) => s.selectedSquare);
  const validMoves = useChessStore((s) => s.validMoves);
  const lastMove = useChessStore((s) => s.lastMove);
  const phase = useChessStore((s) => s.phase);
  const gameMode = useChessStore((s) => s.gameMode);
  const currentTurn = useChessStore((s) => s.currentTurn);
  const players = useChessStore((s) => s.players);
  const selectSquare = useChessStore((s) => s.selectSquare);
  const makeMove = useChessStore((s) => s.makeMove);
  const winner = useChessStore((s) => s.winner);
  
  const board = chess?.board() ?? [];
  const squareSize = 0.8;
  const offset = (8 * squareSize) / 2 - squareSize / 2;
  
  const squareToPosition = (file: number, rank: number): [number, number, number] => {
    return [file * squareSize - offset, 0.05, (7 - rank) * squareSize - offset];
  };
  
  const positionToSquare = (file: number, rank: number): string => {
    return String.fromCharCode(97 + file) + (rank + 1);
  };
  
  const handleSquareClick = (file: number, rank: number) => {
    if (phase !== 'playing') return;
    if (gameMode !== 'human_vs_ai') return;
    
    const humanPlayer = players?.find(p => p.isHuman);
    const humanColor = humanPlayer?.color === 'white' ? 'w' : 'b';
    if (!humanPlayer || humanColor !== currentTurn) return;
    
    const square = positionToSquare(file, rank) as import('chess.js').Square;
    const piece = board[7 - rank]?.[file];
    
    if (selectedSquare) {
      // Try to make move
      if (validMoves.includes(square)) {
        makeMove(selectedSquare, square);
      }
      selectSquare(null);
    } else if (piece && piece.color === humanColor) {
      // Select piece
      selectSquare(square);
    }
  };
  
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow />
      <pointLight position={[-5, 8, -5]} intensity={0.5} color="#ffeedd" />
      
      {/* Environment */}
      <Environment preset="apartment" />
      <ContactShadows position={[0, -0.2, 0]} scale={15} blur={2} opacity={0.4} />
      
      {/* Chess Board */}
      <ChessBoard />
      
      {/* Pieces */}
      {board.map((row, rankIndex) =>
        row.map((cell, fileIndex) => {
          if (!cell) return null;
          const square = positionToSquare(fileIndex, 7 - rankIndex);
          const isSelected = selectedSquare === square;
          const isLastMoveSquare = lastMove && (lastMove.from === square || lastMove.to === square);
          
          return (
            <ChessPiece
              key={`${rankIndex}-${fileIndex}`}
              type={cell.type}
              color={cell.color}
              position={squareToPosition(fileIndex, 7 - rankIndex)}
              isSelected={isSelected}
              isLastMove={!!isLastMoveSquare}
              onClick={() => handleSquareClick(fileIndex, 7 - rankIndex)}
            />
          );
        })
      )}
      
      {/* Valid move indicators */}
      {validMoves.map((square) => {
        const file = square.charCodeAt(0) - 97;
        const rank = parseInt(square[1]) - 1;
        return (
          <ValidMoveIndicator
            key={square}
            position={squareToPosition(file, rank)}
          />
        );
      })}
      
      {/* Clickable empty squares */}
      {board.map((row, rankIndex) =>
        row.map((cell, fileIndex) => {
          if (cell) return null;
          const square = positionToSquare(fileIndex, 7 - rankIndex);
          const isValidTarget = validMoves.includes(square as import('chess.js').Square);
          
          return (
            <mesh
              key={`empty-${rankIndex}-${fileIndex}`}
              position={squareToPosition(fileIndex, 7 - rankIndex)}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                if (isValidTarget) handleSquareClick(fileIndex, 7 - rankIndex);
              }}
              onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                if (isValidTarget) {
                  e.stopPropagation();
                  document.body.style.cursor = 'pointer';
                }
              }}
              onPointerOut={() => {
                document.body.style.cursor = 'default';
              }}
            >
              <boxGeometry args={[squareSize * 0.9, 0.01, squareSize * 0.9]} />
              <meshBasicMaterial transparent opacity={0} />
            </mesh>
          );
        })
      )}
      
      {/* Victory sparkles */}
      {winner && winner !== 'draw' && (
        <Sparkles
          count={100}
          scale={10}
          size={3}
          speed={0.5}
          color={winner === 'white' ? '#ffd700' : '#9c27b0'}
        />
      )}
      
      {/* Camera Controls */}
      <CameraControls
        makeDefault
        minDistance={6}
        maxDistance={18}
        minPolarAngle={Math.PI / 6}
        maxPolarAngle={Math.PI / 2.2}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Export                                                        */
/* ------------------------------------------------------------------ */
export default function ChessScene3D() {
  return (
    <div className="w-full h-full min-h-[400px]">
      <Canvas
        shadows
        camera={{ position: [0, 10, 10], fov: 40 }}
        className="w-full h-full"
      >
        <SceneContent />
      </Canvas>
    </div>
  );
}
