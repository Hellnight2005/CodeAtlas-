import { Github, Mail, Twitter } from "lucide-react";

export default function ContactSection() {
    return (
        <section className="py-24 px-6 bg-slate-50 dark:bg-black/50 border-t border-slate-200 dark:border-slate-800">
            <div className="max-w-4xl mx-auto text-center">
                <h2 className="text-3xl md:text-4xl font-bold mb-6">
                    Ready to map your world?
                </h2>
                <p className="text-lg text-slate-500 mb-10 max-w-xl mx-auto">
                    CodeAtlas is open source and evolving. Join the community, suggest features, or just say hi.
                </p>

                <div className="flex flex-wrap justify-center gap-4">
                    <a
                        href="https://github.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-6 py-3 bg-black dark:bg-white text-white dark:text-black rounded-full font-medium hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
                    >
                        <Github className="w-5 h-5 mr-2" />
                        Star on GitHub
                    </a>

                    <a
                        href="mailto:contact@codeatlas.dev"
                        className="inline-flex items-center px-6 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                        <Mail className="w-5 h-5 mr-2" />
                        Get in Touch
                    </a>
                </div>
            </div>
        </section>
    );
}
