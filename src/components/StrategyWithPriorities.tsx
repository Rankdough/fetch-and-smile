import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Star } from "lucide-react";
import type { ReactNode } from "react";
import { useRef } from "react";

interface Props {
  content: string;
  prioritizedPoints: string[];
  lockedPrinciples?: string[];
  lockedTactics?: string[];
  onTogglePriority: (bulletText: string, section: string) => void;
}

function normalizeBullet(line: string): string {
  return line.replace(/^[\s*\-•]+/, "").trim();
}

function extractText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node && typeof node === "object" && "props" in node) {
    return extractText((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return "";
}

export function StrategyWithPriorities({
  content,
  prioritizedPoints,
  lockedPrinciples = [],
  lockedTactics = [],
  onTogglePriority,
}: Props) {
  const currentSectionRef = useRef("");

  return (
    <div className="prose prose-sm max-w-none dark:prose-invert [&_strong]:text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children }) => {
            const text = extractText(children);
            currentSectionRef.current = text;
            return <h2>{children}</h2>;
          },
          li: ({ children }) => {
            const bulletText = normalizeBullet(extractText(children));
            const section = currentSectionRef.current;
            const isCoreSection = section === "Core Principles" || section === "Core Tactics";

            const lockedList =
              section === "Core Principles"
                ? lockedPrinciples
                : section === "Core Tactics"
                  ? lockedTactics
                  : [];

            const isLocked = lockedList.some((point) => normalizeBullet(point) === bulletText);
            const isPrioritized = !isCoreSection && prioritizedPoints.some(
              (point) => normalizeBullet(point) === bulletText,
            );
            const isHighlighted = isLocked || isPrioritized;

            return (
              <li className={`rounded-md transition-colors ${isHighlighted ? "bg-accent/40 px-2 py-1" : ""}`}>
                <div className="flex items-start gap-2">
                  {isCoreSection && (
                    <button
                      type="button"
                      aria-label={isLocked ? "Remove bookmark" : "Bookmark item"}
                      className="mt-0.5 shrink-0 rounded-sm text-muted-foreground transition-colors hover:text-primary"
                      onClick={() => onTogglePriority(bulletText, section)}
                    >
                      <Star className={`h-4 w-4 ${isLocked ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                    </button>
                  )}
                  <div className="min-w-0 flex-1">{children}</div>
                </div>
              </li>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
