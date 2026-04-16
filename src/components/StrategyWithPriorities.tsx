import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Lock, Star } from "lucide-react";
import type { ReactNode } from "react";

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
  let currentSection = "";

  return (
    <div className="prose prose-sm max-w-none dark:prose-invert [&_strong]:text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children }) => {
            const text = extractText(children);
            currentSection = text;
            return <h2>{children}</h2>;
          },
          li: ({ children }) => {
            const bulletText = normalizeBullet(extractText(children));

            // Determine if this bullet is locked based on current section
            const lockedList =
              currentSection === "Core Principles" ? lockedPrinciples :
              currentSection === "Core Tactics" ? lockedTactics : [];
            const isLocked = lockedList.some(
              (point) => normalizeBullet(point) === bulletText,
            );

            // Legacy prioritized check for non-locked sections
            const isPrioritized = !isLocked && prioritizedPoints.some(
              (point) => normalizeBullet(point) === bulletText,
            );

            const isHighlighted = isLocked || isPrioritized;

            return (
              <li
                className={`cursor-pointer rounded-md transition-colors ${
                  isHighlighted ? "bg-accent/40 px-2 py-1" : ""
                }`}
                onClick={() => onTogglePriority(bulletText, currentSection)}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">{children}</div>
                  {isLocked ? (
                    <Lock className="mt-1 h-3.5 w-3.5 shrink-0 fill-primary text-primary" />
                  ) : isPrioritized ? (
                    <Star className="mt-1 h-3.5 w-3.5 shrink-0 fill-primary text-primary" />
                  ) : null}
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
