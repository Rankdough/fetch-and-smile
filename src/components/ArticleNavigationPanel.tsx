import { useState } from "react";
import { ChevronDown, ExternalLink, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface NavigationItem {
  number: number;
  title: string;
  description: string;
  detailedDescription?: string;
  slug: string;
  isHighlighted?: boolean;
}

interface ArticleNavigationPanelProps {
  items: NavigationItem[];
  onJumpToSection?: (slug: string) => void;
  skipNavigation?: boolean;
  onSkipNavigationChange?: (skip: boolean) => void;
  isDarkSite?: boolean;
}

export const ArticleNavigationPanel = ({ 
  items, 
  onJumpToSection,
  skipNavigation = false,
  onSkipNavigationChange,
  isDarkSite = false
}: ArticleNavigationPanelProps) => {
  const [expandedItem, setExpandedItem] = useState<number | null>(null);

  if (!items || items.length === 0) return null;

  const handleJump = (slug: string) => {
    if (onJumpToSection) {
      onJumpToSection(slug);
    }
    
    // Try to find the element by ID
    const element = document.getElementById(slug);
    if (!element) {
      console.warn(`Jump target not found: #${slug}`);
      return;
    }
    
    // Walk up the DOM to find any scrollable ancestor
    const findScrollableParent = (el: HTMLElement | null): HTMLElement | null => {
      while (el && el !== document.documentElement) {
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
          return el;
        }
        el = el.parentElement;
      }
      return null;
    };

    const scrollContainer = findScrollableParent(element);
    
    if (scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const offset = elementRect.top - containerRect.top + scrollContainer.scrollTop - 20;
      scrollContainer.scrollTo({ top: offset, behavior: 'smooth' });
    } else {
      // Fallback to standard scrollIntoView
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div 
      className="rounded-lg border p-3 sm:p-4 space-y-2 sm:space-y-3"
      style={isDarkSite ? { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)', color: '#e5e7eb' } : undefined}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h4 className="text-xs sm:text-sm font-medium flex items-center gap-2">
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
            #
          </span>
          In This Article
        </h4>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {items.length} sections
          </span>
          {onSkipNavigationChange && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Skip</span>
              <Switch 
                checked={skipNavigation}
                onCheckedChange={onSkipNavigationChange}
              />
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Quick navigation to each section of this article:
      </p>

      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={index}
            className={cn(
              "rounded-md border bg-background transition-all overflow-hidden",
              item.isHighlighted 
                ? "border-primary bg-primary text-primary-foreground" 
                : "border-border hover:border-primary/30"
            )}
          >
            {/* Clickable header row */}
            <button 
              type="button"
              className={cn(
                "flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2.5 sm:py-3 w-full text-left transition-colors",
                item.isHighlighted 
                  ? "hover:bg-primary/90" 
                  : "hover:bg-muted/50"
              )}
              onClick={() => setExpandedItem(expandedItem === index ? null : index)}
            >
              <div className={cn(
                "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                item.isHighlighted 
                  ? "bg-primary-foreground/20 text-primary-foreground" 
                  : "bg-primary/10 text-primary border border-primary/20"
              )}>
                {item.number}
              </div>
              <span className={cn(
                "flex-1 text-xs sm:text-sm font-semibold leading-tight",
                item.isHighlighted ? "text-primary-foreground" : "text-foreground"
              )}>
                {item.title}
                {item.isHighlighted && (
                  <Star className="inline-block ml-1.5 h-3 w-3 fill-current" />
                )}
              </span>
              <ChevronDown className={cn(
                "h-4 w-4 flex-shrink-0 transition-transform duration-200",
                item.isHighlighted ? "text-primary-foreground/70" : "text-primary",
                expandedItem === index && "rotate-180"
              )} />
            </button>
            
            {/* Expandable description with jump link */}
            <div className={cn(
              "overflow-hidden transition-all duration-200",
              expandedItem === index ? "max-h-48 opacity-100" : "max-h-0 opacity-0"
            )}>
              <div className={cn(
                "px-2 sm:px-3 pb-3 pl-10 sm:pl-12 space-y-2",
                item.isHighlighted ? "text-primary-foreground/80" : ""
              )}>
                <p className={cn(
                  "text-xs sm:text-sm leading-relaxed",
                  item.isHighlighted ? "text-primary-foreground/80" : "text-muted-foreground"
                )}>
                  {item.description.replace(/\.{3}$/, '')} {item.detailedDescription}
                </p>
                <Button
                  variant={item.isHighlighted ? "secondary" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleJump(item.slug);
                  }}
                >
                  <ExternalLink className="h-3 w-3 mr-1.5" />
                  Jump to section
                </Button>
              </div>
            </div>
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
    
    // Generate slug EXACTLY like ReactMarkdown does: String(children).toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
    const slug = title
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "");
    
    // Try to extract description from the first paragraph after the heading
    const headingIndex = match.index;
    const afterHeading = content.slice(headingIndex + match[0].length);
    const firstParagraph = afterHeading.split(/\n\n/)[0]?.trim().replace(/^\n+/, "") || "";
    
    // Short description: first 100 chars (for 2 lines display)
    const shortDescription = firstParagraph.slice(0, 100) + (firstParagraph.length > 100 ? "..." : "");
    
    // Detailed description: next portion of text for expanded view
    const detailedDescription = firstParagraph.length > 100 
      ? firstParagraph.slice(100, 300) + (firstParagraph.length > 300 ? "..." : "")
      : "Click to jump to this section and learn more.";
    
    items.push({
      number,
      title,
      description: shortDescription || `Learn about ${title.toLowerCase()}`,
      detailedDescription,
      slug,
      isHighlighted: number === 1, // First item is highlighted
    });
    
    number++;
  }
  
  return items;
};

// Generate HTML for navigation panel (for export)
export const generateNavigationHtml = (
  items: NavigationItem[],
  brandColors?: { primary: string; secondary?: string; accent?: string } | null
): string => {
  if (!items || items.length === 0) return '';
  
  const primaryColor = brandColors?.primary || "#7c3aed";
  
  const navItemsHtml = items.map((item, index) => {
    const isFirst = index === 0;
    return `
    <details style="margin: 8px 0; border: 1px solid ${isFirst ? primaryColor : '#e5e7eb'}; border-radius: 8px; overflow: hidden; ${isFirst ? `background: ${primaryColor}; color: white;` : 'background: #ffffff;'}">
      <summary style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; cursor: pointer; list-style: none; font-weight: 600; font-size: 14px; ${isFirst ? 'color: white;' : 'color: #1f2937;'}">
        <span style="display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; font-size: 12px; font-weight: 700; ${isFirst ? 'background: rgba(255,255,255,0.2); color: white;' : `background: ${primaryColor}15; color: ${primaryColor}; border: 1px solid ${primaryColor}30;`} flex-shrink: 0;">${item.number}</span>
        <span style="flex: 1;">${item.title}${isFirst ? ' ⭐' : ''}</span>
        <svg style="width: 16px; height: 16px; flex-shrink: 0; transition: transform 0.2s;" fill="none" stroke="${isFirst ? 'rgba(255,255,255,0.7)' : primaryColor}" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
      </summary>
      <div style="padding: 0 16px 12px 52px; ${isFirst ? 'color: rgba(255,255,255,0.85);' : 'color: #6b7280;'}">
        <p style="font-size: 13px; line-height: 1.5; margin: 0 0 8px 0;">
          ${item.description.replace(/\.{3}$/, '')} ${item.detailedDescription || ''}
        </p>
        <a href="#${item.slug}" style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; font-size: 11px; font-weight: 500; border-radius: 3px; text-decoration: none; white-space: nowrap; ${isFirst ? 'background: white; color: #1f2937;' : `border: 1px solid ${primaryColor}40; color: ${primaryColor};`}"><svg style="width: 10px; height: 10px; flex-shrink: 0;" fill="none" stroke="${isFirst ? '#1f2937' : primaryColor}" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>Jump</a>
      </div>
    </details>
  `;
  }).join('');
  
  return `
<div style="border-radius: 8px; border: 1px solid #e5e7eb; background: #f9fafb; padding: 16px; margin: 24px 0;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
    <h4 style="margin: 0; font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 8px;">
      <span style="display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; background: ${primaryColor}; color: white; font-size: 12px; font-weight: 700;">#</span>
      In This Article
    </h4>
    <span style="font-size: 12px; color: #9ca3af;">${items.length} sections</span>
  </div>
  <p style="font-size: 12px; color: #9ca3af; margin: 0 0 12px 0;">Quick navigation to each section of this article:</p>
  <div>
    ${navItemsHtml}
  </div>
</div>
<style>
  details[open] summary svg { transform: rotate(180deg); }
  details summary::-webkit-details-marker { display: none; }
</style>`;
};
