import React from "react";
import { Network, Database, Cpu } from "lucide-react";

export default function GraphLoadingState({ message }: { message?: string }) {
    return (
        <div className="h-screen w-full flex flex-col items-center justify-center bg-white dark:bg-black overflow-hidden relative">
            <div className="relative w-64 h-64 flex items-center justify-center">
                {/* Outer Ring - Rotating */}
                <div className="absolute inset-0 rounded-full border-t-2 border-b-2 border-slate-200 dark:border-slate-800 animate-spin-slow opacity-50" suppressHydrationWarning />

                {/* Middle Ring - Reverse Rotating */}
                <div className="absolute inset-8 rounded-full border-r-2 border-l-2 border-blue-500/30 animate-spin-reverse-slow" suppressHydrationWarning />

                {/* Inner pulsing core */}
                <div className="relative z-10 flex flex-col items-center justify-center">
                    <div className="w-16 h-16 bg-blue-500/10 dark:bg-blue-500/20 rounded-xl rotate-45 flex items-center justify-center backdrop-blur-sm border border-blue-500/50 shadow-[0_0_30px_rgba(59,130,246,0.2)] animate-pulse">
                        <Network className="w-8 h-8 text-blue-600 dark:text-blue-400 -rotate-45" />
                    </div>
                </div>

                {/* Orbiting particles */}
                <div className="absolute inset-0 animate-spin-slow" suppressHydrationWarning>
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-3 bg-blue-500 w-2 h-2 rounded-full shadow-[0_0_10px_#3b82f6]" suppressHydrationWarning />
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-3 bg-purple-500 w-2 h-2 rounded-full shadow-[0_0_10px_#a855f7]" suppressHydrationWarning />
                </div>
                <div className="absolute inset-12 animate-spin-reverse-slower" suppressHydrationWarning>
                    <div className="absolute left-0 top-1/2 -translate-x-3 -translate-y-1/2 bg-green-500 w-2 h-2 rounded-full shadow-[0_0_10px_#22c55e]" suppressHydrationWarning />
                    <div className="absolute right-0 top-1/2 translate-x-3 -translate-y-1/2 bg-orange-500 w-2 h-2 rounded-full shadow-[0_0_10px_#f97316]" suppressHydrationWarning />
                </div>

                {/* Connection lines effect (SVG overlay) */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20 dark:opacity-30">
                    <circle cx="50%" cy="50%" r="40%" fill="none" stroke="currentColor" strokeDasharray="4 4" className="text-slate-400 dark:text-slate-600 animate-ping-slow" />
                </svg>
            </div>

            {/* Text Content */}
            <div className="mt-12 text-center space-y-2 z-10">
                <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400">
                    {message || "Constructing Knowledge Graph"}
                </h2>
                <div className="flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400 font-mono">
                    <span className="flex items-center gap-1">
                        <Database className="w-3 h-3" /> Fetching Nodes
                    </span>
                    <span className="w-1 h-1 bg-slate-400 rounded-full" />
                    <span className="flex items-center gap-1">
                        <Cpu className="w-3 h-3" /> Analyzing Relationships
                    </span>
                </div>
            </div>
        </div>
    );
}
