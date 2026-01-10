"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Github, ArrowRight, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

export default function RepoInputPage() {
    const router = useRouter();
    const [url, setUrl] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [status, setStatus] = useState<"idle" | "validating" | "processing" | "completed">("idle");

    const validateUrl = (input: string) => {
        if (!input) return false;
        // Allow direct repo name (alphanumeric/dashes/slashes) OR GitHub URL
        const regex = /^(https:\/\/github\.com\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_\-\.]+|[a-zA-Z0-9_\-\.\/]+)$/;
        return regex.test(input);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (!validateUrl(url)) {
            setError("Please enter a valid GitHub repository URL or Repository Name");
            return;
        }

        setIsLoading(true);
        setStatus("validating");

        try {
            let repoName = url;
            let owner = "local";
            let repo = url;

            if (url.includes("github.com/")) {
                const parts = url.split("github.com/")[1].split("/");
                owner = parts[0];
                repo = parts[1].replace(".git", ""); // Clean repo name
                repoName = `${owner}/${repo}`;
            } else {
                // Direct name case
                // Assume input is the full repo name as stored in DB
                repoName = url;
                // Try to split if possible, else fallback
                if (url.includes("/")) {
                    [owner, repo] = url.split("/");
                } else {
                    owner = "undefined"; // Special flag
                    repo = url;
                }
            }

            setStatus("processing");

            // Call Backend API
            const response = await fetch("http://localhost:5001/generate-ast", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ repoName, force: true }), // Force for dev demo
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to analyze repository");
            }

            setStatus("completed");

            // Wait a moment for visual confirmation before redirecting
            setTimeout(() => {
                router.push(`/dashboard/${owner}/${repo}`);
            }, 800);

        } catch (err: any) {
            console.error(err);
            setError(err.message || "Something went wrong. Is the backend running?");
            setIsLoading(false);
            setStatus("idle");
        }
    };

    return (
        <div className="min-h-screen bg-grid-pattern bg-white dark:bg-black flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-lg">
                {/* Header */}
                <div className="text-center mb-12">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-black dark:bg-white text-white dark:text-black rounded-xl mb-6 shadow-sharp">
                        <Github className="w-10 h-10" />
                    </div>
                    <h1 className="text-4xl font-mono font-bold text-black dark:text-white mb-3 tracking-tight">
                        CodeAtlas
                    </h1>
                    <p className="text-lg text-slate-500 font-medium">
                        Visualize your codebase.
                    </p>
                </div>

                {/* Card */}
                <div className="bg-white dark:bg-black border-sharp p-8 shadow-sharp relative overflow-hidden">
                    <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
                        <div>
                            <label htmlFor="repo-url" className="sr-only">Repository URL</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    id="repo-url"
                                    className={`block w-full px-4 py-4 bg-slate-50 dark:bg-slate-900 border-sharp ${error ? "border-red-500" : "border-slate-200 dark:border-slate-800 focus:border-black dark:focus:border-white"
                                        } text-black dark:text-white placeholder-slate-400 focus:outline-none transition-all font-mono text-sm`}
                                    placeholder="https://github.com/owner/repo"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    disabled={isLoading}
                                />
                            </div>
                            {error && (
                                <div className="mt-3 flex items-start text-red-500 text-xs font-mono">
                                    <AlertTriangle className="w-3.5 h-3.5 mr-1.5 mt-0.5 flex-shrink-0" />
                                    {error}
                                </div>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className={`w-full flex items-center justify-center py-4 px-6 border-sharp text-sm font-bold uppercase tracking-wider transition-all shadow-sharp ${isLoading
                                ? "bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-wait"
                                : "bg-black dark:bg-white text-white dark:text-black hover:bg-slate-800 dark:hover:bg-slate-200"
                                }`}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    Generate Graph
                                    <ArrowRight className="ml-2 w-4 h-4" />
                                </>
                            )}
                        </button>
                    </form>

                    {/* Status Overlay */}
                    {isLoading && (
                        <div className="mt-8 space-y-4 border-t border-dashed border-slate-200 dark:border-slate-800 pt-6">
                            <StatusItem label="Validating input..." status={status === 'validating' || status === 'processing' || status === 'completed' ? 'done' : 'waiting'} />
                            <StatusItem label="Parsing AST..." status={status === 'processing' || status === 'completed' ? 'done' : 'waiting'} />
                            <StatusItem label="Generating graph..." status={status === 'completed' ? 'done' : 'waiting'} />
                        </div>
                    )}
                </div>

                <div className="mt-8 text-center">
                    <p className="text-xs text-slate-400 font-mono">
                        Powered by Tree-sitter & Native Graph DB
                    </p>
                </div>
            </div>
        </div>
    );
}

function StatusItem({ label, status }: { label: string; status: 'waiting' | 'done' }) {
    return (
        <div className={`flex items-center space-x-3 transition-opacity duration-300 ${status === 'waiting' ? 'opacity-30' : 'opacity-100'}`}>
            {status === 'done' ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
                <div className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-700" />
            )}
            <span className="text-sm font-mono text-slate-600 dark:text-slate-300">{label}</span>
        </div>
    )
}
