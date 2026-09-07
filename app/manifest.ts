import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Scrummy",
    short_name: "Scrummy",
    description: "A small task tracker with traceability.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8f9",
    theme_color: "#3559e0",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
