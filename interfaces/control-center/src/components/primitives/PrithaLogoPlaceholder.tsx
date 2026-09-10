export function PrithaLogoPlaceholder({ size = 44 }: { size?: number }) {
  return (
    <div className="pritha-logo" style={{ width: size, height: size, overflow: "hidden" }} aria-label="Pritha logo">
      <img className="pritha-logo-image" src="/pritha-logo.png" alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
    </div>
  );
}
