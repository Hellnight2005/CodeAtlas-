import { Zap, Map, FileCode } from "lucide-react";

export default function AboutSection() {
    return (
        <section className="py-24 px-6 bg-slate-50 dark:bg-black/50">
            <div className="max-w-7xl mx-auto">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-5xl font-bold mb-6">
                        Understand your codebase in seconds.
                    </h2>
                    <p className="text-xl text-slate-500 max-w-2xl mx-auto">
                        CodeAtlas bridges the gap between static code and mental models.
                        Stop guessing how files connect. See it.
                    </p>
                </div>

                <div className="grid md:grid-cols-3 gap-8">
                    <div className="bg-white dark:bg-slate-900/50 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                        <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mb-6 text-blue-600 dark:text-blue-400">
                            <Map className="w-6 h-6" />
                        </div>
                        <h3 className="text-xl font-semibold mb-3">Visual Maps</h3>
                        <p className="text-slate-500">
                            Instantly generate interactive dependency graphs. Zoom, pan, and explore relationships between files and components.
                        </p>
                    </div>

                    <div className="bg-white dark:bg-slate-900/50 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                        <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center mb-6 text-purple-600 dark:text-purple-400">
                            <Zap className="w-6 h-6" />
                        </div>
                        <h3 className="text-xl font-semibold mb-3">Real-time Sync</h3>
                        <p className="text-slate-500">
                            Powered by Kafka and efficient parsing, your repository changes are reflected in the graph almost immediately.
                        </p>
                    </div>

                    <div className="bg-white dark:bg-slate-900/50 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                        <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center mb-6 text-emerald-600 dark:text-emerald-400">
                            <FileCode className="w-6 h-6" />
                        </div>
                        <h3 className="text-xl font-semibold mb-3">AST Precision</h3>
                        <p className="text-slate-500">
                            We don't just regex your code. We build Abstract Syntax Trees to understand the true structure of your logic.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}
