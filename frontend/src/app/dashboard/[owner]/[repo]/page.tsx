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
    const [loadingMessage, setLoadingMessage] = useState("");
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
                const res = await fetch(`/api/graph/node?id=${selectedNode.id}`);
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
        let isMounted = true;
        let retryCount = 0;
        const MAX_RETRIES = 60; // Increased retries for long pipelines (2 min)
        const RETRY_DELAY = 2000;

        const fetchGraphData = async () => {
            try {
                // If owner is "undefined", it means we used direct repo name input
                // repo_parser expects "repo" query param which is the graph name
                const repoId = owner && owner !== "undefined" ? `${owner}/${repo}` : repo;
                console.log(`[Dashboard] Fetching graph for: ${repoId}`);

                // Fetch & Initialize Graph (Unified Route)
                const response = await fetch(`/api/check_for_the_file?repo=${repoId}&limit=30`);

                if (response.status === 202) {
                    const data = await response.json();
                    if (isMounted) {
                        setLoadingMessage(data.message || "Initializing graph...");
                        if (retryCount < MAX_RETRIES) {
                            retryCount++;
                            setTimeout(fetchGraphData, RETRY_DELAY);
                        } else {
                            setError("Processing timed out. Please try again later.");
                            setIsLoading(false);
                        }
                    }
                    return;
                }

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    // Specific handling for User Requested "Github Limit" message
                    if (response.status === 429 || errData.code === 'RATE_LIMIT') {
                        throw new Error("Sorry we reached the github limit till now");
                    }
                    throw new Error(errData.error || "Failed to load graph data.");
                }

                const data = await response.json();
                console.log(`[Dashboard] Graph Data Length: ${data.nodes?.length || 0} Status: ${response.status}`);

                if (isMounted) {
                    // Check if data is empty or if backend signaled processing (202)
                    // If empty, it means AST might still be generating.
                    if ((!data.nodes || data.nodes.length === 0) || response.status === 202) {

                        // Update status message if provided
                        if (data.message) {
                            setLoadingMessage(data.message);
                        } else {
                            setLoadingMessage(`Constructing Knowledge Graph... (${retryCount})`);
                        }

                        if (retryCount < MAX_RETRIES) {
                            console.log(`[Dashboard] Pipeline Processing... Retrying (${retryCount + 1}/${MAX_RETRIES})`);
                            retryCount++;
                            setTimeout(fetchGraphData, RETRY_DELAY);
                        } else {
                            setError("Repository processing timed out. Please try syncing again from the dashboard.");
                            setIsLoading(false);
                        }
                    } else if (response.status === 200 && data.status === 'rate_limited') {
                        // Fallback transparency if body has status
                        setError("Sorry we reached the github limit till now");
                        setIsLoading(false);
                    } else {
                        // Data Loaded
                        setGraphData(data);
                        setIsLoading(false);
                    }
                }
            } catch (err: any) {
                console.error(err);
                if (isMounted) {
                    setError(err.message);
                    setIsLoading(false);
                }
            }
        };

        // Start Fetch
        fetchGraphData();

        return () => { isMounted = false; };
    }, [owner, repo]);

    const handleFileSelect = async (path: string) => {
        try {
            setIsLoading(true);
            const repoId = owner && owner !== "undefined" ? `${owner}/${repo}` : repo;
            console.log(`[Dashboard] Filtering graph for: ${repoId} path=${path}`);

            // Filter graph by path, restricting to "File" type only to avoid showing internal functions/vars
            const res = await fetch(`/api/graph/filter?repo=${repoId}&path=${encodeURIComponent(path)}&type=File`);
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
        // Pass dynamic message
        return <GraphLoadingState message={loadingMessage} />;
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
                                const repoId = owner && owner !== "undefined" ? `${owner}/${repo}` : repo;
                                console.log(`[Dashboard] Resetting graph for: ${repoId}`);
                                const response = await fetch(`/api/check_for_the_file?repo=${repoId}&limit=30`);
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
