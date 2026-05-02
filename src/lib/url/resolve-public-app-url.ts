const DEFAULT_PUBLIC_APP_URL = "https://mayus-premium-pro.vercel.app";
const DEFAULT_PUBLIC_APP_HOST = new URL(DEFAULT_PUBLIC_APP_URL).hostname;

function getHostname(hostOrUrl: string): string {
  try {
    return new URL(hostOrUrl.startsWith("http") ? hostOrUrl : `https://${hostOrUrl}`).hostname.toLowerCase();
  } catch {
    return hostOrUrl.split("/")[0]?.toLowerCase() || "";
  }
}

function isLocalHost(hostOrUrl: string): boolean {
  const value = getHostname(hostOrUrl);
  return value.includes("localhost") || value.includes("127.0.0.1") || value.includes("0.0.0.0");
}

function isPreviewVercelHost(hostOrUrl: string): boolean {
  const hostname = getHostname(hostOrUrl);
  return hostname.endsWith(".vercel.app") && hostname !== DEFAULT_PUBLIC_APP_HOST;
}

function isPublicHost(hostOrUrl: string): boolean {
  return Boolean(hostOrUrl.trim()) && !isLocalHost(hostOrUrl) && !isPreviewVercelHost(hostOrUrl);
}

function cleanUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function resolvePublicAppUrl(request: Request): string {
  const envUrl = String(process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (isPublicHost(envUrl)) {
    return cleanUrl(envUrl);
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  if (forwardedHost && isPublicHost(forwardedHost)) {
    return cleanUrl(`${forwardedProto}://${forwardedHost}`);
  }

  try {
    const origin = new URL(request.url).origin;
    if (origin && isPublicHost(origin)) {
      return cleanUrl(origin);
    }
  } catch {
    // ignore parse failures and fallback below
  }

  const vercelUrl = String(process.env.VERCEL_URL || "").trim();
  if (isPublicHost(vercelUrl)) {
    return cleanUrl(vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`);
  }

  return DEFAULT_PUBLIC_APP_URL;
}

export function resolvePublicAppUrlFromEnv(): string {
  const envUrl = String(process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (isPublicHost(envUrl)) return cleanUrl(envUrl);

  const vercelUrl = String(process.env.VERCEL_URL || "").trim();
  if (isPublicHost(vercelUrl)) {
    return cleanUrl(vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`);
  }

  return DEFAULT_PUBLIC_APP_URL;
}
