"use client";

import { useState, useEffect } from "react";
import { X, FileText, Sparkles, AlertCircle, Github } from "lucide-react";

interface AISummaryResponse {
    summary: string;
    improvement_tip: string;
    complexity_score: number;
    dependencies: string[];
    github_url?: string;
    source?: string;
}

export default function DetailPanel({ node, details, onClose, owner, repo }: { node: any; details?: any; onClose: () => void; owner?: string; repo?: string }) {
    const [summaryData, setSummaryData] = useState<AISummaryResponse | null>(null);
    const [isLoadingSummary, setIsLoadingSummary] = useState(false);
    const [summaryError, setSummaryError] = useState("");

    // Auto-check for existing summary when node changes
    useEffect(() => {
        setSummaryData(null);
        setSummaryError("");

        const checkExistingSummary = async () => {
            // Only for files
            if (!node || !node.data || (node.label !== 'File' && node.data.type !== 'File')) return;

            try {
                // Determine owner safely
                let currentOwner = owner;
                if (!currentOwner || currentOwner === "undefined" || currentOwner === "local") {
                    // If we don't have owner, we might fail or rely on backend to resolve or fail.
                    // The backend's new logic (from previous step) handles resolving owner from repo_sync logic internally? 
                    // Wait, previous step Logic in 'getAiFileSummary' resolves it IF missing. 
                    // But we need to pass the repo/path params.
                }

                const params = new URLSearchParams({
                    repo: repo || '',
                    owner: owner || '',
                    path: node.data.path,
                    generate: 'false' // Do not generate, just check
                });

                const res = await fetch(`/api/repo/summary?${params.toString()}`);
                if (res.ok) {
                    const data: AISummaryResponse = await res.json();
                    if (data.summary) {
                        setSummaryData(data);
                    }
                }
            } catch (err) {
                // Ignore errors for auto-check (just means we show the button)
                console.log("No existing summary found or error checking:", err);
            }
        };

        checkExistingSummary();
    }, [node, owner, repo]);

    // If no details yet, show loading skeleton
    if (!details) {
        return (
            <div className="h-full flex flex-col bg-white dark:bg-black font-mono animate-pulse">
                {/* Header Skeleton */}
                <div className="flex items-center justify-between p-4 border-b border-sharp bg-slate-50 dark:bg-slate-900">
                    <div className="flex items-center space-x-3 w-full">
                        <div className="h-8 w-8 bg-slate-200 dark:bg-slate-800 rounded"></div>
                        <div className="space-y-2 w-3/4">
                            <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-800 rounded"></div>
                            <div className="h-3 w-1/4 bg-slate-200 dark:bg-slate-800 rounded"></div>
                        </div>
                    </div>
                </div>
                {/* Content Skeleton */}
                <div className="p-5 space-y-4">
                    <div className="h-32 w-full bg-slate-100 dark:bg-slate-900 rounded"></div>
                    <div className="h-8 w-1/2 bg-slate-100 dark:bg-slate-900 rounded"></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="h-16 bg-slate-100 dark:bg-slate-900 rounded"></div>
                        <div className="h-16 bg-slate-100 dark:bg-slate-900 rounded"></div>
                    </div>
                </div>
            </div>
        )
    }

    const { label, properties } = details;

    const handleAISummary = async () => {
        setIsLoadingSummary(true);
        setSummaryError("");
        try {
            const params = new URLSearchParams({
                repo: repo || '',
                owner: owner || '',
                path: node.data.path,
                generate: 'true' // Force generate if needed (default)
            });
            const res = await fetch(`/api/repo/summary?${params.toString()}`);
            if (!res.ok) throw new Error("Failed to fetch summary");
            const data: AISummaryResponse = await res.json();
            setSummaryData(data);
        } catch (err) {
            setSummaryError("Could not generate summary. Backend might be busy.");
        } finally {
            setIsLoadingSummary(false);
        }
    };

    return (
        <div className="h-full flex flex-col bg-white dark:bg-black font-mono">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-sharp bg-slate-50 dark:bg-slate-900">
                <div className="flex items-center space-x-3 overflow-hidden">
                    <div className="p-1.5 bg-white dark:bg-black border border-sharp rounded-sm shadow-sm">
                        <FileText className="w-4 h-4 text-black dark:text-white" />
                    </div>
                    <div>
                        <h3 className="font-bold text-sm text-black dark:text-white truncate max-w-[200px]">
                            {node.data.label}
                        </h3>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                            {properties?.type || label || "Unknown"}
                        </p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors"
                >
                    <X className="w-4 h-4 text-slate-500" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-8">

                {/* Actions - Only for Files */}
                {(label === 'File' || properties?.type === 'File') && (
                    <>
                        <div className="grid grid-cols-1 gap-3">
                            <button
                                onClick={async () => {
                                    if (owner && owner !== "undefined" && owner !== "local") {
                                        window.open(`https://github.com/${owner}/${repo}/blob/main/${node.data.path}`, '_blank');
                                    } else {
                                        // Fetch URL from backend which resolves owner from DB
                                        try {
                                            const params = new URLSearchParams({
                                                repo: repo || '',
                                                path: node.data.path,
                                                metadataOnly: 'true'
                                            });
                                            const res = await fetch(`/api/repo/summary?${params.toString()}`);
                                            if (res.ok) {
                                                const data = await res.json();
                                                if (data.github_url) {
                                                    window.open(data.github_url, '_blank');
                                                } else {
                                                    alert("Could not resolve GitHub URL.");
                                                }
                                            } else {
                                                alert("Failed to get GitHub URL.");
                                            }
                                        } catch (e) {
                                            console.error("Error fetching GitHub URL:", e);
                                        }
                                    }
                                }}
                                className="flex items-center justify-center py-2 px-3 border border-slate-200 dark:border-slate-800 hover:border-black dark:hover:border-white rounded bg-white dark:bg-black text-xs font-bold transition-all shadow-sm text-black dark:text-white"
                            >
                                <Github className="w-3 h-3 mr-2" />
                                View on GitHub
                            </button>
                        </div>

                        {/* AI Summary Button - Only show if NO summary data */}
                        {!summaryData && (
                            <button
                                onClick={handleAISummary}
                                disabled={isLoadingSummary}
                                className="w-full flex items-center justify-center py-2.5 px-3 border border-purple-200 dark:border-purple-900 hover:bg-purple-50 dark:hover:bg-purple-950/30 rounded bg-white dark:bg-black text-xs font-bold text-purple-600 dark:text-purple-400 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Sparkles className={`w-3 h-3 mr-2 ${isLoadingSummary ? 'animate-spin' : ''}`} />
                                {isLoadingSummary ? 'Generating Summary...' : 'AI Summary'}
                            </button>
                        )}

                        {/* Summary Result */}
                        {summaryError && (
                            <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded text-xs text-red-600 dark:text-red-400 flex items-start">
                                <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />
                                {summaryError}
                            </div>
                        )}

                        {summaryData && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                {/* Summary Text */}
                                <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800">
                                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center">
                                        <Sparkles className="w-3 h-3 mr-1.5 text-purple-500" />
                                        Analysis
                                    </h4>
                                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                                        {summaryData.summary}
                                    </p>
                                </div>

                                {/* Improvement Tip */}
                                {summaryData.improvement_tip && (
                                    <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded">
                                        <h4 className="text-[10px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-widest mb-1.5">
                                            Improvement Tip
                                        </h4>
                                        <p className="text-xs text-slate-700 dark:text-slate-300">
                                            {summaryData.improvement_tip}
                                        </p>
                                    </div>
                                )}

                                {/* Complexity & Dependencies */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800">
                                        <div className="text-[10px] text-slate-400 uppercase mb-1">Complexity</div>
                                        <div className="text-2xl font-bold text-black dark:text-white">
                                            {summaryData.complexity_score}
                                            <span className="text-xs font-normal text-slate-400 ml-1">/ 10</span>
                                        </div>
                                    </div>

                                    {summaryData.dependencies && summaryData.dependencies.length > 0 && (
                                        <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800">
                                            <div className="text-[10px] text-slate-400 uppercase mb-2">Dependencies</div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {summaryData.dependencies.slice(0, 3).map((dep, i) => (
                                                    <span key={i} className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 rounded text-[10px] font-medium text-slate-600 dark:text-slate-400">
                                                        {dep}
                                                    </span>
                                                ))}
                                                {summaryData.dependencies.length > 3 && (
                                                    <span className="px-1.5 py-0.5 text-[10px] text-slate-400">
                                                        +{summaryData.dependencies.length - 3}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}


                {/* Properties List */}
                <section>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center">
                        Properties
                    </h4>
                    <div className="space-y-3 bg-slate-50 dark:bg-slate-900 p-3 rounded border border-slate-100 dark:border-slate-800">
                        {properties && Object.entries(properties).map(([key, value]) => {
                            if (typeof value === 'object') return null; // Skip non-primitive for now
                            return (
                                <div key={key} className="flex flex-col border-b border-slate-200 dark:border-slate-800 last:border-0 pb-2 mb-2 last:mb-0 last:pb-0">
                                    <span className="text-[10px] uppercase text-slate-400 font-bold mb-1">{key}</span>
                                    <span className="text-xs text-black dark:text-white break-all font-medium">
                                        {String(value)}
                                    </span>
                                </div>
                            )
                        })}
                        {!properties && <div className="text-xs text-slate-400 italic">No properties found.</div>}
                    </div>
                </section>

                {/* LOC Stats (if available) */}
                {properties?.loc && (
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <div>
                            <div className="text-[10px] text-slate-400 uppercase mb-1">LOC</div>
                            <div className="text-2xl font-bold text-black dark:text-white">{properties.loc}</div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
