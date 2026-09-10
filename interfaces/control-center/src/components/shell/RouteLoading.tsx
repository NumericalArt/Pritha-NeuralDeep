import { LoaderCircle } from "lucide-react";

export function RouteLoading({ label }: { label: string }) {
  return <section className="route-loading" aria-busy="true" aria-label={`Loading ${label}`}>
    <div className="route-loading-heading"><LoaderCircle className="spin" size={22} /><h1>{label}</h1></div>
    <div className="route-loading-card" />
    <div className="route-loading-card short" />
  </section>;
}
