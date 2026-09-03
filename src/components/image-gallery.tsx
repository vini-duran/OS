import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { StoredFile } from "@/lib/domain";

/** Browsing is local UI state; only the explicit selection button changes a draft. */
export function ImageGallery({
  images,
  compact = false,
  selectedIds,
  onToggle,
}: {
  images: StoredFile[];
  compact?: boolean;
  selectedIds?: ReadonlySet<string>;
  onToggle?: (image: StoredFile) => void;
}) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const rail = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const index = images.findIndex((image) => image.id === previewId);
  const preview = images[index];
  function move(direction: -1 | 1) {
    if (index < 0 || images.length < 2) return;
    setPreviewId(images[(index + direction + images.length) % images.length].id);
  }
  function scroll(direction: -1 | 1) {
    rail.current?.scrollBy({
      left: direction * rail.current.clientWidth * 0.8,
      behavior: "smooth",
    });
  }
  const control =
    "grid size-9 shrink-0 place-items-center rounded-md border border-border bg-card hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="min-w-0 max-w-full space-y-2" data-image-gallery>
      {images.length > 1 && (
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{images.length} imagens · clique para ampliar</span>
          <div className="flex gap-2">
            <button
              type="button"
              className={control}
              aria-label="Rolar imagens para a esquerda"
              onClick={() => scroll(-1)}
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              className={control}
              aria-label="Rolar imagens para a direita"
              onClick={() => scroll(1)}
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
      <div
        ref={rail}
        className="flex min-w-0 max-w-full gap-3 overflow-x-auto pb-3"
        tabIndex={0}
        role="region"
        aria-label="Miniaturas — rolagem horizontal"
      >
        {images.map((image, imageIndex) => (
          <figure
            key={image.id}
            className={`${images.length > 1 ? (compact ? "w-64" : "w-80") : "w-full"} shrink-0 overflow-hidden rounded-lg border border-border bg-background/40`}
          >
            <button
              type="button"
              className="group relative block w-full cursor-zoom-in focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              aria-label={`Ampliar imagem ${imageIndex + 1}: ${image.name}`}
              onClick={(event) => {
                event.stopPropagation();
                trigger.current = event.currentTarget;
                setPreviewId(image.id);
              }}
            >
              <img
                src={image.url}
                alt={image.name}
                loading="lazy"
                className={`${compact ? "h-44" : "h-60"} w-full object-contain`}
              />
              <span className="absolute right-2 top-2 rounded bg-black/70 p-1.5 text-white">
                <Maximize2 className="size-4" />
              </span>
            </button>
            <figcaption className="space-y-2 border-t border-border p-2">
              <span className="block truncate text-xs text-muted-foreground" title={image.name}>
                {imageIndex + 1}. {image.name}
              </span>
              {onToggle && (
                <button
                  type="button"
                  aria-pressed={selectedIds?.has(image.id) ?? false}
                  onClick={() => onToggle(image)}
                  className="w-full rounded border border-border px-3 py-2 text-xs aria-pressed:border-brand aria-pressed:bg-brand/15"
                >
                  {selectedIds?.has(image.id)
                    ? "Selecionada — remover seleção"
                    : "Selecionar imagem"}
                </button>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
      <Dialog
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) setPreviewId(null);
        }}
      >
        <DialogContent
          className="flex h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-none flex-col gap-3 overflow-hidden p-3"
          aria-describedby={undefined}
          onClick={(event) => event.stopPropagation()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              event.stopPropagation();
              move(event.key === "ArrowLeft" ? -1 : 1);
            }
          }}
        >
          <DialogTitle className="truncate pr-12 text-sm">
            {preview ? `${index + 1} / ${images.length} — ${preview.name}` : "Prévia ampliada"}
          </DialogTitle>
          {preview && (
            <>
              <div className="flex min-h-0 flex-1 items-center gap-2 rounded bg-black/80 p-2">
                <button
                  type="button"
                  className={control}
                  disabled={images.length < 2}
                  aria-label="Imagem anterior"
                  onClick={() => move(-1)}
                >
                  <ChevronLeft className="size-5" />
                </button>
                <img
                  src={preview.url}
                  alt={preview.name}
                  className="h-full min-h-0 min-w-0 flex-1 object-contain"
                />
                <button
                  type="button"
                  className={control}
                  disabled={images.length < 2}
                  aria-label="Próxima imagem"
                  onClick={() => move(1)}
                >
                  <ChevronRight className="size-5" />
                </button>
              </div>
              {onToggle && (
                <button
                  type="button"
                  aria-pressed={selectedIds?.has(preview.id) ?? false}
                  onClick={() => onToggle(preview)}
                  className="self-center rounded border border-border px-4 py-2 text-sm aria-pressed:border-brand aria-pressed:bg-brand/15"
                >
                  {selectedIds?.has(preview.id)
                    ? "Selecionada — remover seleção"
                    : "Selecionar imagem"}
                </button>
              )}
            </>
          )}
          <p className="text-center text-xs text-muted-foreground">
            ← → para navegar · Esc para fechar. Ampliar ou navegar não altera a seleção.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
