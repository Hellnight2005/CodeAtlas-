"use client";

import Link from "next/link";
import { ArrowRight, Github, SquareTerminal } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-white dark:bg-black font-sans selection:bg-black selection:text-white dark:selection:bg-white dark:selection:text-black">
      {/* Navigation */}
      <header className="fixed top-0 w-full z-50 bg-white/80 dark:bg-black/80 backdrop-blur-md border-b border-slate-100 dark:border-slate-900">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <SquareTerminal className="w-6 h-6" />
            <span className="font-bold tracking-tight text-lg">CodeAtlas</span>
          </div>
          <nav className="flex items-center gap-6">
            <Link href="https://github.com" className="hover:opacity-70 transition-opacity">
              <Github className="w-5 h-5" />
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="pt-32 pb-16 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center px-3 py-1 rounded-full border border-slate-200 dark:border-slate-800 text-xs font-mono mb-8 bg-slate-50 dark:bg-slate-900">
            v1.0.0 Public Beta
          </div>

          <h1 className="text-6xl md:text-8xl font-bold tracking-tighter mb-8 text-balance">
            Diagram your code. <br />
            <span className="text-slate-400">Instantly.</span>
          </h1>

          <p className="max-w-2xl mx-auto text-xl text-slate-500 mb-12">
            Turn complex repositories into clean, interactive maps.
            No manual dragging. Just pure AST-based visualization.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
            <Link
              href="/repo"
              className="px-8 py-4 bg-black dark:bg-white text-white dark:text-black font-bold rounded-lg shadow-lg hover:translate-y-[-2px] transition-transform flex items-center gap-2"
            >
              Start Mapping <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/demo"
              className="px-8 py-4 bg-slate-100 dark:bg-slate-900 text-black dark:text-white font-bold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            >
              View Demo
            </Link>
          </div>

          {/* Hero Visual */}
          <div className="max-w-5xl mx-auto bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-2 shadow-2xl">
            <div className="aspect-[16/10] rounded-lg bg-grid-pattern overflow-hidden bg-white dark:bg-black relative group">
              {/* Abstract Graph Representation */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-32 h-32 bg-white dark:bg-black border-2 border-black dark:border-white shadow-sharp flex items-center justify-center z-10">
                  <span className="font-mono font-bold">Main</span>
                </div>

                <div className="absolute top-1/4 left-1/4 w-24 h-24 bg-white dark:bg-black border border-slate-300 dark:border-slate-700 shadow-sm flex items-center justify-center">
                  <span className="font-mono text-xs text-slate-500">Utils</span>
                </div>
                <div className="absolute bottom-1/3 right-1/4 w-28 h-28 bg-white dark:bg-black border border-slate-300 dark:border-slate-700 shadow-sm flex items-center justify-center">
                  <span className="font-mono text-xs text-slate-500">Components</span>
                </div>

                {/* Lines */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none stroke-slate-300 dark:stroke-slate-700" style={{ strokeWidth: 1 }}>
                  <line x1="35%" y1="35%" x2="45%" y2="45%" />
                  <line x1="55%" y1="55%" x2="65%" y2="60%" />
                </svg>
              </div>

              <div className="absolute text-xs bottom-4 right-4 text-slate-400 font-mono">
                Generated in 1.2s
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
