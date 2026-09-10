"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    router.replace(mobile ? "/voice" : "/agents");
  }, [router]);

  return (
    <div className="placeholder-page">
      <section className="placeholder-card glass-panel">
        <h1>Pritha Control Center</h1>
        <p>Opening the right control surface...</p>
      </section>
    </div>
  );
}
