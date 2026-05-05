import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Articles from "./pages/Articles";
import ProductDescriptions from "./pages/ProductDescriptions";
import KeywordResearch from "./pages/KeywordResearch";
import OutlineGenerator from "./pages/OutlineGenerator";
import ContentMigration from "./pages/ContentMigration";
import ShopifyFaqBulk from "./pages/ShopifyFaqBulk";
import BrainLibrary from "./pages/BrainLibrary";
import BrainInsights from "./pages/BrainInsights";
import BrainAsk from "./pages/BrainAsk";
import BrainOutputs from "./pages/BrainOutputs";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/articles" element={<Articles />} />
          <Route path="/product-descriptions" element={<ProductDescriptions />} />
          <Route path="/keyword-research" element={<KeywordResearch />} />
          <Route path="/outline-generator" element={<OutlineGenerator />} />
          <Route path="/content-migration" element={<ContentMigration />} />
          <Route path="/shopify-faq-bulk" element={<ShopifyFaqBulk />} />
          <Route path="/seo-brain/library" element={<BrainLibrary />} />
          <Route path="/seo-brain/insights" element={<BrainInsights />} />
          <Route path="/seo-brain/ask" element={<BrainAsk />} />
          <Route path="/seo-brain/outputs" element={<BrainOutputs />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
