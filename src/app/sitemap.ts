import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://www.tradevion.com", lastModified: new Date() },
    { url: "https://www.tradevion.com/upload" },
    { url: "https://www.tradevion.com/dashboard" },
    { url: "https://www.tradevion.com/trades" },
    { url: "https://www.tradevion.com/positions" },
    { url: "https://www.tradevion.com/performance" },
    { url: "https://www.tradevion.com/calendar" },
  ];
}
