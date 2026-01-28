
"use client";

import React, { useCallback, useEffect } from 'react';
import Link from 'next/link';
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
import { RotateCcw, Info, ArrowLeft } from "lucide-react"; // Add Import

// Neo4j-style Constants
const NEO_BLUE = '#57C7E3';
const NEO_ORANGE = '#F79767';
// Color Palette by Node Type
const TYPE_COLORS: Record<string, string> = {
    'Repository': '#004de6', // Vibrant Blue
    'File': '#F2A2B3',       // Pink
    'Module': '#F4BC42',     // Yellow/Orange
    'Function': '#5BB0B5',   // Teal
    'Class': '#DA717A',      // Red/Salmon (Est.)
    'Variable': '#A0B06B',   // Olive
    'Export': '#97B373',     // Sage Green
    'Interface': '#26A69A',  // Teal
};
const DEFAULT_COLOR = '#A5ABB6'; // Grey

const NEO_NODE_STYLE = {
    borderRadius: '50%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    color: '#fff',
    border: 'none',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '10px',
    fontWeight: 'bold',
    textAlign: 'center' as const
};

// Helper: Get Color by Label
const getNodeColor = (label?: string) => {
    if (!label) return DEFAULT_COLOR;
    return TYPE_COLORS[label] || DEFAULT_COLOR;
};

