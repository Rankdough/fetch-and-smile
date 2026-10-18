import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { pdfjsLib } from "@/lib/sign/pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";

export type PdfSource = { url: string } | { data: Uint8Array };

interface Props {
  source: PdfSource;
  maxWidth?: number;
  onLoaded?: (pageCount: number) => void;
  onError?: (message: string) => void;
  /** Rendered inside each page, absolutely positioned over the canvas. */
  renderOverlay?: (page: number) => ReactNode;
  onPageClick?: (page: number, x: number, y: number) => void;
  pageClassName?: string;
}

export function PdfPages({ source, maxWidth = 860, onLoaded, onError, renderOverlay, onPageClick, pageClassName }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.min(el.clientWidth, maxWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxWidth]);

  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    setDoc(null);
    const task = pdfjsLib.getDocument("url" in source ? { url: source.url } : { data: source.data.slice() });
    task.promise
      .then((d) => {
        if (cancelled) return d.destroy();
        loaded = d;
        setDoc(d);
        onLoaded?.(d.numPages);
      })
      .catch((e) => {
        if (!cancelled) onError?.(e?.name === "PasswordException" ? "This PDF is password protected." : "Could not read this PDF.");
      });
    return () => {
      cancelled = true;
      task.destroy();
      loaded?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, ["url" in source ? source.url : source.data]);

  return (
    <div ref={wrapRef} className="w-full">
      {!doc && (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}
      {doc && width > 0 && (
        <div className="flex flex-col items-center gap-4">
          {Array.from({ length: doc.numPages }, (_, i) => (
            <Page key={i} doc={doc} pageNumber={i + 1} width={width} className={pageClassName} onClick={onPageClick}>
              {renderOverlay?.(i + 1)}
            </Page>
          ))}
        </div>
      )}
    </div>
  );
}

function Page({
  doc, pageNumber, width, className, onClick, children,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  className?: string;
  onClick?: (page: number, x: number, y: number) => void;
  children?: ReactNode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [aspect, setAspect] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    doc.getPage(pageNumber).then((page) => {
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const scale = width / base.width;
      const viewport = page.getViewport({ scale });
      setAspect(viewport.height / viewport.width);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      task = page.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      task.promise.catch(() => undefined);
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageNumber, width]);

  return (
    <div
      data-sign-page={pageNumber}
      className={`relative bg-white shadow-md ring-1 ring-border ${className ?? ""}`}
      style={{ width, height: aspect ? width * aspect : undefined, minHeight: aspect ? undefined : 200 }}
      onClick={(e) => {
        if (!onClick) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onClick(pageNumber, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {children}
    </div>
  );
}
