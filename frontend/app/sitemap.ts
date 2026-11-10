import type { MetadataRoute } from "next";

const BASE = "https://sehat-saathi-eta.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["", "/app", "/patient", "/report", "/first-aid", "/elder", "/donate", "/alerts", "/hospitals/join", "/ambulance/join", "/privacy", "/terms"];
  return pages.map((p) => ({ url: BASE + p, changeFrequency: p ? "monthly" : "weekly", priority: p ? 0.7 : 1 }));
}
