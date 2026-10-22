"use client";
import { useEffect, useRef, useState } from "react";

/** Google map iframe, mounted only once its block is within one viewport of the screen, so the page top loads no map. */
export function MapEmbed({ src, title, className }: { src: string; title: string; className: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        setNear(true);
        io.disconnect();
      },
      { rootMargin: "100% 0px" },
    );
    io.observe(ref.current!);
    return () => io.disconnect();
  }, []);

  return <div ref={ref} className={className}>{near && <iframe src={src} title={title} loading="lazy" />}</div>;
}
