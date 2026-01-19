"use client";

import { useState, useEffect } from "react";
import { Search, GitBranch, AlertCircle, Loader2, X, FileText } from "lucide-react";
import FileTree from "./FileTree";

interface SidebarProps {
    owner: string;
    repo: string;
    selectedFile?: string | null;
    onFileSelect?: (path: string) => void;
}

export default function Sidebar({ owner, repo, selectedFile, onFileSelect }: SidebarProps) {
    const [fileData, setFileData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Search State
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<any[] | null>(null);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        const fetchFileTree = async () => {
            // If direct repo name (owner="undefined"), just use repo
            // But usually url is /dashboard/Owner/Repo
            // If Owner is "undefined" string (from params), handle it.
            const repoName = owner === "undefined" ? repo : ((owner && repo) ? `${owner}/${repo}` : repo);

            if (!repoName) return;

            try {
                setLoading(true);
                // Use relative path to leverage Next.js proxy
                const res = await fetch(`/api/repo/tree?repo=${repoName}`, { credentials: 'include' });
                if (!res.ok) throw new Error("Failed to load file tree");

                const data = await res.json();
                setFileData(data);
                setLoading(false);
            } catch (err) {
                console.error(err);
                setError("Could not load files");
                setLoading(false);
            }
        };

        fetchFileTree();
    }, [owner, repo]);

    const handleSearch = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            if (!searchQuery.trim()) {
                setSearchResults(null);
                return;
            }

            setIsSearching(true);
            try {
                const repoName = owner === "undefined" ? repo : ((owner && repo) ? `${owner}/${repo}` : repo);
                const res = await fetch(`/api/graph/search?repo=${repoName}&q=${encodeURIComponent(searchQuery)}`, {
                    credentials: 'include'
                });
                if (res.ok) {
                    const results = await res.json();
                    setSearchResults(results);
                }
            } catch (err) {
                console.error("Search failed:", err);
            } finally {
                setIsSearching(false);
            }
        }
    };

    const clearSearch = () => {
        setSearchQuery("");
        setSearchResults(null);
    };

    const handleFileClick = (path: string) => {
        if (onFileSelect) {
            onFileSelect(path);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50/50 dark:bg-black">
            {/* Header */}
            <div className="p-4 border-b border-sharp bg-white dark:bg-black">
                <h2 className="text-sm font-mono font-bold text-black dark:text-white flex items-center mb-3">
                    <GitBranch className="w-4 h-4 mr-2" />
                    <span className="truncate" title={`${owner}/${repo}`}>{owner === "undefined" ? repo : `${owner}/${repo}`}</span>
                </h2>
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search files..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={handleSearch}
                        className="w-full pl-8 pr-8 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-xs font-mono focus:ring-1 focus:ring-black dark:focus:ring-white outline-none transition-all"
                    />
                    {searchQuery && (
                        <button
                            onClick={clearSearch}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full text-slate-400"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    )}
                </div>
            </div>

            {/* File Tree or Search Results */}
            <div className="flex-1 overflow-y-auto p-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                {isSearching ? (
                    <div className="flex items-center justify-center h-20">
                        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                    </div>
                ) : searchResults ? (
                    // Search Results View
                    <div className="space-y-1">
                        <div className="px-2 py-1 text-[10px] text-slate-400 font-mono uppercase tracking-widest mb-2">
                            {searchResults.length} results
                        </div>
                        {searchResults.length === 0 ? (
                            <div className="text-center text-slate-400 text-xs mt-4">No matches found</div>
                        ) : (
                            searchResults.map((file) => (
                                <div
                                    key={file.id}
                                    onClick={() => handleFileClick(file.path)}
                                    className="flex flex-col py-1.5 px-2 rounded-sm cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-800 group"
                                >
                                    <div className="flex items-center text-xs font-medium text-black dark:text-white">
                                        <FileText className="w-3.5 h-3.5 mr-2 text-slate-500 group-hover:text-blue-500" />
                                        {file.name}
                                    </div>
                                    <div className="text-[10px] text-slate-400 ml-5 truncate">
                                        {file.path}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                ) : loading ? (
                    <div className="flex items-center justify-center h-20">
                        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-20 text-slate-400 text-xs">
                        <AlertCircle className="w-4 h-4 mb-1" />
                        {error}
                    </div>
                ) : fileData ? (
                    <FileTree
                        data={fileData}
                        onFileClick={handleFileClick}
                        selectedPath={selectedFile}
                    />
                ) : (
                    <div className="text-center text-slate-400 text-xs mt-4">No files found</div>
                )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-sharp bg-white dark:bg-black text-[10px] text-slate-400 font-mono text-center">
                CodeAtlas v1.0
            </div>
        </div>
    );
}
