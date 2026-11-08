import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/patient",
    name: "Sehat Saathi · صحت ساتھی",
    short_name: "Sehat Saathi",
    description: "Tell a doctor what's wrong in any language, see the reply, and get help to hospital.",
    start_url: "/patient?source=app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#040d0c",
    theme_color: "#040d0c",
    lang: "ur",
    dir: "auto",
    categories: ["health", "medical"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Get help", url: "/patient?source=app", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Driver page", url: "/ambulance/join", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
