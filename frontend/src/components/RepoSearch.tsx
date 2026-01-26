"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Loader2, GitBranch, Lock, ArrowRight, Github } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";

interface Repo {
    id: number;
    name: string;
    owner: string;
    description?: string;
    private: boolean;
    language?: string;
    isSync?: boolean;
    isAst?: boolean;
    isGraph?: boolean;
}

export default function RepoSearch() {
    const { user } = useAuth();
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Repo[]>([]);
    const [loading, setLoading] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    // Debounce Logic
    useEffect(() => {
        const timeoutId = setTimeout(async () => {
            if (query.length < 2) {
                setResults([]);
                return;
            }

            setLoading(true);
            try {
                // Try searching user repos first
                const res = await fetch(`/api/github/search/user-repos?q=${encodeURIComponent(query)}`);

                if (res.status === 401) {
                    setResults([]);
                } else if (res.ok) {
                    const data = await res.json();

                    // Normalize data (Repo interface already defined above)
                    const normalized: Repo[] = (data.results || []).map((r: any) => ({
                        id: r.id,
                        name: r.name,
                        owner: r.owner.login || r.owner,
                        description: r.description,
                        private: r.private,
                        language: r.language,
                        isSync: r.isSync,
                        isAst: r.isAst,
                        isGraph: r.isGraph
                    }));
                    setResults(normalized);
                }
            } catch (error) {
                console.error("Search failed:", error);
            } finally {
                setLoading(false);
            }
        }, 300); // 300ms debounce

        return () => clearTimeout(timeoutId);
    }, [query]);

    // Click Outside to Close
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setShowResults(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = async (repo: Repo) => {
        setLoading(true);
        setShowResults(false);
        try {
            console.log(`[RepoSearch] Selecting ${repo.owner}/${repo.name}. Status: Sync=${repo.isSync}, AST=${repo.isAst}, Graph=${repo.isGraph}`);

            // 1. SMART CHECK: Pre-computed Graph Exists?
            if (repo.isGraph) {
                console.log("[RepoSearch] Graph JSON exists. Loading directly.");
                router.push(`/dashboard/${repo.owner}/${repo.name}`);
                return;
            }

            // 2. SMART CHECK: AST Generated?
            if (repo.isAst) {
                console.log("[RepoSearch] AST already generated. Proceeding.");
                router.push(`/dashboard/${repo.owner}/${repo.name}`);
                return;
            }

            // 3. SMART CHECK: Files Synced (isSync)?
            if (!repo.isSync) {
                console.log("[RepoSearch] Repo NOT synced. Triggering Sync.");
                const syncRes = await fetch(`/api/github/repo?owner=${repo.owner}&repo=${repo.name}`);
                if (!syncRes.ok) throw new Error(await syncRes.text());
            } else {
                console.log("[RepoSearch] Repo synced. Skipping file fetch.");
            }

            // 4. Trigger AST Generation
            console.log("[RepoSearch] Triggering AST Generation.");
            const astRes = await fetch("/api/repo/generate-ast", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ repoName: `${repo.owner}/${repo.name}`, force: true })
            });

            if (!astRes.ok) console.warn("AST trigger warning:", await astRes.text());

        } catch (error) {
            console.error("Initialization failed:", error);
        } finally {
            setLoading(false);
            router.push(`/dashboard/${repo.owner}/${repo.name}`);
        }
    };

    return (
        <div className="relative w-full max-w-lg mx-auto" ref={searchRef}>
            <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    {loading ? (
                        <Loader2 className="h-5 w-5 text-slate-400 animate-spin" />
                    ) : (
                        <Search className="h-5 w-5 text-slate-400 group-focus-within:text-black dark:group-focus-within:text-white transition-colors" />
                    )}
                </div>
                <input
                    type="text"
                    className="block w-full pl-10 pr-4 py-3 bg-white dark:bg-black border border-slate-200 dark:border-slate-800 rounded-lg text-sm bg-clip-padding backdrop-blur-xl shadow-sm focus:ring-2 focus:ring-black dark:focus:ring-white focus:border-transparent outline-none transition-all placeholder:text-slate-400 font-mono"
                    placeholder="Search your repositories (e.g. 'auth-service')..."
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setShowResults(true);
                    }}
                    onFocus={() => setShowResults(true)}
                    disabled={loading}
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <span className="text-xs text-slate-400 border border-slate-200 dark:border-slate-800 rounded px-1.5 py-0.5">⌘K</span>
                </div>
            </div>

            {/* Dropdown Results */}
            {showResults && (query.length >= 2 || !user) && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100">

                    {!user ? (
                        <div className="p-4 text-center">
                            <p className="text-sm text-slate-500 mb-3">Connect GitHub to search your private repositories.</p>
                            <Link
                                href="/auth/github"
                                className="inline-flex items-center px-4 py-2 bg-black dark:bg-white text-white dark:text-black text-xs font-bold rounded-md hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
                            >
                                <Github className="w-3 h-3 mr-2" />
                                Connect GitHub
                            </Link>
                        </div>
                    ) : results.length > 0 ? (
                        <ul className="divide-y divide-slate-100 dark:divide-slate-900 max-h-[300px] overflow-y-auto">
                            {results.map((repo) => (
                                <li
                                    key={repo.id}
                                    onClick={() => handleSelect(repo)}
                                    className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer group transition-colors flex items-center justify-between"
                                >
                                    <div className="flex items-center min-w-0">
                                        <div className={`p-2 rounded-full mr-3 ${repo.private ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
                                            {repo.private ? <Lock className="w-4 h-4" /> : <GitBranch className="w-4 h-4" />}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-slate-900 dark:text-white truncate group-hover:underline decoration-slate-400 underline-offset-2">
                                                {repo.owner}/{repo.name}
                                            </p>
                                            {repo.description && (
                                                <p className="text-xs text-slate-500 truncate mt-0.5 max-w-[250px]">
                                                    {repo.description}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center">
                                        {repo.language && (
                                            <span className="text-[10px] text-slate-400 mr-3 hidden sm:block">
                                                {repo.language}
                                            </span>
                                        )}
                                        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-black dark:group-hover:text-white transition-colors" />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="p-4 text-center text-sm text-slate-500">
                            {loading ? "Initializing..." : "No repositories found."}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
