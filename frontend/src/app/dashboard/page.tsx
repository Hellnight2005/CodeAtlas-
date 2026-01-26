"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Plus, GitBranch, Github, ExternalLink, Loader2, LayoutGrid, List, SquareTerminal, Lock, Trash2, RotateCcw, Play, X } from "lucide-react";
import UserProfile from "@/components/UserProfile";
import RepoSearch from "@/components/RepoSearch";

interface Repo {
    repo_id: number;
    repo_name: string;
    repo_url: string;
    description?: string;
    language?: string;
    isPrivate: boolean;
    updated_at: string;
    owner: {
        login: string;
    };
    isSync?: boolean;
    isGraph?: boolean;
    isAst?: boolean;
    sync_status?: string;
    last_synced?: string;
    latest_commit?: string;
}

interface UserData {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    repos: Repo[];
    githubAccessToken?: string;
}

export default function DashboardPage() {
    const [user, setUser] = useState<UserData | null>(null);
    const [repos, setRepos] = useState<Repo[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const [analyzingRepoId, setAnalyzingRepoId] = useState<number | null>(null);
    const [outOfSyncRepos, setOutOfSyncRepos] = useState<string[]>([]);
    const [showAddModal, setShowAddModal] = useState(false);

    // ... (useEffect for fetchUser, active search logic, sync check remain same)

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const res = await fetch("/api/auth/me");
                if (res.ok) {
                    const data = await res.json();
                    if (data.authenticated) {
                        setUser(data.user);
                        setRepos(deduplicateRepos(data.user.repos || []));
                    } else {
                        window.location.href = "/auth/github";
                    }
                }
            } catch (err) {
                console.error("Failed to fetch dashboard data:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchUser();
    }, []);

    // Active Search Logic
    useEffect(() => {
        const fetchSearchResults = async () => {
            if (searchQuery.length < 3) {
                return;
            }

            try {
                const headers: any = { 'Content-Type': 'application/json' };
                if (user?.githubAccessToken) {
                    headers['Authorization'] = `token ${user.githubAccessToken}`;
                }

                const res = await fetch(`/api/github/search/user-repos?q=${encodeURIComponent(searchQuery)}`, {
                    headers: headers,
                    credentials: 'include'
                });
                if (res.ok) {
                    const data = await res.json();
                    const mappedRepos: Repo[] = data.results.map((r: any, index: number) => ({
                        repo_id: r.id || index,
                        repo_name: `${r.owner.login}/${r.name}`,
                        repo_url: r.html_url,
                        description: r.description,
                        language: r.language || undefined,
                        isPrivate: r.private,
                        updated_at: new Date().toISOString(),
                        owner: { login: r.owner.login },
                        isSync: r.isSync,
                        isGraph: r.isGraph,
                        isAst: r.isAst
                    }));
                    setRepos(deduplicateRepos(mappedRepos));
                }
            } catch (err) {
                console.error("Search failed", err);
            }
        };

        const timeoutId = setTimeout(() => {
            if (searchQuery.length >= 3) {
                fetchSearchResults();
            } else if (searchQuery.length === 0 && user) {
                setRepos(deduplicateRepos(user.repos));
            }
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [searchQuery, user]);



    const handleAnalyzeRepo = async (owner: string, repo: string, repoId: number) => {
        setAnalyzingRepoId(repoId);
        try {
            const res = await fetch(`/api/github/repo?owner=${owner}&repo=${repo}`);
            if (res.ok || res.status === 202) {
                window.location.href = `/dashboard/${owner}/${repo}`;
            } else {
                alert("Failed to start analysis. Check console.");
            }
        } catch (err) {
            console.error("Analysis failed:", err);
            alert("Error analyzing repository.");
        } finally {
            setAnalyzingRepoId(null);
        }
    };

    const handleGraphClick = async (owner: string, repo: string) => {
        window.location.href = `/dashboard/${owner}/${repo}`;
    };

    const handleDeleteRepo = async (repoId: number, repoName: string) => {
        if (!confirm(`Are you sure you want to completely remove ${repoName}? This will delete the Graph, AST, and File Tree.`)) return;
        try {
            // Call the cleanup route
            const res = await fetch("/api/repo/cleanup", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ repoName })
            });

            if (res.ok) {
                // Update UI state to remove the card
                setRepos(prev => prev.filter(r => r.repo_id !== repoId));
            } else {
                alert("Failed to delete repository");
            }
        } catch (err) {
            console.error("Delete failed:", err);
        }
    };

    const deduplicateRepos = (repoList: Repo[]) => {
        const seen = new Set();
        return repoList.filter(repo => {
            const id = repo.repo_id;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-black font-sans">
                <header className="sticky top-0 w-full z-50 bg-white/80 dark:bg-black/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
                    <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                            <div className="w-6 h-6 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                            <div className="h-6 w-24 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                        </div>
                    </div>
                </header>
                <main className="max-w-7xl mx-auto px-6 py-8">
                    <div className="w-full h-96 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                    </div>
                </main>
            </div>
        );
    }

    if (!user) return null;

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-black font-sans selection:bg-black selection:text-white dark:selection:bg-white dark:selection:text-black">
            {/* Navigation */}
            <header className="sticky top-0 w-full z-50 bg-white/80 dark:bg-black/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <Link href="/" className="flex items-center space-x-2">
                            <SquareTerminal className="w-6 h-6" />
                            <span className="font-bold tracking-tight text-lg hidden sm:block">CodeAtlas</span>
                        </Link>
                        <span className="text-slate-300 dark:text-slate-700 mx-2">/</span>
                        <div className="flex items-center space-x-2">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 flex items-center justify-center text-[10px] font-bold text-white">
                                {user.username[0].toUpperCase()}
                            </div>
                            <span className="text-sm font-medium">{user.username}</span>
                        </div>
                    </div>
                    <nav className="flex items-center gap-6">
                        <UserProfile />
                    </nav>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-6 py-8">
                {/* Actions Bar */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                    <div className="relative w-full sm:w-96">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search your repositories..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition-all"
                        />
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <div className="flex bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-1">
                            <button
                                onClick={() => setViewMode("grid")}
                                className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-slate-100 dark:bg-slate-800 text-black dark:text-white' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setViewMode("list")}
                                className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-slate-100 dark:bg-slate-800 text-black dark:text-white' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                <List className="w-4 h-4" />
                            </button>
                        </div>
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-black dark:bg-white text-white dark:text-black text-sm font-medium rounded-lg hover:translate-y-[-1px] transition-transform shadow-sm"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Add New</span>
                        </button>
                    </div>
                </div>

                {/* Repos Grid */}
                {repos.length > 0 ? (
                    <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "flex flex-col gap-3"}>
                        {repos.map((repo, index) => {
                            let repoOwner = "";
                            let repoName = "";

                            if (repo.repo_name && repo.repo_name.includes("/")) {
                                [repoOwner, repoName] = repo.repo_name.split("/");
                            } else {
                                repoOwner = user.username;
                                repoName = repo.repo_name;
                            }

                            const fullRepoName = `${repoOwner}/${repoName}`;
                            const isAnalyzing = analyzingRepoId === (repo.repo_id || index);

                            return (
                                <div
                                    key={repo.repo_id || index}
                                    className={`
                                        group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 hover:border-black dark:hover:border-white transition-colors shadow-sm relative
                                        ${viewMode === 'list' ? 'flex items-center justify-between' : 'flex flex-col justify-between h-40'}
                                    `}
                                >
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className={`p-1.5 rounded-full ${repo.isPrivate ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                                                    {repo.isPrivate ? <Lock className="w-3 h-3" /> : <GitBranch className="w-3.5 h-3.5" />}
                                                </div>
                                                <h3 className="font-bold text-sm text-slate-700 dark:text-slate-200 group-hover:text-black dark:group-hover:text-white transition-colors truncate max-w-[220px]" title={fullRepoName}>
                                                    {fullRepoName}
                                                </h3>
                                            </div>
                                            {/* Actions Buttons */}
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => handleAnalyzeRepo(repoOwner, repoName, repo.repo_id || index)}
                                                    disabled={!outOfSyncRepos.includes(repo.repo_name) || isAnalyzing}
                                                    className={`p-1.5 rounded-full transition-colors ${!outOfSyncRepos.includes(repo.repo_name)
                                                        ? "text-slate-300 dark:text-slate-700 cursor-not-allowed"
                                                        : "bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400"
                                                        }`}
                                                    title={!outOfSyncRepos.includes(repo.repo_name) ? "Repository is up to date" : "Sync with Origin"}
                                                >
                                                    <RotateCcw className={`w-4 h-4 ${isAnalyzing ? "animate-spin" : ""}`} />
                                                </button>

                                                <button
                                                    onClick={() => handleGraphClick(repoOwner, repoName)}
                                                    className={`p-1.5 rounded-full transition-colors ${repo.isGraph
                                                        ? "bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400"
                                                        : "text-slate-300 dark:text-slate-700 hover:text-slate-500"
                                                        }`}
                                                    title="View Graph"
                                                >
                                                    <Play className="w-4 h-4 fill-current" />
                                                </button>

                                                <button
                                                    onClick={() => handleDeleteRepo(repo.repo_id || index, fullRepoName)}
                                                    className="p-1.5 rounded-full bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 transition-colors"
                                                    title="Remove Repository"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                        {viewMode === 'grid' && (
                                            <p className="text-xs text-slate-500 line-clamp-2 mt-2 h-8">
                                                {repo.description || "No description provided."}
                                            </p>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between mt-auto pt-4 text-xs text-slate-400">
                                        <div className="flex items-center gap-3">
                                            {repo.language && (
                                                <div className="flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-full bg-yellow-400" />
                                                    <span>{repo.language}</span>
                                                </div>
                                            )}
                                            {repo.sync_status && (
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${repo.sync_status === 'done' || repo.sync_status === 'completed' ? 'bg-green-100 text-green-700' :
                                                        repo.sync_status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-gray-100'
                                                    }`}>
                                                    {repo.sync_status}
                                                </span>
                                            )}
                                            {repo.last_synced && (
                                                <span>{new Date(repo.last_synced).toLocaleDateString()}</span>
                                            )}
                                        </div>
                                        <span className="text-[10px] text-slate-400 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded-full">
                                            {repo.isPrivate ? 'Private' : 'Public'}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-20 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                        <div className="w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                            <GitBranch className="w-6 h-6 text-slate-400" />
                        </div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">No repositories found</h3>
                        <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">
                            Start typing in the search bar to find your GitHub repositories.
                        </p>
                    </div>
                )}
            </main>

            {/* ADD REPO MODAL */}
            {showAddModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-black w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-900 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Add Repository</h3>
                                <p className="text-xs text-slate-500">Search for a repository to import and visualize.</p>
                            </div>
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors text-slate-500 hover:text-black dark:hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-8 min-h-[300px] flex flex-col items-center justify-start">
                            <div className="w-full">
                                <RepoSearch />
                            </div>

                            <div className="mt-8 text-center text-xs text-slate-400 max-w-sm">
                                <p>Select a repository to automatically generate its AST and visualize the code structure.</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
