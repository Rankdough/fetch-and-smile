import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQAccordionProps {
  items: FAQItem[];
  brandColors?: {
    primary: string;
    secondary: string;
    accent: string;
  } | null;
  isDarkSite?: boolean;
}

export const FAQAccordion = ({ items, brandColors, isDarkSite = false }: FAQAccordionProps) => {
  const [expandedItem, setExpandedItem] = useState<number | null>(null);

  if (!items || items.length === 0) return null;

  // Use brand colors or fall back to default purple theme
  const accentColor = brandColors?.accent || brandColors?.primary || "hsl(300 52% 36%)";
  const primaryColor = brandColors?.primary || "hsl(300 52% 36%)";

  return (
    <div 
      className="rounded-lg border p-4 space-y-3 my-6"
      style={isDarkSite ? { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)', color: '#e5e7eb' } : undefined}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <span 
            className="flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-bold"
            style={{ backgroundColor: accentColor }}
          >
            ?
          </span>
          Frequently Asked Questions
        </h4>
        <span className="text-xs" style={isDarkSite ? { color: 'rgba(255,255,255,0.5)' } : undefined}>
          {items.length} questions
        </span>
      </div>

      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={index}
            className="rounded-md border transition-all overflow-hidden"
            style={isDarkSite ? { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: expandedItem === index ? accentColor : 'rgba(255,255,255,0.12)' } : { borderColor: expandedItem === index ? accentColor : undefined }}
          >
            {/* Question row - clickable */}
            <button 
              type="button"
              className="flex items-center gap-3 px-3 py-3 w-full text-left hover:bg-muted/50 transition-colors"
              onClick={() => setExpandedItem(expandedItem === index ? null : index)}
            >
              <div 
                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ 
                  backgroundColor: `${primaryColor}15`,
                  color: primaryColor,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: `${primaryColor}30`
                }}
              >
                {index + 1}
              </div>
              <span className="flex-1 text-sm font-semibold" style={isDarkSite ? { color: '#e5e7eb' } : undefined}>
                {item.question}
              </span>
              <ChevronDown 
                className={cn(
                  "h-4 w-4 flex-shrink-0 transition-transform duration-200",
                  expandedItem === index && "rotate-180"
                )} 
                style={{ color: accentColor }}
              />
            </button>
            
            {/* Answer - collapsible */}
            <div className={cn(
              "overflow-hidden transition-all duration-200",
              expandedItem === index ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
            )}>
              <div className="px-3 pb-3 pl-12">
                <p className="text-sm leading-relaxed" style={isDarkSite ? { color: 'rgba(255,255,255,0.6)' } : undefined}>
                  {item.answer}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Helper function to extract FAQ items from markdown content
export const extractFAQFromContent = (content: string): FAQItem[] => {
  const items: FAQItem[] = [];
  
  // Find the FAQ section
  const faqMatch = content.match(/## .*(?:FAQ|Frequently Asked Questions)\s*\n([\s\S]*?)(?=\n## [A-Z]|$)/i);
  if (!faqMatch) return items;
  
  const faqContent = faqMatch[1];
  
  // Match Q&A pairs: **Question?**\n(optional blank line)\nAnswer text
  const qaRegex = /\*\*([^*]+\??)\*\*\s*\n\n?([^*\n][^\n]*(?:\n(?!\*\*|\n\*\*)[^\n]+)*)/g;
  let match;
  
  while ((match = qaRegex.exec(faqContent)) !== null) {
    const question = match[1].trim();
    const answer = match[2].trim().replace(/\n+/g, ' ');
    
    if (question && answer) {
      items.push({ question, answer });
    }
  }
  
  return items;
};

// Helper to remove FAQ section from markdown for custom rendering
export const removeFAQSection = (content: string): string => {
  return content.replace(/## .*(?:FAQ|Frequently Asked Questions)\s*\n([\s\S]*?)(?=\n## [A-Z]|$)/i, "");
};

// Generate HTML for FAQ accordion (for export)
export const generateFAQHtml = (
  items: FAQItem[],
  brandColors?: { primary: string; secondary?: string; accent?: string; id?: string } | null
): string => {
  if (!items || items.length === 0) return '';
  
  const primaryColor = brandColors?.primary || "#7c3aed";
  const accentColor = brandColors?.accent || primaryColor;
  const isDark = brandColors?.id === "dark-transparent";
  
  // Dark site vs light site colors
  const containerBg = isDark ? "rgba(255,255,255,0.06)" : "#f9fafb";
  const containerBorder = isDark ? "rgba(255,255,255,0.15)" : "#e5e7eb";
  const containerText = isDark ? "#e5e7eb" : "#1f2937";
  const itemBg = isDark ? "rgba(255,255,255,0.04)" : "#ffffff";
  const itemBorder = isDark ? "rgba(255,255,255,0.12)" : "#e5e7eb";
  const itemText = isDark ? "#e5e7eb" : "#1f2937";
  const mutedText = isDark ? "rgba(255,255,255,0.5)" : "#9ca3af";
  const answerText = isDark ? "rgba(255,255,255,0.6)" : "#6b7280";
  
  const faqItemsHtml = items.map((item, index) => `
    <details style="margin: 8px 0; padding: 0; background: ${itemBg}; border: 1px solid ${itemBorder}; border-radius: 8px; overflow: hidden;">
      <summary style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; cursor: pointer; list-style: none; font-weight: 600; font-size: 14px; color: ${itemText};">
        <span style="display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; font-size: 12px; font-weight: 700; background: ${primaryColor}15; color: ${primaryColor}; border: 1px solid ${primaryColor}30; flex-shrink: 0;">${index + 1}</span>
        <span style="flex: 1;">${item.question}</span>
        <svg style="width: 16px; height: 16px; color: ${accentColor}; flex-shrink: 0; transition: transform 0.2s;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
      </summary>
      <div style="padding: 0 16px 16px 52px; font-size: 14px; color: ${answerText}; line-height: 1.6;">
        ${item.answer}
      </div>
    </details>
  `).join('');
  
  return `
<div style="border-radius: 8px; border: 1px solid ${containerBorder}; background: ${containerBg}; padding: 16px; margin: 24px 0; color: ${containerText};">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
    <h4 style="margin: 0; font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 8px; color: ${containerText};">
      <span style="display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; background: ${accentColor}; color: white; font-size: 12px; font-weight: 700;">?</span>
      Frequently Asked Questions
    </h4>
    <span style="font-size: 12px; color: ${mutedText};">${items.length} questions</span>
  </div>
  <div>
    ${faqItemsHtml}
  </div>
</div>
<style>
  details[open] summary svg { transform: rotate(180deg); }
  details summary::-webkit-details-marker { display: none; }
</style>`;
};
