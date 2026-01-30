import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Sparkles, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";

const Index = () => {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState("");
  
  const [formData, setFormData] = useState({
    topic: "",
    length: "medium",
    outline: "",
    instructions: "",
  });

  const handleGenerate = async () => {
    if (!formData.topic.trim()) {
      toast({
        title: "Topic required",
        description: "Please enter a topic for your content.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setGeneratedContent("");

    try {
      const { data, error } = await supabase.functions.invoke("generate-content", {
        body: formData,
      });

      if (error) throw error;

      setGeneratedContent(data.content);
      toast({
        title: "Content generated!",
        description: "Your article has been created successfully.",
      });
    } catch (error) {
      console.error("Generation error:", error);
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "Failed to generate content",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold">SEO Content Generator</h1>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-120px)]">
          {/* Left Panel - Form */}
          <Card className="flex flex-col">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5" />
                Blog Post Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-5">
              {/* Topic */}
              <div className="space-y-2">
                <Label htmlFor="topic">What is the topic of your post?</Label>
                <Input
                  id="topic"
                  placeholder="e.g., Best practices for React performance optimization"
                  value={formData.topic}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, topic: e.target.value }))
                  }
                />
              </div>

              {/* Length */}
              <div className="space-y-2">
                <Label>How long would you like the blog post to be?</Label>
                <Select
                  value={formData.length}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, length: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select length" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">Short (~500 words)</SelectItem>
                    <SelectItem value="medium">Medium (~1000 words)</SelectItem>
                    <SelectItem value="long">Long (~2000 words)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Outline */}
              <div className="space-y-2 flex-1">
                <Label htmlFor="outline">What is the outline of your post?</Label>
                <Textarea
                  id="outline"
                  placeholder="- Introduction&#10;- Main points&#10;- Conclusion"
                  className="min-h-[120px] resize-none"
                  value={formData.outline}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, outline: e.target.value }))
                  }
                />
              </div>

              {/* Custom Instructions */}
              <div className="space-y-2">
                <Label htmlFor="instructions">
                  Would you like to add any custom instructions?
                </Label>
                <Textarea
                  id="instructions"
                  placeholder="e.g., Use a professional tone, include statistics, add a TL;DR section..."
                  className="min-h-[80px] resize-none"
                  value={formData.instructions}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, instructions: e.target.value }))
                  }
                />
              </div>

              {/* Generate Button */}
              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full mt-auto"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Content
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Right Panel - Output */}
          <Card className="flex flex-col">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Generated Content</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              {generatedContent ? (
                <article className="prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown>{generatedContent}</ReactMarkdown>
                </article>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  <p className="text-center">
                    Your generated content will appear here.
                    <br />
                    Fill in the form and click "Generate Content" to start.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Index;
