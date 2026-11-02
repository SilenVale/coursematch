const PIXEL_LINE_COMPONENT = {
  "data-wf--pixel-line--variant": "base",
  "data-wf-component-id": "e59f6995-4e3e-5cd3-c14a-5306b8736d31",
  "data-wf-variant-state": "base",
} as const;

export function PreloadGrid() {
  return (
    <div className="preload">
      {Array.from({ length: 11 }, (_, row) => (
        <div key={row} className="preload-row">
          {Array.from({ length: 13 }, (_, col) => (
            <div key={col} className="preload-square" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PixelGrid() {
  return (
    <div className="pixel-grid">
      {Array.from({ length: 36 }, (_, row) => (
        <div key={row} className="pixel-line" {...PIXEL_LINE_COMPONENT}>
          {Array.from({ length: 20 }, (_, col) => (
            <div key={col} className="pixel-box">
              <div className="pixel-box-color" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
