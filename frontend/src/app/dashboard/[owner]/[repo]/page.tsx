"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import GraphCanvas from "@/components/dashboard/GraphCanvas";
import DetailPanel from "@/components/dashboard/DetailPanel";
import { AlertCircle } from "lucide-react";
import GraphLoadingState from "@/components/dashboard/GraphLoadingState";

export default function DashboardPage() {
    const params = useParams();
    const { owner, repo } = params as { owner: string; repo: string };
    const [selectedNode, setSelectedNode] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState("");
    const [graphData, setGraphData] = useState<any>(null);
    const [nodeDetails, setNodeDetails] = useState<any>(null);

    // Fetch details when selectedNode changes
    useEffect(() => {
        if (!selectedNode) {
            setNodeDetails(null);
            return;
        }

        const fetchNodeDetails = async () => {
            try {
                // Use the ID from the selected node
                const res = await fetch(`http://localhost:5001/api/graph/node?id=${selectedNode.id}`);
                if (res.ok) {
                    const data = await res.json();
                    setNodeDetails(data);
                }
            } catch (err) {
                console.error("Failed to fetch node details:", err);
            }
        };
        fetchNodeDetails();
    }, [selectedNode]);

    useEffect(() => {
        const fetchGraphData = async () => {
            try {
                // If owner is "undefined", it means we used direct repo name input
                // repo_parser expects "repo" query param which is the graph name
                const repoId = owner === "undefined" ? repo : `${owner}/${repo}`;

                // In a real app, we might poll or wait for SSE. 
                // For now, we assume data exists or will exist shortly.
                // NOTE: graphController.js expects ?repo=..., not ?repoId=... 
                // I checked graphController.js earlier: "const { repo, limit = 30 } = req.query;"
                // I checked graphController.js earlier: "const { repo, limit = 30 } = req.query;"
                const response = await fetch(`http://localhost:5001/api/graph/start?repo=${repoId}&limit=30`);

                if (!response.ok) {
                    // If 404, maybe it's still processing. 
                    // For MVP, just show error.
                    throw new Error("Failed to load graph data. Is the repository processed?");
                }

                const data = await response.json();
                setGraphData(data); // Expecting { nodes: [], edges: [] }
                setIsLoading(false);
            } catch (err: any) {
                console.error(err);
                setError(err.message);
                setIsLoading(false);
            }
        };

        fetchGraphData();
    }, [owner, repo]);

    const handleFileSelect = async (path: string) => {
        try {
            setIsLoading(true);
            const repoId = owner === "undefined" ? repo : `${owner}/${repo}`;

            // Filter graph by path, restricting to "File" type only to avoid showing internal functions/vars
            const res = await fetch(`http://localhost:5001/api/graph/filter?repo=${repoId}&path=${encodeURIComponent(path)}&type=File`);
            if (!res.ok) throw new Error("Failed to filter graph");

            const data = await res.json();
            setGraphData(data);

            // Also set selected node details if a single node is returned, or try to find the matching node
            // For now, just updating the graph is key.
            // Highlight the node if it exists in the new data
            const matchingNode = data.nodes.find((n: any) => n.data?.path === path || n.id === path);
            if (matchingNode) {
                setSelectedNode(matchingNode);
            }

            setIsLoading(false);
        } catch (err) {
            console.error(err);
            setError("Failed to filter graph");
            setIsLoading(false);
        }
    };

    if (isLoading) {
        return <GraphLoadingState />;
    }

    if (error) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-white dark:bg-black">
                <div className="max-w-md text-center p-8 border-sharp shadow-sharp bg-white dark:bg-black">
                    <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold mb-2">Error Loading Graph</h2>
                    <p className="text-slate-500 text-sm mb-6">{error}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black font-bold text-sm rounded hover:opacity-80"
                    >
                        Retry
                    </button>
                </div>
            </div>
        )
    }

    {/* Extract path from selectedNode for Sidebar highlighting */ }
    // selectedNode structure depends on backend. Usually { id, label, data: { path: "..." } }
    const selectedPath = selectedNode?.data?.path || null;

    return (
        <div className="flex h-screen w-full bg-white dark:bg-black overflow-hidden font-sans">
            {/* Sidebar */}
            <div className="w-80 border-r border-sharp bg-slate-50 dark:bg-black flex-shrink-0 z-10">
                <Sidebar
                    owner={owner}
                    repo={repo}
                    selectedFile={selectedPath}
                    onFileSelect={handleFileSelect}
                />
            </div>

            {/* Main Canvas */}
            <div className="flex-grow h-full relative">
                <GraphCanvas
                    initialData={graphData}
                    onNodeClick={setSelectedNode}
                    onReset={() => {
                        // Reset logic: Clear selection and re-fetch initial data
                        setSelectedNode(null);
                        const repoId = owner === "undefined" ? repo : `${owner}/${repo}`;

                        // Re-fetch initial logic (duplicated from useEffect, could be extracted)
                        const fetchGraphData = async () => {
                            try {
                                setIsLoading(true);
                                const response = await fetch(`http://localhost:5001/api/graph/start?repo=${repoId}&limit=30`);
                                if (!response.ok) throw new Error("Failed to reset graph");
                                const data = await response.json();
                                setGraphData(data);
                                setIsLoading(false);
                            } catch (err) {
                                console.error(err);
                                setIsLoading(false);
                            }
                        };
                        fetchGraphData();
                    }}
                />
            </div>

            {/* Right Detail Panel */}
            {selectedNode && (
                <div className="w-96 border-l border-sharp bg-white dark:bg-black flex-shrink-0 shadow-2xl z-20 absolute right-0 top-0 bottom-0">
                    <DetailPanel
                        node={selectedNode}
                        details={nodeDetails}
                        onClose={() => setSelectedNode(null)}
                        owner={owner}
                        repo={repo}
                    />
                </div>
            )}
        </div>
    );
}
