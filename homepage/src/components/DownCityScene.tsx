'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text, Box, Sphere, Line } from '@react-three/drei';
import { useRef, useState, useEffect } from 'react';
import { Vector3 } from 'three';
import * as THREE from 'three';

// Hero 节点组件
function HeroNode({ position, isActive, onClick, label }: {
  position: [number, number, number];
  isActive: boolean;
  onClick: () => void;
  label: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.rotation.x += 0.01;
      meshRef.current.rotation.y += 0.01;
    }
  });

  return (
    <group position={position} onClick={onClick}>
      <Sphere ref={meshRef} args={[0.5, 16, 16]}>
        <meshStandardMaterial 
          color={isActive ? "#00ff88" : "#4a90e2"} 
          emissive={isActive ? "#004422" : "#001122"}
          wireframe={!isActive}
        />
      </Sphere>
      <Text
        position={[0, -1, 0]}
        fontSize={0.3}
        color={isActive ? "#00ff88" : "#ffffff"}
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
    </group>
  );
}

// Codex 中心节点
function CodexCore({ isActive }: { isActive: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useEffect(() => {
    const animate = () => {
      if (meshRef.current) {
        meshRef.current.rotation.y += 0.005;
        meshRef.current.rotation.x += 0.002;
      }
      requestAnimationFrame(animate);
    };
    animate();
  }, []);

  return (
    <group position={[0, 0, 0]}>
      <Box ref={meshRef} args={[2, 2, 2]}>
        <meshStandardMaterial 
          color={isActive ? "#ff6b35" : "#666666"}
          emissive={isActive ? "#331100" : "#000000"}
          wireframe={!isActive}
        />
      </Box>
      <Text
        position={[0, -2, 0]}
        fontSize={0.5}
        color={isActive ? "#ff6b35" : "#ffffff"}
        anchorX="center"
        anchorY="middle"
      >
        CODEX
      </Text>
    </group>
  );
}

// 连接线组件
function ConnectionLine({ start, end, isActive }: {
  start: [number, number, number];
  end: [number, number, number];
  isActive: boolean;
}) {
  const points = [new Vector3(...start), new Vector3(...end)];
  
  return (
    <Line
      points={points}
      color={isActive ? "#00ff88" : "#333333"}
      lineWidth={isActive ? 3 : 1}
      dashed={!isActive}
    />
  );
}

// 主场景组件
export default function DownCityScene({ 
  onHeroActivate, 
  onCodexActivate,
  gameState 
}: {
  onHeroActivate: (heroId: string) => void;
  onCodexActivate: () => void;
  gameState: {
    activeHeroes: string[];
    codexActive: boolean;
    connections: boolean;
  };
}) {
  const heroes = [
    { id: 'hero1', position: [-4, 2, 0] as [number, number, number], label: 'HERO-01' },
    { id: 'hero2', position: [4, 2, 0] as [number, number, number], label: 'HERO-02' },
    { id: 'hero3', position: [-4, -2, 0] as [number, number, number], label: 'HERO-03' },
    { id: 'hero4', position: [4, -2, 0] as [number, number, number], label: 'HERO-04' },
  ];

  return (
    <Canvas camera={{ position: [0, 0, 10], fov: 60 }}>
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#4a90e2" />
      
      {/* Codex 中心 */}
      <CodexCore isActive={gameState.codexActive} />
      
      {/* Hero 节点 */}
      {heroes.map((hero) => (
        <HeroNode
          key={hero.id}
          position={hero.position}
          isActive={gameState.activeHeroes.includes(hero.id)}
          onClick={() => onHeroActivate(hero.id)}
          label={hero.label}
        />
      ))}
      
      {/* 连接线 */}
      {gameState.connections && heroes.map((hero) => (
        <ConnectionLine
          key={`connection-${hero.id}`}
          start={[0, 0, 0]}
          end={hero.position}
          isActive={gameState.activeHeroes.includes(hero.id) && gameState.codexActive}
        />
      ))}
      
      {/* 背景粒子 */}
      {Array.from({ length: 50 }).map((_, i) => (
        <Sphere
          key={i}
          position={[
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 20
          ]}
          args={[0.02, 8, 8]}
        >
          <meshBasicMaterial color="#ffffff" opacity={0.3} transparent />
        </Sphere>
      ))}
      
      <OrbitControls 
        enableZoom={true} 
        enablePan={true} 
        enableRotate={true}
        maxDistance={15}
        minDistance={5}
      />
    </Canvas>
  );
}