"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Plus, GitBranch, Github, ExternalLink, Loader2, LayoutGrid, List, SquareTerminal, Lock } from "lucide-react";
import UserProfile from "@/components/UserProfile";

interface Repo {
    repo_id: number;
    repo_name: string;
    repo_url: string;
    description?: string;
    language?: string;
    isPrivate: boolean;
    updated_at: string;
    owner?: { login: string };
}

interface UserData {
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

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const res = await fetch("/api/auth/me");
                if (res.ok) {
                    const data = await res.json();
                    if (data.authenticated) {
                        setUser(data.user);
                        setRepos(data.user.repos || []);
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
                // If search cleared, revert to user's saved repos? 
                // Or just keep showing filtered list of active repos. 
                // For now, if query < 3, we show user's saved repos (if we saved them separately).
                // But simpler: just filter current user.repos if query is short, 
                // or don't trigger API. 
                // User asked: "after every three word it run the api"
                return;
            }

            try {
                // Call /api/github/search/user-repos?q={query}
                console.log("Fetching search results for:", searchQuery);
                console.log("User:", user);
                console.log("User Access Token:", user?.githubAccessToken);
                const headers: any = { 'Content-Type': 'application/json' };
                if (user?.githubAccessToken) {
                    headers['Authorization'] = `token ${user.githubAccessToken}`;
                }

                const res = await fetch(`/api/github/search/user-repos?q=${encodeURIComponent(searchQuery)}`, {
                    headers: headers,
                    credentials: 'include' // Ensure cookies are sent
                });
                if (res.ok) {
                    const data = await res.json();
                    // Map response to Repo interface
                    // API returns { count, results: [...] }
                    // results: { name, owner, description, visibility, private, ... }
                    // We need to map this to our Repo interface (repo_id, repo_name, etc.)
                    // Note: GitHub API "id" field? getUserRepos controller returns simplified object. 
                    // Let's check controller output in previous step. 
                    // Controller returns: name, owner, description, visibility, private, fork, size, stars, html_url, clone_url. 
                    // MISSING ID in controller active search! 
                    // We might need to use index or name as key. 

                    const mappedRepos: Repo[] = data.results.map((r: any, index: number) => ({
                        repo_id: r.id || index, // Fallback if ID missing
                        repo_name: `${r.owner.login}/${r.name}`,
                        repo_url: r.html_url,
                        description: r.description,
                        language: r.language || undefined, // Controller might not return language? Checked: it does NOT. Logic update needed? 
                        // Controller filtered fields: name, owner, description, visibility, private, fork, size, stars, html_url, clone_url
                        isPrivate: r.private,
                        updated_at: new Date().toISOString(), // Placeholder
                        owner: { login: r.owner.login }
                    }));
                    setRepos(mappedRepos);
                }
            } catch (err) {
                console.error("Search failed", err);
            }
        };

        const timeoutId = setTimeout(() => {
            if (searchQuery.length >= 3) {
                fetchSearchResults();
            } else if (searchQuery.length === 0 && user) {
                // Restore original list
                setRepos(user.repos);
            }
        }, 500); // Debounce 500ms

        return () => clearTimeout(timeoutId);
    }, [searchQuery, user]);

    const handleAnalyzeRepo = async (owner: string, repo: string, repoId: number) => {
        setAnalyzingRepoId(repoId);
        try {
            // Call /repo endpoint to start analysis
            const res = await fetch(`/api/github/repo?owner=${owner}&repo=${repo}`);
            if (res.ok || res.status === 202) {
                // Navigate to dashboard view
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


    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
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
                        <Link
                            href="/repo"
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-black dark:bg-white text-white dark:text-black text-sm font-medium rounded-lg hover:translate-y-[-1px] transition-transform shadow-sm"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Add New</span>
                        </Link>
                    </div>
                </div>

                {/* Repos Grid */}
                {repos.length > 0 ? (
                    <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "flex flex-col gap-3"}>
                        {repos.map((repo, index) => {
                            // Correctly handle repo name formats
                            // API returns "owner" separately, user.repos has "repo_name"
                            // We construct full name for consistent display
                            let repoOwner = "";
                            let repoName = "";

                            if (repo.owner && typeof repo.owner === 'object' && repo.owner.login) {
                                repoOwner = repo.owner.login;
                                // If repo.repo_name is full "owner/name", clean it.
                                // If it is just name, use it.
                                repoName = repo.repo_name.includes('/') ? repo.repo_name.split('/')[1] : repo.repo_name;
                            } else if (repo.repo_name && repo.repo_name.includes("/")) {
                                [repoOwner, repoName] = repo.repo_name.split("/");
                            } else {
                                // Fallback: try to assume auth user is owner if no slash
                                // But search results usually have owner object. 
                                // DB results usually have "owner/name" string. 
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
                                                <h3 className="font-bold text-sm text-slate-700 dark:text-slate-200 group-hover:text-black dark:group-hover:text-white transition-colors truncate max-w-[150px]" title={fullRepoName}>
                                                    {fullRepoName}
                                                </h3>
                                            </div>
                                            {/* Action Button: Analyze / Go */}
                                            <button
                                                onClick={() => handleAnalyzeRepo(repoOwner, repoName, repo.repo_id || index)}
                                                disabled={isAnalyzing}
                                                className="p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"
                                                title="Analyze and Map"
                                            >
                                                {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                                            </button>
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
                                            <span>{viewMode === 'grid' ? 'Updated recently' : ''}</span>
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
                        {/* Empty State ... */}
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
        </div>
    );
}
