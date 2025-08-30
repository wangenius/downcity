'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Sphere, Box, Line, Stars } from '@react-three/drei';
import { useRef, useState, useEffect, useMemo } from 'react';
import * as THREE from 'three';

// Hero 星球组件
function HeroPlanet({ 
  position, 
  isActive, 
  onClick, 
  label, 
  color = '#4a90e2' 
}: {
  position: [number, number, number];
  isActive: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.01;
      meshRef.current.rotation.x += 0.005;
    }
    
    // 发光效果
    if (glowRef.current && isActive) {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.1;
      glowRef.current.scale.setScalar(scale);
    }
  });

  return (
    <group position={position} onClick={onClick}>
      {/* 发光光环 */}
      {isActive && (
        <Sphere ref={glowRef} args={[1.2, 32, 32]}>
          <meshBasicMaterial 
            color={color} 
            transparent 
            opacity={0.2}
            side={THREE.BackSide}
          />
        </Sphere>
      )}
      
      {/* 主星球 */}
      <Sphere ref={meshRef} args={[0.8, 32, 32]}>
        <meshStandardMaterial 
          color={isActive ? color : '#666666'}
          emissive={isActive ? color : '#000000'}
          emissiveIntensity={isActive ? 0.3 : 0}
          roughness={0.7}
          metalness={0.3}
        />
      </Sphere>
      
      {/* 标签 */}
      <Text
        position={[0, -1.5, 0]}
        fontSize={0.3}
        color={isActive ? '#ffffff' : '#888888'}
        anchorX="center"
        anchorY="middle"
        font="/fonts/inter.woff"
      >
        {label}
      </Text>
      
      {/* 粒子环 */}
      {isActive && (
        <group>
          {Array.from({ length: 20 }).map((_, i) => {
            const angle = (i / 20) * Math.PI * 2;
            const radius = 1.5;
            return (
              <Sphere
                key={i}
                position={[
                  Math.cos(angle) * radius,
                  Math.sin(angle * 2) * 0.2,
                  Math.sin(angle) * radius
                ]}
                args={[0.02, 8, 8]}
              >
                <meshBasicMaterial color={color} />
              </Sphere>
            );
          })}
        </group>
      )}
    </group>
  );
}

// Codex 恒星组件
function CodexStar({ 
  position, 
  isActive, 
  onClick, 
  label,
  size = 1.5 
}: {
  position: [number, number, number];
  isActive: boolean;
  onClick: () => void;
  label: string;
  size?: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const coronaRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.02;
    }
    
    if (coronaRef.current && isActive) {
      coronaRef.current.rotation.z += 0.01;
      const scale = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.15;
      coronaRef.current.scale.setScalar(scale);
    }
  });

  return (
    <group position={position} onClick={onClick}>
      {/* 日冕效果 */}
      {isActive && (
        <Sphere ref={coronaRef} args={[size * 1.8, 32, 32]}>
          <meshBasicMaterial 
            color="#ff6b35" 
            transparent 
            opacity={0.1}
            side={THREE.BackSide}
          />
        </Sphere>
      )}
      
      {/* 主恒星 */}
      <Sphere ref={meshRef} args={[size, 32, 32]}>
        <meshStandardMaterial 
          color={isActive ? '#ff6b35' : '#444444'}
          emissive={isActive ? '#ff6b35' : '#000000'}
          emissiveIntensity={isActive ? 0.5 : 0}
          roughness={0.1}
          metalness={0.1}
        />
      </Sphere>
      
      {/* 标签 */}
      <Text
        position={[0, -size - 1, 0]}
        fontSize={0.4}
        color={isActive ? '#ff6b35' : '#888888'}
        anchorX="center"
        anchorY="middle"
        font="/fonts/inter.woff"
      >
        {label}
      </Text>
      
      {/* 能量射线 */}
      {isActive && (
        <group>
          {Array.from({ length: 8 }).map((_, i) => {
            const angle = (i / 8) * Math.PI * 2;
            const length = 3;
            const points = [
              new THREE.Vector3(0, 0, 0),
              new THREE.Vector3(
                Math.cos(angle) * length,
                Math.sin(i) * 0.5,
                Math.sin(angle) * length
              )
            ];
            return (
              <Line
                key={i}
                points={points}
                color="#ff6b35"
                lineWidth={2}
                transparent
                opacity={0.6}
              />
            );
          })}
        </group>
      )}
    </group>
  );
}

// 连接线组件
function ConnectionBeam({ 
  start, 
  end, 
  isActive 
}: {
  start: [number, number, number];
  end: [number, number, number];
  isActive: boolean;
}) {
  const points = useMemo(() => [
    new THREE.Vector3(...start),
    new THREE.Vector3(...end)
  ], [start, end]);
  
  if (!isActive) return null;
  
  return (
    <Line
      points={points}
      color="#00ff88"
      lineWidth={3}
      transparent
      opacity={0.8}
      dashed
      dashScale={50}
      dashSize={0.1}
      gapSize={0.05}
    />
  );
}

