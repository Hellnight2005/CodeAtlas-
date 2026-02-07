import { ArrowUpRight, BookOpen } from "lucide-react";
import { getHashnodeSeries, BlogPost } from "@/lib/hashnode";

export default async function JourneySection() {
    const postsRaw = await getHashnodeSeries("code-atlas");
    const posts = postsRaw ? [...postsRaw].reverse() : [];

    // Fallback if no posts are found yet
    if (!posts || posts.length === 0) {
        return (
            <section className="py-24 px-6 bg-white dark:bg-black border-t border-slate-100 dark:border-slate-800">
                <div className="max-w-7xl mx-auto text-center">
                    <h2 className="text-3xl md:text-5xl font-bold mb-4">Building CodeAtlas</h2>
                    <p className="text-slate-500">
                        Check out our engineering blog on Hashnode. Series coming soon!
                    </p>
                </div>
            </section>
        );
    }

    return (
        <section className="py-24 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 overflow-hidden">
            <div className="max-w-7xl mx-auto px-6">
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-6">
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-bold px-2 py-1 rounded-full flex items-center">
                                <BookOpen className="w-3 h-3 mr-1" />
                                Engineering Series
                            </span>
                            <span className="text-slate-400 text-xs font-mono">
                                {posts.length} Chapters
                            </span>
                        </div>
                        <h2 className="text-3xl md:text-5xl font-bold mb-4">The Journey</h2>
                        <p className="text-slate-500 max-w-lg">
                            We documented every step of building CodeAtlas. From idea to execution, dive into the technical challenges and decisions.
                        </p>
                    </div>
                    <div className="hidden md:block">
                        {/* Scroll hint or generic button */}
                        <a
                            href="https://projectlog.hashnode.dev/series/code-atlas"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-sm font-semibold hover:text-black dark:hover:text-white transition-colors"
                        >
                            View Full Series on Hashnode <ArrowUpRight className="w-4 h-4 ml-1" />
                        </a>
                    </div>
                </div>
            </div>

            {/* Horizontal Scroll Container */}
            <div className="relative w-full overflow-x-auto pb-12 hide-scrollbar">
                <div className="flex px-6 gap-6 w-max mx-auto md:mx-0 max-w-7xl">
                    {posts.map((post: BlogPost, index: number) => (
                        <a
                            key={index}
                            href={post.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group relative w-[300px] md:w-[350px] flex-shrink-0 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 transition-all hover:-translate-y-1 hover:shadow-xl flex flex-col overflow-hidden"
                        >
                            {/* Chapter Number Badge */}
                            <div className="absolute top-4 left-4 z-10 bg-black/50 backdrop-blur-md text-white text-[10px] font-mono px-2 py-1 rounded">
                                PART {posts.length - index}
                            </div>

                            {post.coverImage?.url ? (
                                <div className="h-48 overflow-hidden bg-slate-200 dark:bg-slate-800 relative">
                                    <img
                                        src={post.coverImage.url}
                                        alt={post.title}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                    />
                                </div>
                            ) : (
                                <div className="h-48 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 flex items-center justify-center">
                                    <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-600" />
                                </div>
                            )}

                            <div className="p-6 flex flex-col flex-grow">
                                <div className="text-xs text-slate-400 mb-2 font-mono">
                                    {new Date(post.publishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                </div>
                                <h3 className="text-xl font-bold mb-3 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                                    {post.title}
                                </h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-3 mb-4 flex-grow">
                                    {post.brief}
                                </p>

                                <div className="text-blue-600 dark:text-blue-400 text-sm font-medium flex items-center mt-auto">
                                    Read Chapter <ArrowUpRight className="w-3 h-3 ml-1 group-hover:translate-x-1 transition-transform" />
                                </div>
                            </div>
                        </a>
                    ))}

                    {/* "More" Card at the end */}
                    <a
                        href="https://projectlog.hashnode.dev/series/code-atlas"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group w-[200px] flex-shrink-0 bg-slate-100 dark:bg-slate-900/50 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all flex flex-col items-center justify-center text-center p-6 cursor-pointer"
                    >
                        <div className="w-12 h-12 rounded-full bg-white dark:bg-black flex items-center justify-center mb-4 shadow-sm group-hover:scale-110 transition-transform">
                            <ArrowUpRight className="w-6 h-6 text-slate-900 dark:text-white" />
                        </div>
                        <h3 className="font-bold text-slate-900 dark:text-white">Read All Chapters</h3>
                    </a>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 md:hidden mt-8 text-center">
                <a
                    href="https://projectlog.hashnode.dev/series/code-atlas"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-sm font-semibold hover:text-black dark:hover:text-white transition-colors"
                >
                    View Full Series on Hashnode <ArrowUpRight className="w-4 h-4 ml-1" />
                </a>
            </div>
        </section>
    );
}
