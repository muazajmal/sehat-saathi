import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/desk", "/owner", "/patient/", "/elder/watch", "/reset"] },
    sitemap: "https://sehat-saathi-eta.vercel.app/sitemap.xml",
  };
}
