"use client";

import { useState } from "react"; // remove useEffect
import Link from "next/link";
import { Github, LogOut, ChevronDown, User, GitBranch } from "lucide-react";
import { useAuth } from "../context/AuthContext";

// ... interfaces ...

export default function UserProfile() {
    const { user, loading } = useAuth();
    const [isOpen, setIsOpen] = useState(false);

    // ... render logic ...

    if (loading) {
        return <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 animate-pulse" />;
    }

    // Not logged in -> Show Login Icon
    if (!user) {
        return (
            <Link
                href="/auth/github"
                className="hover:opacity-70 transition-opacity p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-900"
                title="Login with GitHub"
            >
                <Github className="w-5 h-5 text-black dark:text-white" />
            </Link>
        );
    }

    // Logged in -> Show Avatar + Dropdown
    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
                {user.avatarUrl ? (
                    <img
                        src={user.avatarUrl}
                        alt={user.username}
                        className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-800"
                    />
                ) : (
                    <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                        <User className="w-4 h-4 text-slate-500" />
                    </div>
                )}
                <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-black border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl z-50 p-2 animate-in fade-in zoom-in-95 duration-200">
                        {/* User Header */}
                        <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-900 mb-2">
                            <p className="text-sm font-bold text-black dark:text-white truncate">
                                {user.displayName}
                            </p>
                            <p className="text-xs text-slate-500 truncate">@{user.username}</p>
                        </div>

                        {/* Stats */}
                        <div className="px-3 py-2 flex items-center justify-between text-xs text-slate-500 mb-2">
                            <div className="flex items-center">
                                <GitBranch className="w-3.5 h-3.5 mr-1.5" />
                                <span>{user.repos?.length || 0} Repositories</span>
                            </div>
                        </div>

                        {/* Logout */}
                        <a
                            href="/auth/logout"
                            className="flex items-center w-full px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-md transition-colors"
                        >
                            <LogOut className="w-3.5 h-3.5 mr-2" />
                            Sign Out
                        </a>
                    </div>
                </>
            )}
        </div>
    );
}
