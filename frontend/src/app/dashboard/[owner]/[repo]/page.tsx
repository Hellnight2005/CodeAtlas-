"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import GraphCanvas from "@/components/dashboard/GraphCanvas";
import DetailPanel from "@/components/dashboard/DetailPanel";
import { Loader2, AlertCircle } from "lucide-react";

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
                const response = await fetch(`http://localhost:5001/api/graph/start?repo=${repoId}`);

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

    if (isLoading) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-white dark:bg-black">
                <div className="flex flex-col items-center">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-400 mb-4" />
                    <p className="text-slate-500 font-mono text-sm">Loading graph data...</p>
                </div>
            </div>
        )
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

    return (
        <div className="flex h-screen w-full bg-white dark:bg-black overflow-hidden font-sans">
            {/* Sidebar */}
            <div className="w-80 border-r border-sharp bg-slate-50 dark:bg-black flex-shrink-0 z-10">
                <Sidebar owner={owner} repo={repo} />
            </div>

            {/* Main Canvas */}
            <div className="flex-grow h-full relative">
                <GraphCanvas
                    initialData={graphData}
                    onNodeClick={setSelectedNode}
                />
            </div>

            {/* Right Detail Panel */}
            {selectedNode && (
                <div className="w-96 border-l border-sharp bg-white dark:bg-black flex-shrink-0 shadow-2xl z-20 absolute right-0 top-0 bottom-0">
                    <DetailPanel node={selectedNode} details={nodeDetails} onClose={() => setSelectedNode(null)} />
                </div>
            )}
        </div>
    );
}
