import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SCRIPT_FONT = `"Caveat", "Segoe Script", "Brush Script MT", cursive`;
const PAD = 8;

/** Crops a canvas to its inked area and returns a transparent PNG data URL, or null if blank. */
function trimToPng(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const { width, height } = canvas;
  const px = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (px[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const out = document.createElement("canvas");
  out.width = maxX - minX + 1 + PAD * 2;
  out.height = maxY - minY + 1 + PAD * 2;
  out.getContext("2d")!.drawImage(canvas, minX, minY, maxX - minX + 1, maxY - minY + 1, PAD, PAD, maxX - minX + 1, maxY - minY + 1);
  return out.toDataURL("image/png");
}

async function renderTyped(name: string): Promise<string | null> {
  const text = name.trim();
  if (!text) return null;
  try {
    await document.fonts.load(`64px ${SCRIPT_FONT}`, text);
  } catch {
    /* fall back to the system script font */
  }
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 220;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#111";
  ctx.font = `84px ${SCRIPT_FONT}`;
  ctx.textBaseline = "middle";
  // Shrink long names so they stay inside the canvas.
  let size = 84;
  while (size > 24 && ctx.measureText(text).width > canvas.width - 40) {
    size -= 4;
    ctx.font = `${size}px ${SCRIPT_FONT}`;
  }
  ctx.fillText(text, 20, canvas.height / 2);
  return trimToPng(canvas);
}

interface Props {
  defaultName?: string;
  onChange: (png: string | null) => void;
}

export function SignaturePad({ defaultName = "", onChange }: Props) {
  const [mode, setMode] = useState<"type" | "draw">("type");
  const [name, setName] = useState(defaultName);
  const [typedPng, setTypedPng] = useState<string | null>(null);
  const [drawnPng, setDrawnPng] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    let live = true;
    renderTyped(name).then((png) => live && setTypedPng(png));
    return () => {
      live = false;
    };
  }, [name]);

  useEffect(() => {
    onChange(mode === "type" ? typedPng : drawnPng);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, typedPng, drawnPng]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return [((e.clientX - rect.left) / rect.width) * canvas.width, ((e.clientY - rect.top) / rect.height) * canvas.height];
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const [x, y] = point(e);
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.01, y);
    ctx.stroke();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const [x, y] = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (canvasRef.current) setDrawnPng(trimToPng(canvasRef.current));
  };
  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setDrawnPng(null);
  }, []);

  return (
    <Tabs value={mode} onValueChange={(v) => setMode(v as "type" | "draw")}>
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="type">Type</TabsTrigger>
        <TabsTrigger value="draw">Draw</TabsTrigger>
      </TabsList>
      <TabsContent value="type" className="space-y-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" maxLength={80} aria-label="Full name" />
        <div className="flex h-24 items-center justify-center rounded-md border bg-white p-2">
          {typedPng ? <img src={typedPng} alt="Signature preview" className="max-h-full max-w-full" /> : <span className="text-sm text-muted-foreground">Your signature appears here</span>}
        </div>
      </TabsContent>
      <TabsContent value="draw" className="space-y-3">
        <canvas
          ref={canvasRef}
          width={900}
          height={260}
          className="h-40 w-full touch-none rounded-md border bg-white"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          aria-label="Draw your signature"
        />
        <Button type="button" variant="outline" size="sm" onClick={clear}>
          <Eraser className="mr-2 h-4 w-4" /> Clear
        </Button>
      </TabsContent>
    </Tabs>
  );
}
