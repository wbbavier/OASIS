// Zoom and navigation controls overlay for the hex map.

interface ZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onCenterCapital?: () => void;
}

export function ZoomControls({ zoom, onZoomIn, onZoomOut, onReset, onCenterCapital }: ZoomControlsProps) {
  return (
    <>
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        <button onClick={onZoomIn}
          className="rounded bg-stone-800/90 border border-stone-600 w-7 h-7 text-stone-300 hover:text-white text-sm font-bold">
          +
        </button>
        <button onClick={onZoomOut}
          className="rounded bg-stone-800/90 border border-stone-600 w-7 h-7 text-stone-300 hover:text-white text-sm font-bold">
          {'\u2212'}
        </button>
        <button onClick={onReset} title="Reset view"
          className="rounded bg-stone-800/90 border border-stone-600 w-7 h-7 text-stone-300 hover:text-white text-xs">
          {'\u27f2'}
        </button>
        {onCenterCapital && (
          <button onClick={onCenterCapital} title="Center on capital"
            className="rounded bg-stone-800/90 border border-stone-600 w-7 h-7 text-stone-300 hover:text-white text-xs">
            {'\u2691'}
          </button>
        )}
      </div>
      <div className="absolute bottom-2 right-2 z-10 text-[10px] text-stone-500 bg-stone-900/80 px-1.5 py-0.5 rounded">
        {Math.round(zoom * 100)}%
      </div>
    </>
  );
}