// 宇宙背景
function UniverseBackground() {
  return (
    <>
      <Stars 
        radius={100} 
        depth={50} 
        count={5000} 
        factor={4} 
        saturation={0} 
        fade 
        speed={1}
      />
      <ambientLight intensity={0.2} />
      <pointLight position={[10, 10, 10]} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#4a90e2" />
    </>
  );
}

// 相机控制
function CameraController() {
  const { camera } = useThree();
  
  useFrame((state) => {
    // 缓慢的相机漂移
    camera.position.x += Math.sin(state.clock.elapsedTime * 0.1) * 0.01;
    camera.position.y += Math.cos(state.clock.elapsedTime * 0.15) * 0.005;
  });
  
  return null;
}

// 主场景组件
export default function UniverseScene({ 
  onNodeActivate, 
  activeNodes 
}: {
  onNodeActivate: (nodeId: string, nodeType: string) => void;
  activeNodes: string[];
}) {
  // 3D 空间中的节点位置
  const nodes = useMemo(() => [
    // 中心 Codex 恒星
    {
      id: 'codex-main',
      type: 'codex',
      position: [0, 0, 0] as [number, number, number],
      label: 'MAIN CODEX',
      size: 2
    },
    
    // Hero 行星围绕中心
    {
      id: 'hero-assistant',
      type: 'hero',
      position: [-8, 3, -5] as [number, number, number],
      label: 'Assistant',
      color: '#4a90e2'
    },
    {
      id: 'hero-tutor',
      type: 'hero',
      position: [8, -2, 6] as [number, number, number],
      label: 'Tutor',
      color: '#9c27b0'
    },
    {
      id: 'hero-creator',
      type: 'hero',
      position: [5, 8, -3] as [number, number, number],
      label: 'Creator',
      color: '#ff9800'
    },
    {
      id: 'hero-analyst',
      type: 'hero',
      position: [-6, -7, 4] as [number, number, number],
      label: 'Analyst',
      color: '#4caf50'
    },
    {
      id: 'hero-support',
      type: 'hero',
      position: [3, -4, -8] as [number, number, number],
      label: 'Support',
      color: '#f44336'
    },
    {
      id: 'hero-guard',
      type: 'hero',
      position: [-4, 6, 7] as [number, number, number],
      label: 'Guard',
      color: '#607d8b'
    },
    
    // 外围 Codex 恒星
    {
      id: 'codex-knowledge',
      type: 'codex',
      position: [15, 8, -10] as [number, number, number],
      label: 'KNOWLEDGE',
      size: 1.2
    },
    {
      id: 'codex-memory',
      type: 'codex',
      position: [-12, -10, 8] as [number, number, number],
      label: 'MEMORY',
      size: 1.2
    }
  ], []);

  // 连接关系
  const connections = useMemo(() => [
    // 所有 Heroes 连接到主 Codex
    ...nodes.filter(n => n.type === 'hero').map(hero => ({
      from: 'codex-main',
      to: hero.id
    })),
    
    // 专业连接
    { from: 'codex-knowledge', to: 'hero-assistant' },
    { from: 'codex-knowledge', to: 'hero-tutor' },
    { from: 'codex-memory', to: 'hero-analyst' },
    { from: 'codex-memory', to: 'hero-support' },
    
    // Heroes 之间的连接
    { from: 'hero-assistant', to: 'hero-tutor' },
    { from: 'hero-creator', to: 'hero-analyst' },
    { from: 'hero-support', to: 'hero-guard' }
  ], [nodes]);

  return (
    <div className="w-full h-[700px] bg-black rounded-lg overflow-hidden">
      <Canvas camera={{ position: [0, 0, 25], fov: 60 }}>
        <UniverseBackground />
        <CameraController />
        
        {/* 渲染节点 */}
        {nodes.map((node) => {
          const isActive = activeNodes.includes(node.id);
          
          if (node.type === 'codex') {
            return (
              <CodexStar
                key={node.id}
                position={node.position}
                isActive={isActive}
                onClick={() => onNodeActivate(node.id, node.type)}
                label={node.label}
                size={node.size}
              />
            );
          } else {
            return (
              <HeroPlanet
                key={node.id}
                position={node.position}
                isActive={isActive}
                onClick={() => onNodeActivate(node.id, node.type)}
                label={node.label}
                color={node.color}
              />
            );
          }
        })}
        
        {/* 渲染连接 */}
        {connections.map((connection, index) => {
          const fromNode = nodes.find(n => n.id === connection.from);
          const toNode = nodes.find(n => n.id === connection.to);
          
          if (!fromNode || !toNode) return null;
          
          const isActive = activeNodes.includes(connection.from) && 
                          activeNodes.includes(connection.to);
          
          return (
            <ConnectionBeam
              key={index}
              start={fromNode.position}
              end={toNode.position}
              isActive={isActive}
            />
          );
        })}
        
        <OrbitControls 
          enableZoom={true}
          enablePan={true}
          enableRotate={true}
          maxDistance={50}
          minDistance={10}
          autoRotate={true}
          autoRotateSpeed={0.5}
        />
      </Canvas>
    </div>
  );
}