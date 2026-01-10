"use client";

import React, { useCallback, useEffect } from 'react';
import ReactFlow, {
    MiniMap,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    Edge,
    Node,
    BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';

// Styles for custom nodes - Eraser.io style
const nodeStyle = {
    border: '2px solid black',
    borderRadius: '4px',
    boxShadow: '4px 4px 0px 0px rgba(0,0,0,0.1)',
    background: 'white',
    padding: '10px',
    fontFamily: 'monospace',
    fontSize: '12px',
    fontWeight: 'bold',
    minWidth: '150px',
    textAlign: 'center' as const
};

export default function GraphCanvas({ onNodeClick, initialData }: { onNodeClick: (node: any) => void, initialData?: any }) {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    useEffect(() => {
        if (initialData) {
            const mappedNodes = initialData.nodes?.map((n: any) => {
                let label = n.data.label || n.id;
                // Progressive Loading UI: Show count if available
                if (n.data.fileCount !== undefined) {
                    label = `${label} (${n.data.fileCount} files)`;
                }

                return {
                    id: n.id,
                    position: n.position || { x: window.innerWidth / 2, y: window.innerHeight / 2 },
                    data: { ...n.data, label },
                    style: {
                        ...nodeStyle,
                        // Highlight Repository node
                        borderColor: n.data.fileCount !== undefined ? '#000' : '#ccc',
                        borderWidth: n.data.fileCount !== undefined ? '3px' : '2px',
                        fontWeight: n.data.fileCount !== undefined ? '800' : 'bold',
                    }
                };
            }) || [];

            const mappedEdges = initialData.edges?.map((e: any) => ({
                id: e.id,
                source: e.source,
                target: e.target,
                type: 'smoothstep',
                style: { stroke: '#000', strokeWidth: 1.5 },
                animated: true
            })) || [];

            setNodes(mappedNodes);
            setEdges(mappedEdges);
        }
    }, [initialData, setNodes, setEdges]);

    // Handle Node Expansion (Single Click)
    const handleNodeClick = async (event: React.MouseEvent, node: Node) => {
        // Check if expandable
        if (node.data.fileCount && !node.data.expanded) {
            // Visual feedback
            setNodes((nds) => nds.map(n => {
                if (n.id === node.id) {
                    return { ...n, data: { ...n.data, label: 'Loading...' }, style: { ...n.style, background: '#f0f0f0' } };
                }
                return n;
            }));

            try {
                const res = await fetch(`http://localhost:5001/api/graph/expand?nodeId=${node.id}`);
                const data = await res.json();

                if (data.nodes) {
                    // Simple force layout for new nodes
                    const newNodes = data.nodes.map((n: any, index: number) => {
                        const angle = (index / data.nodes.length) * 2 * Math.PI;
                        const radius = 300;
                        const x = node.position.x + radius * Math.cos(angle);
                        const y = node.position.y + radius * Math.sin(angle);

                        return {
                            id: n.id,
                            position: { x, y },
                            data: { ...n.data, label: n.label || n.id },
                            style: nodeStyle
                        };
                    });

                    const newEdges = data.edges.map((e: any) => ({
                        id: e.id,
                        source: e.source,
                        target: e.target,
                        style: { stroke: '#ccc', strokeWidth: 1 },
                        animated: true
                    }));

                    setNodes((nds) => {
                        const updatedParent = nds.map(n => n.id === node.id ? {
                            ...n,
                            data: { ...n.data, expanded: true, label: n.data.label.replace('Loading...', '').replace(/\(.*\)/, '') },
                            style: { ...n.style, background: 'white' }
                        } : n);
                        return [...updatedParent, ...newNodes];
                    });
                    setEdges((eds) => [...eds, ...newEdges]);
                }
            } catch (err) {
                console.error("Failed to expand:", err);
                setNodes((nds) => nds.map(n => n.id === node.id ? { ...n, data: { ...n.data, label: 'Error' } } : n));
            }

        }
        // If not expandable, single click selects/highlights but DOES NOT open side panel (per user request)
    };

    // Handle Inspection (Double Click) - Opens Side Panel
    const handleNodeDoubleClick = (event: React.MouseEvent, node: Node) => {
        onNodeClick(node);
    };

    const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

    return (
        <div className="w-full h-full bg-white dark:bg-black">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={handleNodeClick}
                onNodeDoubleClick={handleNodeDoubleClick}
                fitView
                className="bg-dot-pattern"
            >
                <Controls showInteractive={false} className="bg-white dark:bg-black border-sharp fill-black dark:fill-white" />
                <MiniMap
                    className="bg-white dark:bg-black border-sharp"
                    nodeColor={() => '#e2e8f0'}
                    maskColor="rgba(0, 0, 0, 0.05)"
                />
                <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e5e5e5" />
            </ReactFlow>
        </div>
    );
}
