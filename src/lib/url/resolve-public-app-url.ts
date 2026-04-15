const DEFAULT_PUBLIC_APP_URL = "https://mayus-premium-pro.vercel.app";

function isLocalHost(hostOrUrl: string): boolean {
  const value = hostOrUrl.toLowerCase();
  return value.includes("localhost") || value.includes("127.0.0.1") || value.includes("0.0.0.0");
}

function cleanUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function resolvePublicAppUrl(request: Request): string {
  const envUrl = String(process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (envUrl && !isLocalHost(envUrl)) {
    return cleanUrl(envUrl);
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  if (forwardedHost && !isLocalHost(forwardedHost)) {
    return cleanUrl(`${forwardedProto}://${forwardedHost}`);
  }

  try {
    const origin = new URL(request.url).origin;
    if (origin && !isLocalHost(origin)) {
      return cleanUrl(origin);
    }
  } catch {
    // ignore parse failures and fallback below
  }

  return DEFAULT_PUBLIC_APP_URL;
}
