import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

// Convert hex to HSL
function hexToHSL(hex: string): { h: number; s: number; l: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;

  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

// Convert RGB to hex
function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(x => {
    const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }).join("");
}

// Parse color string to hex
function parseColorToHex(color: string): string | null {
  if (!color) return null;
  
  color = color.trim().toLowerCase();
  
  // Already hex
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return "#" + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
  }
  
  // RGB/RGBA
  const rgbMatch = color.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return rgbToHex(parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3]));
  }
  
  // HSL
  const hslMatch = color.match(/hsla?\s*\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?/);
  if (hslMatch) {
    const h = parseInt(hslMatch[1]) / 360;
    const s = parseInt(hslMatch[2]) / 100;
    const l = parseInt(hslMatch[3]) / 100;
    
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return rgbToHex(r * 255, g * 255, b * 255);
  }
  
  return null;
}

// Extract colors from HTML
function extractColorsFromHTML(html: string): string[] {
  const colors: Set<string> = new Set();
  
  // Theme color meta tag
  const themeColorMatch = html.match(/<meta[^>]*name=["']theme-color["'][^>]*content=["']([^"']+)["']/i);
  if (themeColorMatch) {
    const hex = parseColorToHex(themeColorMatch[1]);
    if (hex) colors.add(hex);
  }
  
  // msapplication-TileColor
  const tileColorMatch = html.match(/<meta[^>]*name=["']msapplication-TileColor["'][^>]*content=["']([^"']+)["']/i);
  if (tileColorMatch) {
    const hex = parseColorToHex(tileColorMatch[1]);
    if (hex) colors.add(hex);
  }
  
  // CSS custom properties (--primary, --brand, etc.)
  const cssVarMatches = html.matchAll(/--(?:primary|brand|main|accent|theme)[^:]*:\s*([^;}\n]+)/gi);
  for (const match of cssVarMatches) {
    const hex = parseColorToHex(match[1]);
    if (hex) colors.add(hex);
  }
  
  // Inline style colors on key elements
  const styleMatches = html.matchAll(/(?:background-color|background|color)\s*:\s*([^;}"'\n]+)/gi);
  for (const match of styleMatches) {
    const value = match[1].trim();
    // Skip gradients and images
    if (value.includes('gradient') || value.includes('url(')) continue;
    const hex = parseColorToHex(value);
    if (hex) colors.add(hex);
  }
  
  // Button/header/nav background colors often indicate brand colors
  const buttonBgMatches = html.matchAll(/<(?:button|a|header|nav)[^>]*style=["'][^"']*background(?:-color)?:\s*([^;}"']+)/gi);
  for (const match of buttonBgMatches) {
    const hex = parseColorToHex(match[1]);
    if (hex) colors.add(hex);
  }
  
  return Array.from(colors);
}

// Score colors by how "brand-like" they are (saturated, not too light/dark)
function scoreBrandColor(hex: string): number {
  const hsl = hexToHSL(hex);
  if (!hsl) return 0;
  
  let score = 0;
  
  // Prefer saturated colors
  if (hsl.s >= 40) score += 30;
  if (hsl.s >= 60) score += 20;
  
  // Prefer mid-range lightness (not too dark, not too light)
  if (hsl.l >= 25 && hsl.l <= 75) score += 30;
  if (hsl.l >= 35 && hsl.l <= 65) score += 20;
  
  // Penalize near-black and near-white
  if (hsl.l < 10 || hsl.l > 90) score -= 50;
  
  // Penalize very desaturated colors (grays)
  if (hsl.s < 10) score -= 40;
  
  return score;
}

// Generate a complementary color palette
function generatePalette(primaryHex: string): BrandColors {
  const hsl = hexToHSL(primaryHex);
  if (!hsl) {
    return {
      primary: "#6366f1",
      secondary: "#8b5cf6",
      accent: "#ec4899",
      background: "#1a1a2e",
      text: "#ffffff"
    };
  }
  
  // Primary is the extracted color
  const primary = primaryHex;
  
  // Secondary: shift hue slightly, adjust saturation
  const secondaryH = (hsl.h + 30) % 360;
  const secondaryS = Math.min(hsl.s + 10, 100);
  const secondaryL = Math.min(Math.max(hsl.l - 5, 30), 60);
  
  // Accent: complementary or analogous color
  const accentH = (hsl.h + 180) % 360;
  const accentS = Math.min(hsl.s + 20, 100);
  const accentL = Math.min(Math.max(hsl.l, 40), 60);
  
  // Dark background based on primary hue
  const bgH = hsl.h;
  const bgS = Math.min(hsl.s * 0.3, 30);
  const bgL = 15;
  
  return {
    primary,
    secondary: `hsl(${secondaryH}, ${secondaryS}%, ${secondaryL}%)`,
    accent: `hsl(${accentH}, ${accentS}%, ${accentL}%)`,
    background: `hsl(${bgH}, ${bgS}%, ${bgL}%)`,
    text: "#ffffff"
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ error: "URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize URL
    let targetUrl = url.trim();
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      targetUrl = "https://" + targetUrl;
    }

    console.log("Extracting brand colors from:", targetUrl);

    // Fetch the webpage
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      console.error("Failed to fetch URL:", response.status);
      return new Response(
        JSON.stringify({ 
          error: "Failed to fetch website",
          colors: generatePalette("#6366f1") // Return default palette
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const html = await response.text();
    
    // Extract colors
    const extractedColors = extractColorsFromHTML(html);
    console.log("Extracted colors:", extractedColors);

    // Score and sort colors
    const scoredColors = extractedColors
      .map(c => ({ color: c, score: scoreBrandColor(c) }))
      .sort((a, b) => b.score - a.score);

    console.log("Scored colors:", scoredColors.slice(0, 5));

    // Pick the best color as primary
    const primaryColor = scoredColors.length > 0 && scoredColors[0].score > 0
      ? scoredColors[0].color
      : "#6366f1"; // Default indigo

    const palette = generatePalette(primaryColor);
    
    console.log("Generated palette:", palette);

    return new Response(
      JSON.stringify({ 
        success: true,
        extractedColors: scoredColors.slice(0, 5).map(c => c.color),
        colors: palette
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Brand color extraction error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Failed to extract colors",
        colors: generatePalette("#6366f1") // Return default palette
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
