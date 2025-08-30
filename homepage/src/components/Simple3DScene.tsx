'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Sphere, Box } from '@react-three/drei';
import { useRef, useState } from 'react';
import * as THREE from 'three';

// 简单的 Hero 球体
function HeroSphere({ 
  position, 
  isActive, 
  onClick, 
  label 
}: {
  position: [number, number, number];
  isActive: boolean;
  onClick: () => void;
  label: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.01;
    }
  });

  return (
    <group position={position} onClick={onClick}>
      <Sphere ref={meshRef} args={[0.5, 16, 16]}>
        <meshStandardMaterial 
          color={isActive ? "#4a90e2" : "#666666"}
          emissive={isActive ? "#001122" : "#000000"}
        />
      </Sphere>
      <Text
        position={[0, -1, 0]}
        fontSize={0.3}
        color={isActive ? "#4a90e2" : "#ffffff"}
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
    </group>
  );
}

// 简单的 Codex 立方体
function CodexCube({ 
  position, 
  isActive, 
  onClick, 
  label 
}: {
  position: [number, number, number];
  isActive: boolean;
  onClick: () => void;
  label: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.x += 0.005;
      meshRef.current.rotation.y += 0.01;
    }
  });

  return (
    <group position={position} onClick={onClick}>
      <Box ref={meshRef} args={[1, 1, 1]}>
        <meshStandardMaterial 
          color={isActive ? "#ff6b35" : "#444444"}
          emissive={isActive ? "#331100" : "#000000"}
        />
      </Box>
      <Text
        position={[0, -1.5, 0]}
        fontSize={0.3}
        color={isActive ? "#ff6b35" : "#ffffff"}
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
    </group>
  );
}

export default function Simple3DScene({ 
  onNodeClick, 
  activeNodes 
}: {
  onNodeClick: (nodeId: string) => void;
  activeNodes: string[];
}) {
  const nodes = [
    // 中心 Codex
    { id: 'codex-main', type: 'codex', position: [0, 0, 0] as [number, number, number], label: 'MAIN' },
    
    // Heroes 围绕
    { id: 'hero-1', type: 'hero', position: [-3, 1, 0] as [number, number, number], label: 'Hero1' },
    { id: 'hero-2', type: 'hero', position: [3, 1, 0] as [number, number, number], label: 'Hero2' },
    { id: 'hero-3', type: 'hero', position: [0, 1, -3] as [number, number, number], label: 'Hero3' },
    { id: 'hero-4', type: 'hero', position: [0, 1, 3] as [number, number, number], label: 'Hero4' },
    
    // 其他 Codex
    { id: 'codex-2', type: 'codex', position: [0, 3, 0] as [number, number, number], label: 'KNOW' },
    { id: 'codex-3', type: 'codex', position: [0, -3, 0] as [number, number, number], label: 'MEM' },
  ];

  return (
    <div className="w-full h-[600px] bg-black rounded-lg">
      <Canvas camera={{ position: [5, 5, 5], fov: 60 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        
        {nodes.map((node) => {
          const isActive = activeNodes.includes(node.id);
          
          if (node.type === 'codex') {
            return (
              <CodexCube
                key={node.id}
                position={node.position}
                isActive={isActive}
                onClick={() => onNodeClick(node.id)}
                label={node.label}
              />
            );
          } else {
            return (
              <HeroSphere
                key={node.id}
                position={node.position}
                isActive={isActive}
                onClick={() => onNodeClick(node.id)}
                label={node.label}
              />
            );
          }
        })}
        
        <OrbitControls enableZoom={true} enablePan={true} enableRotate={true} />
      </Canvas>
    </div>
  );
}