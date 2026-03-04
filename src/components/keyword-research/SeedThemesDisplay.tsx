import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SeedThemes } from "./seedThemeExtractor";
import { Layers, Users, MapPin, Target, Activity, Repeat, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";

interface SeedThemesDisplayProps {
  themes: SeedThemes;
  onRefresh?: () => void;
}

const ThemeSection = ({
  icon: Icon,
  label,
  items,
  colorClass,
}: {
  icon: React.ElementType;
  label: string;
  items: { term: string; count: number }[];
  colorClass: string;
}) => {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={`h-3.5 w-3.5 ${colorClass}`} />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <Badge key={item.term} variant="secondary" className="text-xs">
            {item.term}
            {item.count > 1 && (
              <span className="ml-1 text-muted-foreground">×{item.count}</span>
            )}
          </Badge>
        ))}
      </div>
    </div>
  );
};

const SeedThemesDisplay = ({ themes, onRefresh }: SeedThemesDisplayProps) => {
  const hasContent =
    themes.coreTopics.length > 0 ||
    themes.demographics.length > 0 ||
    themes.activities.length > 0 ||
    themes.intentModifiers.length > 0 ||
    themes.locations.length > 0 ||
    themes.patterns.length > 0;

  const [isOpen, setIsOpen] = useState(false);

  if (!hasContent) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="border-primary/20 bg-primary/5">
        <CollapsibleTrigger className="w-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Extracted Seed Themes
              {onRefresh && (
                <Button variant="ghost" size="icon" className="h-6 w-6 ml-1" onClick={(e) => { e.stopPropagation(); onRefresh(); }} title="Re-extract themes">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              )}
              <Badge variant="outline" className="text-xs font-normal ml-auto mr-2">
                {themes.nonBrandedCount} non-branded / {themes.totalAnalyzed} total keywords
              </Badge>
              {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-3">
            <ThemeSection icon={Target} label="Core Topics" items={themes.coreTopics.slice(0, 20)} colorClass="text-primary" />
            <ThemeSection icon={Users} label="Demographics" items={themes.demographics} colorClass="text-blue-500" />
            <ThemeSection icon={Activity} label="Activities & Interests" items={themes.activities} colorClass="text-green-500" />
            <ThemeSection icon={Target} label="Intent Modifiers" items={themes.intentModifiers} colorClass="text-orange-500" />
            <ThemeSection icon={MapPin} label="Locations" items={themes.locations} colorClass="text-red-500" />
            <ThemeSection icon={Repeat} label="Recurring Patterns" items={themes.patterns.slice(0, 15)} colorClass="text-purple-500" />
            <p className="text-xs text-muted-foreground">
              These building blocks will be sent to the AI for combinatorial expansion instead of raw keywords.
            </p>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

export default SeedThemesDisplay;
