// Self-contained stylized map: a curved route with a car gliding toward the pin.
// No tiles, no geolocation, no network. Motion is compositor-friendly (offset-path).
export function MapScene() {
  return (
    <div className="map" role="img" aria-label="Map showing the driver approaching the pickup point">
      <svg className="map__svg" viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="route" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="oklch(72% 0.17 155)" />
            <stop offset="1" stopColor="oklch(72% 0.15 250)" />
          </linearGradient>
        </defs>
        <path className="map__road" d="M-20 180 C 80 120, 120 200, 200 140 S 340 60, 420 90" />
        <path className="map__route" d="M-20 180 C 80 120, 120 200, 200 140 S 340 60, 420 90"
          stroke="url(#route)" />
        <circle className="map__pin" cx="330" cy="86" r="7" />
      </svg>
      <span className="map__car" aria-hidden="true">🚕</span>
    </div>
  )
}
