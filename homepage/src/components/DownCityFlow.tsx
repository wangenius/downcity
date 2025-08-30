'use client';

import { useCallback, useState, useEffect } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';

// 自定义 Hero 节点
const HeroNode = ({ data, selected }: { data: any; selected: boolean }) => {
  return (
    <div className={`px-4 py-2 rounded-full border-2 transition-all duration-300 ${
      data.active 
        ? 'bg-blue-500 border-blue-300 text-white shadow-lg shadow-blue-500/50' 
        : 'bg-gray-800 border-gray-600 text-gray-300 hover:border-blue-400'
    } ${selected ? 'ring-2 ring-blue-400' : ''}`}>
      <div className="flex items-center space-x-2">
        <div className="text-lg">🦸‍♂️</div>
        <div className="font-mono text-sm">{data.label}</div>
      </div>
      {data.active && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse" />
      )}
    </div>
  );
};

// 自定义 Codex 节点
const CodexNode = ({ data, selected }: { data: any; selected: boolean }) => {
  return (
    <div className={`px-6 py-4 rounded-lg border-2 transition-all duration-300 ${
      data.active 
        ? 'bg-orange-500 border-orange-300 text-white shadow-lg shadow-orange-500/50' 
        : 'bg-gray-800 border-gray-600 text-gray-300 hover:border-orange-400'
    } ${selected ? 'ring-2 ring-orange-400' : ''}`}>
      <div className="flex items-center space-x-2">
        <div className="text-xl">📚</div>
        <div className="font-mono text-sm font-bold">{data.label}</div>
      </div>
      {data.active && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse" />
      )}
    </div>
  );
};

const nodeTypes: NodeTypes = {
  hero: HeroNode,
  codex: CodexNode,
};

const initialNodes: Node[] = [
  // 中心 Codex
  {
    id: 'codex-main',
    type: 'codex',
    position: { x: 400, y: 300 },
    data: { 
      label: 'MAIN CODEX', 
      active: false,
      description: 'Central knowledge repository'
    },
  },
  // Heroes 围绕中心
  {
    id: 'hero-1',
    type: 'hero',
    position: { x: 200, y: 150 },
    data: { 
      label: 'Assistant', 
      active: false,
      description: 'Personal AI assistant'
    },
  },
  {
    id: 'hero-2',
    type: 'hero',
    position: { x: 600, y: 150 },
    data: { 
      label: 'Tutor', 
      active: false,
      description: 'Educational AI tutor'
    },
  },
  {
    id: 'hero-3',
    type: 'hero',
    position: { x: 700, y: 300 },
    data: { 
      label: 'Creator', 
      active: false,
      description: 'Creative content generator'
    },
  },
  {
    id: 'hero-4',
    type: 'hero',
    position: { x: 600, y: 450 },
    data: { 
      label: 'Analyst', 
      active: false,
      description: 'Data analysis specialist'
    },
  },
  {
    id: 'hero-5',
    type: 'hero',
    position: { x: 200, y: 450 },
    data: { 
      label: 'Support', 
      active: false,
      description: '24/7 customer support'
    },
  },
  {
    id: 'hero-6',
    type: 'hero',
    position: { x: 100, y: 300 },
    data: { 
      label: 'Guard', 
      active: false,
      description: 'Security monitoring'
    },
  },
  // 专业 Codex
  {
    id: 'codex-knowledge',
    type: 'codex',
    position: { x: 400, y: 100 },
    data: { 
      label: 'KNOWLEDGE', 
      active: false,
      description: 'Domain-specific knowledge'
    },
  },
  {
    id: 'codex-memory',
    type: 'codex',
    position: { x: 400, y: 500 },
    data: { 
      label: 'MEMORY', 
      active: false,
      description: 'Long-term memory storage'
    },
  },
];

const initialEdges: Edge[] = [
  // 中心 Codex 连接所有 Heroes
  { id: 'e1', source: 'codex-main', target: 'hero-1', animated: false, style: { stroke: '#374151' } },
  { id: 'e2', source: 'codex-main', target: 'hero-2', animated: false, style: { stroke: '#374151' } },
  { id: 'e3', source: 'codex-main', target: 'hero-3', animated: false, style: { stroke: '#374151' } },
  { id: 'e4', source: 'codex-main', target: 'hero-4', animated: false, style: { stroke: '#374151' } },
  { id: 'e5', source: 'codex-main', target: 'hero-5', animated: false, style: { stroke: '#374151' } },
  { id: 'e6', source: 'codex-main', target: 'hero-6', animated: false, style: { stroke: '#374151' } },
  
  // 专业 Codex 连接
  { id: 'e7', source: 'codex-knowledge', target: 'hero-1', animated: false, style: { stroke: '#374151' } },
  { id: 'e8', source: 'codex-knowledge', target: 'hero-2', animated: false, style: { stroke: '#374151' } },
  { id: 'e9', source: 'codex-memory', target: 'hero-4', animated: false, style: { stroke: '#374151' } },
  { id: 'e10', source: 'codex-memory', target: 'hero-5', animated: false, style: { stroke: '#374151' } },
  
  // Heroes 之间的连接
  { id: 'e11', source: 'hero-1', target: 'hero-2', animated: false, style: { stroke: '#374151' } },
  { id: 'e12', source: 'hero-2', target: 'hero-3', animated: false, style: { stroke: '#374151' } },
  { id: 'e13', source: 'hero-3', target: 'hero-4', animated: false, style: { stroke: '#374151' } },
  { id: 'e14', source: 'hero-4', target: 'hero-5', animated: false, style: { stroke: '#374151' } },
  { id: 'e15', source: 'hero-5', target: 'hero-6', animated: false, style: { stroke: '#374151' } },
  { id: 'e16', source: 'hero-6', target: 'hero-1', animated: false, style: { stroke: '#374151' } },
];

export default function DownCityFlow({ 
  onNodeActivate, 
  activeNodes 
}: {
  onNodeActivate: (nodeId: string, nodeData: any) => void;
  activeNodes: string[];
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // 更新节点激活状态
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: {
          ...node.data,
          active: activeNodes.includes(node.id),
        },
      }))
    );

    // 更新边的样式
    setEdges((eds) =>
      eds.map((edge) => {
        const sourceActive = activeNodes.includes(edge.source);
        const targetActive = activeNodes.includes(edge.target);
        const isActive = sourceActive && targetActive;
        
        return {
          ...edge,
          animated: isActive,
          style: {
            stroke: isActive ? '#10b981' : '#374151',
            strokeWidth: isActive ? 2 : 1,
          },
        };
      })
    );
  }, [activeNodes, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      onNodeActivate(node.id, node.data);
    },
    [onNodeActivate]
  );

  return (
    <div className="w-full h-[600px] bg-gray-900 rounded-lg border border-gray-700">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
      >
        <Controls className="bg-gray-800 border-gray-600" />
        <Background 
          variant={BackgroundVariant.Dots} 
          gap={20} 
          size={1} 
          color="#374151"
        />
      </ReactFlow>
    </div>
  );
}