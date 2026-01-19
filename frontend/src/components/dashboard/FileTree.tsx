"use client";

import {
    Folder,
    File,
    FileCode,
    FileJson,
    FileType,
    ChevronRight,
    ChevronDown,
    Image as ImageIcon
} from "lucide-react";
import { useState, useEffect } from "react";

// The backend returns a structure where:
// Files: { type: "file", path: "...", ... }
// Folders: { "childName": { ... }, ... } (No explicit type property)
type FileTreeNodeType = {
    type?: "file";
    path?: string;
    [key: string]: any;
};

interface FileTreeProps {
    data: Record<string, FileTreeNodeType>;
    onFileClick: (path: string) => void;
    selectedPath?: string | null;
    level?: number;
    parentPath?: string;
}

const getFileIcon = (fileName: string) => {
    if (fileName.endsWith(".js") || fileName.endsWith(".jsx")) return <FileCode className="w-3.5 h-3.5 text-yellow-400" />;
    if (fileName.endsWith(".ts") || fileName.endsWith(".tsx")) return <FileCode className="w-3.5 h-3.5 text-blue-400" />;
    if (fileName.endsWith(".css") || fileName.endsWith(".scss")) return <FileType className="w-3.5 h-3.5 text-sky-300" />;
    if (fileName.endsWith(".json")) return <FileJson className="w-3.5 h-3.5 text-yellow-200" />;
    if (fileName.endsWith(".md")) return <File className="w-3.5 h-3.5 text-slate-400" />;
    if (fileName.match(/\.(jpg|jpeg|png|gif|svg)$/)) return <ImageIcon className="w-3.5 h-3.5 text-purple-400" />;
    return <File className="w-3.5 h-3.5 text-slate-500" />;
};

const FileTreeNode = ({
    name,
    node,
    onFileClick,
    selectedPath,
    level,
    fullPath
}: {
    name: string;
    node: FileTreeNodeType;
    onFileClick: (path: string) => void;
    selectedPath?: string | null;
    level: number;
    fullPath: string;
}) => {
    const isFile = node.type === "file";
    const [isOpen, setIsOpen] = useState(false);

    // Auto-expand if the selected path starts with this folder's path
    useEffect(() => {
        if (!isFile && selectedPath) {
            // Check if selectedPath (e.g. "src/components/Header.tsx") starts with fullPath (e.g. "src/components")
            // Add a slash to ensure minimal false positives (e.g. "test-utils" vs "test")
            if (selectedPath.startsWith(fullPath + "/")) {
                setIsOpen(true);
            }
        }
    }, [selectedPath, fullPath, isFile]);

    const isSelected = isFile && selectedPath === node.path;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isFile) {
            setIsOpen(!isOpen);
        } else {
            if (node.path) {
                onFileClick(node.path);
            }
        }
    };

    return (
        <li>
            <div
                className={`
                    flex items-center py-1 px-2 rounded-sm cursor-pointer transition-colors text-xs font-mono select-none
                    ${isSelected
                        ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 border-l-2 border-blue-500"
                        : "hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border-l-2 border-transparent"
                    }
                `}
                style={{ paddingLeft: `${level * 12 + 4}px` }}
                onClick={handleClick}
            >
                <div className="mr-1.5 flex-shrink-0">
                    {!isFile ? (
                        <div className="flex items-center">
                            {isOpen ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
                            <Folder className={`w-3.5 h-3.5 ml-1 ${isOpen ? "text-blue-400" : "text-blue-300"} fill-current`} />
                        </div>
                    ) : (
                        <div className="ml-4">
                            {getFileIcon(name)}
                        </div>
                    )}
                </div>
                <span className="truncate">{name}</span>
            </div>

            {/* Render children for folders */}
            {!isFile && isOpen && (
                <ul className="space-y-0.5 mt-0.5">
                    {Object.entries(node).map(([childName, childNode]) => (
                        <FileTreeNode
                            key={childName}
                            name={childName}
                            node={childNode as FileTreeNodeType}
                            onFileClick={onFileClick}
                            selectedPath={selectedPath}
                            level={level + 1}
                            fullPath={`${fullPath}/${childName}`}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
};

export default function FileTree({ data, onFileClick, selectedPath, level = 0, parentPath = "" }: FileTreeProps) {
    return (
        <ul className="space-y-0.5">
            {Object.entries(data).map(([name, node]) => {
                // Determine current path for this node to help with auto-expansion keys
                // Verify if this is a top level call or recursive
                // Ideally we use the keys to build the path? 
                // Wait, if "src" is a key, the path is "src".
                // If data is root, parentPath is empty.
                const currentPath = parentPath ? `${parentPath}/${name}` : name;

                return (
                    <FileTreeNode
                        key={name}
                        name={name}
                        node={node}
                        onFileClick={onFileClick}
                        selectedPath={selectedPath}
                        level={level}
                        fullPath={currentPath}
                    />
                );
            })}
        </ul>
    );
}
