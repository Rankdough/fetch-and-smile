import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Star } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  content: string;
  prioritizedPoints: string[];
  onTogglePriority: (bulletText: string) => void;
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

export function StrategyWithPriorities({ content, prioritizedPoints, onTogglePriority }: Props) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert [&_strong]:text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          li: ({ children }) => {
            const bulletText = normalizeBullet(extractText(children));
            const isPrioritized = prioritizedPoints.some(
              (point) => normalizeBullet(point) === bulletText,
            );

            return (
              <li
                className={`group rounded-md px-2 py-1 transition-colors ${
                  isPrioritized ? "bg-accent/50" : ""
                }`}
                onClick={() => onTogglePriority(bulletText)}
              >
                <span className="inline-flex items-start gap-2 cursor-pointer">
                  <Star
                    className={`mt-1 h-3.5 w-3.5 shrink-0 transition-colors ${
                      isPrioritized
                        ? "fill-primary text-primary"
                        : "text-muted-foreground/40 group-hover:text-muted-foreground/70"
                    }`}
                  />
                  <span>{children}</span>
                </span>
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
