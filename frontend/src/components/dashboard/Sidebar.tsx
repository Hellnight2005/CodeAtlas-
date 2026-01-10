"use client";

import { Folder, FileCode, Search, GitBranch } from "lucide-react";

export default function Sidebar({ owner, repo }: { owner: string; repo: string }) {
    // Mock file tree data (Pending real API integration)
    const files = [
        {
            name: "src", type: "folder", children: [
                {
                    name: "components", type: "folder", children: [
                        { name: "Header.tsx", type: "file" },
                        { name: "Footer.tsx", type: "file" }
                    ]
                },
                {
                    name: "utils", type: "folder", children: [
                        { name: "api.ts", type: "file" }
                    ]
                },
                { name: "index.ts", type: "file" }
            ]
        },
        { name: "package.json", type: "file" },
        { name: "README.md", type: "file" }
    ];

    return (
        <div className="flex flex-col h-full bg-slate-50/50 dark:bg-black">
            {/* Header */}
            <div className="p-4 border-b border-sharp bg-white dark:bg-black">
                <h2 className="text-sm font-mono font-bold text-black dark:text-white flex items-center mb-3">
                    <GitBranch className="w-4 h-4 mr-2" />
                    {owner}/{repo}
                </h2>
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search..."
                        className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-xs font-mono focus:ring-1 focus:ring-black dark:focus:ring-white outline-none transition-all"
                    />
                </div>
            </div>

            {/* File Tree */}
            <div className="flex-1 overflow-y-auto p-2">
                <FileTree items={files} />
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-sharp bg-white dark:bg-black text-[10px] text-slate-400 font-mono text-center">
                CodeAtlas v1.0
            </div>
        </div>
    );
}

const FileTree = ({ items, level = 0 }: { items: any[]; level?: number }) => {
    return (
        <ul className="space-y-0.5">
            {items.map((item, idx) => (
                <li key={idx}>
                    <div
                        className="flex items-center py-1 px-2 rounded-sm hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer text-slate-700 dark:text-slate-300 text-xs font-mono transition-colors"
                        style={{ paddingLeft: `${(level + 1) * 12}px` }}
                    >
                        {item.type === "folder" ? (
                            <Folder className="w-3.5 h-3.5 mr-2 text-slate-400 fill-slate-200 dark:fill-slate-800" />
                        ) : (
                            <FileCode className="w-3.5 h-3.5 mr-2 text-slate-400" />
                        )}
                        <span className="truncate">{item.name}</span>
                    </div>
                    {item.children && (
                        <FileTree items={item.children} level={level + 1} />
                    )}
                </li>
            ))}
        </ul>
    );
};
