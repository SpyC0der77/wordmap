"use client";

import type { GraphNode, GraphLink } from "@/types/graph";

export interface NodeDetailProps {
  node: GraphNode | null;
  links: GraphLink[];
  onClose: () => void;
}

export function NodeDetail({ node, links, onClose }: NodeDetailProps) {
  if (!node) return null;

  const connectedWords = links
    .filter((l) => l.source === node.id || l.target === node.id)
    .map((l) => (l.source === node.id ? l.target : l.source))
    .filter((w, i, arr) => arr.indexOf(w) === i)
    .slice(0, 20);

  return (
    <aside className="absolute right-0 top-0 z-40 h-full w-80 overflow-auto border-l border-zinc-200 bg-white/95 shadow-xl backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95">
      <div className="sticky top-0 flex items-center justify-between border-b border-zinc-200 bg-white/95 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/95">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {node.id}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
          aria-label="Close"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
      <div className="space-y-4 p-4">
        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Part of speech
          </span>
          <p className="mt-1 text-zinc-900 dark:text-zinc-100">{node.pos}</p>
        </div>
        {node.definitions && node.definitions.length > 0 && (
          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Definitions
            </span>
            <ul className="mt-1 space-y-2">
              {node.definitions.slice(0, 3).map((def, i) => (
                <li
                  key={i}
                  className="text-sm text-zinc-700 dark:text-zinc-300"
                >
                  {def}
                </li>
              ))}
            </ul>
          </div>
        )}
        {connectedWords.length > 0 && (
          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Related words
            </span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {connectedWords.map((w) => (
                <span
                  key={w}
                  className="rounded bg-zinc-100 px-2 py-0.5 text-sm text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
                >
                  {w}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
