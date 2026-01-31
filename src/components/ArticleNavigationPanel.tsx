import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavigationItem {
  number: number;
  title: string;
  description: string;
  slug: string;
  isHighlighted?: boolean;
}

interface ArticleNavigationPanelProps {
  items: NavigationItem[];
  onJumpToSection?: (slug: string) => void;
}

export const ArticleNavigationPanel = ({ 
  items, 
  onJumpToSection 
}: ArticleNavigationPanelProps) => {
  const [expandedItem, setExpandedItem] = useState<number | null>(null);

  if (!items || items.length === 0) return null;

  const handleJump = (slug: string) => {
    if (onJumpToSection) {
      onJumpToSection(slug);
    }
    // Also try to scroll to the element in the preview
    const element = document.getElementById(slug);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
            #
          </span>
          In This Article
        </h4>
        <span className="text-xs text-muted-foreground">
          {items.length} sections
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        Quick navigation to each section of this article:
      </p>

      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={index}
            className={cn(
              "rounded-lg border p-3 transition-all",
              item.isHighlighted 
                ? "border-primary bg-primary/5 ring-1 ring-primary" 
                : "hover:border-muted-foreground/50"
            )}
          >
            <div className="flex items-start gap-3">
              <div className={cn(
                "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                item.isHighlighted 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-muted text-muted-foreground border"
              )}>
                {item.number}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={cn(
                    "text-sm font-medium",
                    item.isHighlighted && "text-primary"
                  )}>
                    {item.title}
                  </p>
                  {item.isHighlighted && (
                    <Star className="h-3 w-3 text-primary fill-primary" />
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 flex-shrink-0"
                onClick={() => setExpandedItem(expandedItem === index ? null : index)}
              >
                {expandedItem === index ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>
            
            {expandedItem === index && (
              <div className="mt-3 pl-9 space-y-2 border-t pt-3">
                <p className="text-xs text-muted-foreground">{item.description}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleJump(item.slug)}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Jump to section
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Helper function to extract navigation items from markdown content
export const extractNavigationFromContent = (content: string): NavigationItem[] => {
  const items: NavigationItem[] = [];
  
  // Find all H2 headings (## Heading)
  const h2Regex = /^## (.+)$/gm;
  let match;
  let number = 1;
  
  // Skip TL;DR and In This Article sections
  const skipSections = ["tl;dr", "tldr", "in this article", "references"];
  
  while ((match = h2Regex.exec(content)) !== null) {
    const title = match[1].trim();
    const titleLower = title.toLowerCase();
    
    if (skipSections.some(skip => titleLower.includes(skip))) {
      continue;
    }
    
    // Generate slug from title
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
    
    // Try to extract description from the first paragraph after the heading
    const headingIndex = match.index;
    const afterHeading = content.slice(headingIndex + match[0].length);
    const firstParagraph = afterHeading.split(/\n\n/)[0]?.trim() || "";
    const description = firstParagraph.replace(/^\n+/, "").slice(0, 150) + (firstParagraph.length > 150 ? "..." : "");
    
    items.push({
      number,
      title,
      description: description || `Learn about ${title.toLowerCase()}`,
      slug,
      isHighlighted: number === 1, // First item is highlighted
    });
    
    number++;
  }
  
  return items;
};
