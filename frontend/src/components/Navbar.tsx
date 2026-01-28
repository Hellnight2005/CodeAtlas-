"use client";

import Link from "next/link";
import { SquareTerminal } from "lucide-react";
import UserProfile from "./UserProfile";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
    const { user, loading } = useAuth();

    return (
        <header className="fixed top-0 w-full z-50 bg-white/80 dark:bg-black/80 backdrop-blur-md border-b border-slate-100 dark:border-slate-900">
            <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                    <SquareTerminal className="w-6 h-6" />
                    <span className="font-bold tracking-tight text-lg">CodeAtlas</span>
                </div>
                <nav className="flex items-center gap-6">
                    {/* Conditionally render Dashboard link only if user is logged in */}
                    {user && !loading && (
                        <Link
                            href="/dashboard"
                            className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-black dark:hover:text-white transition-colors"
                        >
                            Dashboard
                        </Link>
                    )}
                    <UserProfile />
                </nav>
            </div>
        </header>
    );
}
