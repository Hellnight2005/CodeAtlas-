"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface UserProfile {
    githubId: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    repos: any[];
}

interface AuthContextType {
    user: UserProfile | null;
    loading: boolean;
    checkSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    const checkSession = async () => {
        try {
            // Check session via backend proxy
            const res = await fetch("/api/auth/me");
            if (res.ok) {
                const data = await res.json();
                if (data.authenticated) {
                    setUser(data.user);
                } else {
                    setUser(null);
                }
            } else {
                setUser(null);
            }
        } catch (error) {
            console.error("Session check failed:", error);
            setUser(null);
        } finally {
            setLoading(false);
        }
    };

    // Auto-check on mount (Page Reload)
    useEffect(() => {
        checkSession();
    }, []);

    return (
        <AuthContext.Provider value={{ user, loading, checkSession }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
