"use client";

import { X, FileText, ArrowRight, Share2, Code } from "lucide-react";

export default function DetailPanel({ node, details, onClose }: { node: any; details?: any; onClose: () => void }) {
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

                {/* Actions */}
                <div className="grid grid-cols-2 gap-3">
                    <button className="flex items-center justify-center py-2 px-3 border border-slate-200 dark:border-slate-800 hover:border-black dark:hover:border-white rounded bg-white dark:bg-black text-xs font-bold transition-all shadow-sm">
                        <Code className="w-3 h-3 mr-2" />
                        Code
                    </button>
                    <button className="flex items-center justify-center py-2 px-3 border border-slate-200 dark:border-slate-800 hover:border-black dark:hover:border-white rounded bg-white dark:bg-black text-xs font-bold transition-all shadow-sm">
                        <Share2 className="w-3 h-3 mr-2" />
                        Share
                    </button>
                </div>

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
