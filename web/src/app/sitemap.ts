import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://circlesave-mezo.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/circles", "/create", "/get-musd"].map((path) => ({
    url: `${SITE}${path}`,
    changeFrequency: path === "/circles" ? "hourly" : "weekly",
    priority: path === "" ? 1 : 0.7,
  }));
}
