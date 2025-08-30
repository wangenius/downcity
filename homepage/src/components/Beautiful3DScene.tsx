'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useRef } from 'react';
import * as THREE from 'three';

// 简化的 Hero 节点
function SimpleHero({ 
  position, 
  isActive, 
  onClick, 
  label,
  color = '#3b82f6'
}: {
  position: [number, number, number];
  isActive: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.01;
    }
  });

  return (
    <group position={position} onClick={onClick}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.8, 16, 16]} />
        <meshStandardMaterial 
          color={isActive ? color : '#e5e7eb'}
          roughness={0.3}
          metalness={0.7}
        />
      </mesh>
      
      <mesh position={[0, -1.5, 0]}>
        <planeGeometry args={[2, 0.5]} />
        <meshBasicMaterial 
          color={isActive ? color : '#6b7280'} 
          transparent 
          opacity={0.8}
        />
      </mesh>
    </group>
  );
}

// 简化的 Codex 节点
function SimpleCodex({ 
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
      <mesh ref={meshRef}>
        <boxGeometry args={[1.5, 1.5, 1.5]} />
        <meshStandardMaterial 
          color={isActive ? '#f59e0b' : '#e5e7eb'}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>
      
      <mesh position={[0, -2, 0]}>
        <planeGeometry args={[2, 0.5]} />
        <meshBasicMaterial 
          color={isActive ? '#f59e0b' : '#6b7280'} 
          transparent 
          opacity={0.8}
        />
      </mesh>
    </group>
  );
}

export default function Beautiful3DScene({ 
  onNodeClick, 
  activeNodes 
}: {
  onNodeClick: (nodeId: string) => void;
  activeNodes: string[];
}) {
  const nodes = [
    { 
      id: 'codex-main', 
      type: 'codex', 
      position: [0, 0, 0] as [number, number, number], 
      label: 'CODEX' 
    },
    { 
      id: 'hero-assistant', 
      type: 'hero', 
      position: [-3, 1, -2] as [number, number, number], 
      label: 'Assistant',
      color: '#3b82f6'
    },
    { 
      id: 'hero-tutor', 
      type: 'hero', 
      position: [3, 1, 2] as [number, number, number], 
      label: 'Tutor',
      color: '#8b5cf6'
    },
    { 
      id: 'hero-creator', 
      type: 'hero', 
      position: [2, -1, -3] as [number, number, number], 
      label: 'Creator',
      color: '#06d6a0'
    },
    { 
      id: 'hero-analyst', 
      type: 'hero', 
      position: [-2, -1, 3] as [number, number, number], 
      label: 'Analyst',
      color: '#f72585'
    },
  ];

  return (
    <div className="w-full h-[70vh] bg-gradient-to-br from-slate-50 to-blue-50 rounded-2xl shadow-2xl overflow-hidden">
      <Canvas camera={{ position: [6, 4, 6], fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 10, 5]} intensity={0.8} />
        <pointLight position={[-10, -10, -10]} intensity={0.3} color="#3b82f6" />
        
        {nodes.map((node) => {
          const isActive = activeNodes.includes(node.id);
          
          if (node.type === 'codex') {
            return (
              <SimpleCodex
                key={node.id}
                position={node.position}
                isActive={isActive}
                onClick={() => onNodeClick(node.id)}
                label={node.label}
              />
            );
          } else {
            return (
              <SimpleHero
                key={node.id}
                position={node.position}
                isActive={isActive}
                onClick={() => onNodeClick(node.id)}
                label={node.label}
                color={node.color}
              />
            );
          }
        })}
        
        <OrbitControls 
          enableZoom={true}
          enablePan={false}
          enableRotate={true}
          autoRotate={true}
          autoRotateSpeed={1}
          maxDistance={12}
          minDistance={4}
        />
      </Canvas>
    </div>
  );
}