export default function GraphCanvas({ onNodeClick, initialData, onReset }: { onNodeClick: (node: any) => void, initialData?: any, onReset?: () => void }) {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    // Logic to generate graph from initialData (Neo4j Style)
    const generateGraph = useCallback(() => {
        if (!initialData) return;

        // Identify Repository Node (Root)
        const repoNode = initialData.nodes.find((n: any) => n.label === 'Repository' || n.data.fileCount !== undefined);
        const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

        const mappedNodes = initialData.nodes?.map((n: any, index: number) => {
            const isRepo = n.label === 'Repository' || n.data.fileCount !== undefined;

            // Label Logic
            let label = n.data.name;
            if (!label && n.data.path) label = n.data.path.split('/').pop();
            if (label && label.includes('/')) label = label.split('/').pop(); // Remove owner prefix if present
            if (!label) label = n.id;

            // Truncate for circle fitting
            // Truncate for circle fitting
            if (!isRepo && label.length > 12) label = label.substring(0, 10) + '...';
            // if (isRepo && n.data.fileCount) label = `${label} \n(${n.data.fileCount})`; // User wants simple name match

            // Layout: Radial / Concentric
            let position = n.position || { x: center.x, y: center.y };
            if (!n.position && repoNode && n.id !== repoNode.id) {
                const totalNodes = initialData.nodes.length - 1;
                const angle = ((index) / totalNodes) * 2 * Math.PI;
                const radius = 300;
                position = {
                    x: center.x + radius * Math.cos(angle),
                    y: center.y + radius * Math.sin(angle)
                };
            }

            return {
                id: n.id,
                position,
                data: { ...n.data, label },
                style: {
                    ...NEO_NODE_STYLE,
                    width: isRepo ? 100 : 70,
                    height: isRepo ? 100 : 70,
                    backgroundColor: getNodeColor(n.label),
                    zIndex: isRepo ? 10 : 1,
                    fontSize: isRepo ? '12px' : '9px',
                    overflow: 'hidden',
                    whiteSpace: 'pre-wrap' as const, // For newlines
                }
            };
        }) || [];

        const mappedEdges = initialData.edges?.map((e: any) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            type: 'default', // Straight lines for Neo4j look
            style: { stroke: '#A5ABB6', strokeWidth: 1 },
            animated: false
        })) || [];

        setNodes(mappedNodes);
        setEdges(mappedEdges);
    }, [initialData, setNodes, setEdges]);

    // Initial Load
    useEffect(() => {
        generateGraph();
    }, [generateGraph]);

    // Handle Reset
    const handleReset = () => {
        if (onReset) {
            onReset();
        } else {
            generateGraph();
        }
    }

    const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);

    // Logic to generate graph from initialData (Neo4j Style)
    // ... (generateGraph logic remains same) ...

    // Handle Inspection (Single Click) - Opens/Closes Side Panel
    const handleNodeClick = (event: React.MouseEvent, node: Node) => {
        if (selectedNodeId === node.id) {
            // Toggle OFF
            setSelectedNodeId(null);
            onNodeClick(null);
        } else {
            // Toggle ON
            setSelectedNodeId(node.id);
            onNodeClick(node);
        }
    };

    // Handle Node Expansion (Double Click)
    const handleNodeDoubleClick = async (event: React.MouseEvent, node: Node) => {
        // TOGGLE LOGIC: If already expanded, collapse it.
        if (node.data.expanded) {
            // 1. Find all descendants recursively
            const getDescendants = (parentId: string, allNodes: Node[]): string[] => {
                const children = allNodes.filter(n => n.data.parentId === parentId);
                let ids = children.map(c => c.id);
                children.forEach(c => {
                    ids = [...ids, ...getDescendants(c.id, allNodes)];
                });
                return ids;
            };

            const descendantIds = getDescendants(node.id, nodes);
            const idsToRemove = new Set(descendantIds);

            // 2. Remove Nodes
            setNodes((nds) => nds.filter(n => {
                if (n.id === node.id) {
                    // Reset parent state
                    n.data.expanded = false;
                    n.style = { ...n.style, opacity: 1 }; // Reset opacity
                    return true;
                }
                return !idsToRemove.has(n.id);
            }));

            // 3. Remove Edges connected to removed nodes
            setEdges((eds) => eds.filter(e => !idsToRemove.has(e.source) && !idsToRemove.has(e.target)));

            return; // Stop here
        }

        // EXPAND LOGIC
        // Visual feedback
        setNodes((nds) => nds.map(n => {
            if (n.id === node.id) {
                // Show loading state or highlight
                return { ...n, style: { ...n.style, opacity: 0.7 } };
            }
            return n;
        }));

        try {
            const response = await fetch(`/api/graph/expand?nodeId=${node.id}`);
            const data = await response.json();

            if (data.nodes && data.nodes.length > 0) {
                // Simple force layout for new nodes
                const newNodes = data.nodes.map((n: any, index: number) => {
                    const totalNew = data.nodes.length;
                    const angle = (index / totalNew) * 2 * Math.PI;
                    const radius = 200; // Smaller radius for expansion
                    const x = node.position.x + radius * Math.cos(angle);
                    const y = node.position.y + radius * Math.sin(angle);

                    // derive smart label
                    let computedLabel = n.data.name;
                    if (!computedLabel && n.data.path) computedLabel = n.data.path.split('/').pop();
                    if (!computedLabel) computedLabel = n.label || n.id;
                    if (computedLabel.length > 12) computedLabel = computedLabel.substring(0, 10) + '...';

                    return {
                        id: n.id,
                        position: { x, y },
                        data: { ...n.data, label: computedLabel, parentId: node.id }, // Track lineage
                        style: {
                            ...NEO_NODE_STYLE,
                            width: 70,
                            height: 70,
                            backgroundColor: getNodeColor(n.label),
                            fontSize: '9px',
                            overflow: 'hidden',
                            whiteSpace: 'pre-wrap' as const
                        }
                    };
                });

                const newEdges = data.edges.map((e: any) => ({
                    id: e.id,
                    source: e.source,
                    target: e.target,
                    style: { stroke: '#A5ABB6', strokeWidth: 1 },
                    animated: false
                }));

                setNodes((nds) => {
                    const updatedParent = nds.map(n => n.id === node.id ? {
                        ...n,
                        data: { ...n.data, expanded: true },
                        style: { ...n.style, opacity: 1 }
                    } : n);
                    // Filter out duplicates if node expansion returns existing nodes
                    const existingIds = new Set(updatedParent.map(n => n.id));
                    const uniqueNewNodes = newNodes.filter((n: any) => !existingIds.has(n.id));

                    return [...updatedParent, ...uniqueNewNodes];
                });
                setEdges((eds) => {
                    const existingIds = new Set(eds.map(e => e.id));
                    const uniqueNewEdges = newEdges.filter((e: any) => !existingIds.has(e.id));
                    return [...eds, ...uniqueNewEdges];
                });
            } else {
                // No new nodes found
                setNodes((nds) => nds.map(n => n.id === node.id ? { ...n, style: { ...n.style, opacity: 1 } } : n));
            }
        } catch (err) {
            console.error("Failed to expand:", err);
            setNodes((nds) => nds.map(n => n.id === node.id ? { ...n, style: { ...n.style, opacity: 1 } } : n));
        }
    };

    const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge(params, eds)), [setEdges]);




    // Filter State
    const [searchType, setSearchType] = React.useState<string>('');
    const [showFilterMenu, setShowFilterMenu] = React.useState(false);
    const [showLegend, setShowLegend] = React.useState(false);
    const searchInputRef = React.useRef<HTMLInputElement>(null);

    // Reuseable Search Function
    const performSearch = async (query: string, type: string) => {
        // Find repo name from current nodes (hacky but works if repo node exists)
        const repoNode = nodes.find(n => n.data.fileCount !== undefined);
        const repoName = repoNode?.data?.name || 'cognidesk';

        console.log(`[Search] Query: "${query}", Type: "${type}", Repo: "${repoName}"`);

        try {
            let url = `/api/graph/filter?repo=${repoName}&path=${query}`;
            if (type) url += `&type=${type}`;

            console.log(`[Search] Fetching: ${url}`);

            const res = await fetch(url);
            const data = await res.json();
            console.log(`[Search] Result:`, data);

            if (data.nodes && data.nodes.length > 0) {
                console.log(`[Search] Found ${data.nodes.length} nodes. Clearing graph and setting nodes.`);
                // ISOLATION MODE: Replace all nodes with search result
                const searchNodes = data.nodes.map((n: any, i: number) => {
                    // Grid Layout
                    const col = i % 5;
                    const row = Math.floor(i / 5);
                    const offsetX = (col - 2) * 140;
                    const offsetY = row * 160;

                    const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

                    const pathStr = n.data.path || n.path || '';
                    let name = n.data.name || n.name || n.label || n.id;
                    if (name === 'File' && pathStr) name = pathStr.split('/').pop();

                    return {
                        id: n.id,
                        position: { x: center.x + offsetX, y: center.y + offsetY },
                        data: {
                            ...n.data,
                            label: (
                                <div className="relative flex flex-col items-center overflow-visible">
                                    {/* Node Circle */}
                                    <div
                                        className="flex items-center justify-center rounded-full shadow-lg"
                                        style={{
                                            width: '80px',
                                            height: '80px',
                                            backgroundColor: getNodeColor(n.label || 'File'),
                                            border: '2px solid rgba(255,255,255,0.2)'
                                        }}
                                    >
                                        <div className="font-bold text-white text-[10px] text-center p-1 break-all leading-tight">
                                            {name}
                                        </div>
                                    </div>

                                    {/* Path Display (Outside/Below) */}
                                    <div className="absolute top-full mt-2 bg-slate-800/90 text-slate-300 text-[10px] px-2 py-1 rounded border border-slate-700 whitespace-nowrap shadow-sm z-50">
                                        {pathStr}
                                    </div>
                                </div>
                            )
                        },
                        style: {
                            width: 'auto',
                            height: 'auto',
                            backgroundColor: 'transparent',
                            border: 'none',
                            boxShadow: 'none',
                        }
                    };
                });

                setNodes(searchNodes);
                setEdges([]);
            } else {
                console.log(`[Search] No nodes found.`);
            }
        } catch (err) {
            console.error("Search failed:", err);
        }
    };

    // Helper: Search Graph (Key Handler)
    const handleSearch = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            const query = (e.target as HTMLInputElement).value;
            if (!query && !searchType) return;
            performSearch(query, searchType);
        }
    };

    // Filter Change Handler (Auto-Trigger)
    const handleFilterChange = (type: string) => {
        setSearchType(type);
        setShowFilterMenu(false);
        // Auto-search if query exists OR if type is selected (allowing empty query for type filtering)
        const currentQuery = searchInputRef.current?.value || '';
        performSearch(currentQuery, type);
    };


    return (
        <div className="w-full h-full bg-white dark:bg-black relative">
            {/* Top Left: Back to Dashboard */}
            <Link
                href="/dashboard"
                className="absolute top-4 left-4 z-50 flex items-center justify-center p-2 bg-white/80 dark:bg-black/80 backdrop-blur border border-sharp rounded-full shadow-sm hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
                title="Back to Dashboard"
            >
                <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
            </Link>

            {/* Top Bar: Search with Filter */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 w-[500px] flex items-center space-x-2">
                {/* Custom Filter Dropdown */}
                <div className="relative">
                    <button
                        onClick={() => setShowFilterMenu(!showFilterMenu)}
                        className="px-4 py-2 bg-white/90 dark:bg-black/90 backdrop-blur border border-sharp rounded-full shadow-sm text-sm font-mono flex items-center space-x-2 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
                    >
                        <span style={{ color: searchType ? TYPE_COLORS[searchType] : 'inherit' }}>
                            {searchType || 'Filter'}
                        </span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>

                    {showFilterMenu && (
                        <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-black border border-sharp rounded-lg shadow-xl py-2 z-50">
                            <div
                                className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer text-sm font-mono"
                                onClick={() => handleFilterChange('')}
                            >
                                All
                            </div>
                            {Object.keys(TYPE_COLORS).map(type => (
                                <div
                                    key={type}
                                    className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer text-sm font-mono flex items-center space-x-2"
                                    onClick={() => handleFilterChange(type)}
                                >
                                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TYPE_COLORS[type] }}></span>
                                    <span>{type}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <input
                    ref={searchInputRef}
                    type="text"
                    placeholder={`Search ${searchType ? searchType + 's' : 'code'}...`}
                    className="flex-grow px-4 py-2 rounded-full border border-sharp bg-white/90 dark:bg-black/90 backdrop-blur shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                    onKeyDown={handleSearch}
                />
            </div>

            {/* Top Right: Reset & Counter */}
            <div className="absolute top-4 right-4 z-10 flex items-center space-x-2">
                <button
                    onClick={handleReset}
                    className="flex items-center justify-center p-2 bg-white/80 dark:bg-black/80 backdrop-blur border border-sharp rounded shadow-sm hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
                    title="Reset Graph"
                >
                    <RotateCcw className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                </button>
                <div className="bg-white/80 dark:bg-black/80 backdrop-blur border border-sharp px-3 py-1.5 rounded shadow-sm">
                    <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300">
                        Nodes: {nodes.length}
                    </span>
                </div>
            </div>

            {/* Bottom Left: Legend Toggle */}
            <div className="absolute bottom-4 left-4 z-10 flex flex-col items-start space-y-2">
                {/* Collapsible Panel */}
                {showLegend && (
                    <div className="bg-white/90 dark:bg-black/90 backdrop-blur border border-sharp p-3 rounded shadow-sm mb-2 animate-in slide-in-from-bottom-2 fade-in duration-200">
                        <div className="flex flex-col space-y-2">
                            {Object.entries(TYPE_COLORS).map(([type, color]) => (
                                <div key={type} className="flex items-center space-x-2">
                                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }}></span>
                                    <span className="text-[10px] font-bold uppercase text-slate-600 dark:text-slate-300 font-mono">{type}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Toggle Button */}
                <button
                    onClick={() => setShowLegend(!showLegend)}
                    className="flex items-center justify-center p-2 bg-white/80 dark:bg-black/80 backdrop-blur border border-sharp rounded-full shadow-sm hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
                    title="Toggle Legend"
                >
                    <Info className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                </button>
            </div>

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
