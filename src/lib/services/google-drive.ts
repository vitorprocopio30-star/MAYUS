import { resolvePublicAppUrl } from "@/lib/url/resolve-public-app-url";

export const GOOGLE_DRIVE_PROVIDER = "google_drive";
export const GOOGLE_DRIVE_STATE_COOKIE = "google_drive_oauth_state";
export const DEFAULT_PROCESS_DOCUMENT_FOLDERS = [
  "01-Documentos do Cliente",
  "02-Inicial",
  "03-Contestacao",
  "04-Manifestacoes",
  "05-Decisoes e Sentencas",
  "06-Provas",
  "07-Prazos e Audiencias",
  "08-Recursos",
  "09-Pecas Finais",
] as const;
const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const GOOGLE_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_OAUTH_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_DRIVE_API_BASE_URL = "https://www.googleapis.com/drive/v3";
const GOOGLE_DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

type GoogleDriveConfig = {
  clientId: string;
  clientSecret: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export type GoogleDriveIntegrationMetadata = {
  access_token?: string | null;
  connected_email?: string | null;
  drive_root_folder_id?: string | null;
  drive_root_folder_name?: string | null;
  drive_root_folder_url?: string | null;
  expires_at?: string | null;
  scope?: string | null;
  token_type?: string | null;
};

export type GoogleDriveSanitizedState = {
  available: boolean;
  connected: boolean;
  status: string;
  connectedEmail: string | null;
  rootFolderId: string | null;
  rootFolderName: string | null;
  rootFolderUrl: string | null;
};

type GoogleDriveFileRecord = {
  id: string;
  mimeType?: string;
  name?: string;
  webViewLink?: string;
  modifiedTime?: string;
  parents?: string[];
  size?: string;
};

export type GoogleDriveFolderStructure = Record<string, { id: string; name: string; webViewLink: string }>;

type GoogleDriveIntegrationRecord = {
  api_key?: string | null;
  metadata?: Record<string, unknown> | null;
  status?: string | null;
};

function getGoogleDriveConfig(): GoogleDriveConfig {
  const clientId = String(process.env.GOOGLE_DRIVE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GOOGLE_DRIVE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "").trim();

  const hasValidClientIdShape = /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId);

  if (!clientId || !clientSecret || !hasValidClientIdShape) {
    throw new Error("GoogleDriveNotConfigured");
  }

  return { clientId, clientSecret };
}

function getGoogleTokenErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;

  const error = (data as Record<string, unknown>).error;
  const description = (data as Record<string, unknown>).error_description;

  if (typeof description === "string" && description.trim()) {
    return description.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  const nestedError = (data as Record<string, unknown>).error;
  if (nestedError && typeof nestedError === "object") {
    const nestedMessage = (nestedError as Record<string, unknown>).message;
    if (typeof nestedMessage === "string" && nestedMessage.trim()) {
      return nestedMessage.trim();
    }
  }

  return fallback;
}

function computeGoogleDriveExpiresAt(expiresIn?: number): string | null {
  if (!expiresIn || !Number.isFinite(expiresIn)) return null;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

async function exchangeGoogleToken(params: Record<string, string>): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = getGoogleDriveConfig();

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      ...params,
    }),
  });

  const data = (await response.json().catch(() => null)) as GoogleTokenResponse | null;

  if (!response.ok || !data?.access_token) {
    throw new Error(getGoogleTokenErrorMessage(data, "Falha ao autenticar com o Google Drive."));
  }

  return data;
}

function getGoogleDriveMetadata(record: GoogleDriveIntegrationRecord | null | undefined): GoogleDriveIntegrationMetadata {
  return ((record?.metadata as GoogleDriveIntegrationMetadata | null) || {}) as GoogleDriveIntegrationMetadata;
}

function sanitizeFolderNamePart(value: string): string {
  return value
    .replace(/[<>:"/\\|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isGoogleDriveConfigured(): boolean {
  try {
    getGoogleDriveConfig();
    return true;
  } catch {
    return false;
  }
}

export function getGoogleDriveRedirectUri(request: Request): string {
  return `${resolvePublicAppUrl(request)}/api/integrations/google-drive/callback`;
}

export function buildGoogleDriveAuthUrl(request: Request, state: string): string {
  const url = new URL(GOOGLE_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("client_id", getGoogleDriveConfig().clientId);
  url.searchParams.set("redirect_uri", getGoogleDriveRedirectUri(request));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("scope", GOOGLE_DRIVE_SCOPE);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGoogleDriveCode(request: Request, code: string) {
  const tokenData = await exchangeGoogleToken({
    code,
    grant_type: "authorization_code",
    redirect_uri: getGoogleDriveRedirectUri(request),
  });

  const connectedEmail = await fetchGoogleDriveConnectedEmail(tokenData.access_token!);

  return {
    accessToken: tokenData.access_token!,
    connectedEmail,
    expiresAt: computeGoogleDriveExpiresAt(tokenData.expires_in),
    refreshToken: tokenData.refresh_token || null,
    scope: tokenData.scope || null,
    tokenType: tokenData.token_type || null,
  };
}

export async function refreshGoogleDriveAccessToken(request: Request, refreshToken: string) {
  const tokenData = await exchangeGoogleToken({
    grant_type: "refresh_token",
    redirect_uri: getGoogleDriveRedirectUri(request),
    refresh_token: refreshToken,
  });

  return {
    accessToken: tokenData.access_token!,
    expiresAt: computeGoogleDriveExpiresAt(tokenData.expires_in),
    scope: tokenData.scope || null,
    tokenType: tokenData.token_type || null,
  };
}

export async function revokeGoogleDriveRefreshToken(refreshToken: string) {
  if (!refreshToken) return;

  await fetch(GOOGLE_OAUTH_REVOKE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ token: refreshToken }),
  }).catch(() => {
    // Best effort revoke only.
  });
}

export function needsGoogleDriveTokenRefresh(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return true;
  const expiresAtMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) return true;
  return expiresAtMs <= Date.now() + 60_000;
}

export async function fetchGoogleDriveConnectedEmail(accessToken: string): Promise<string | null> {
  const response = await fetch(`${GOOGLE_DRIVE_API_BASE_URL}/about?fields=user(emailAddress,displayName)`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = (await response.json().catch(() => null)) as { user?: { emailAddress?: string } } | null;

  if (!response.ok) {
    throw new Error(getGoogleTokenErrorMessage(data, "Falha ao validar a conta do Google Drive."));
  }

  return data?.user?.emailAddress || null;
}

export function extractGoogleDriveFolderId(value: string): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (/^[A-Za-z0-9_-]{10,}$/.test(raw) && !raw.includes("http")) {
    return raw;
  }

  try {
    const url = new URL(raw);
    const folderMatch = url.pathname.match(/\/folders\/([A-Za-z0-9_-]+)/);
    if (folderMatch?.[1]) {
      return folderMatch[1];
    }

    const id = url.searchParams.get("id");
    if (id) {
      return id;
    }
  } catch {
    return null;
  }

  return null;
}

export function buildGoogleDriveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

export async function fetchGoogleDriveFolder(accessToken: string, folderId: string): Promise<GoogleDriveFileRecord> {
  const response = await fetch(
    `${GOOGLE_DRIVE_API_BASE_URL}/files/${folderId}?fields=id,name,mimeType,webViewLink&supportsAllDrives=true`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const data = (await response.json().catch(() => null)) as GoogleDriveFileRecord | null;

  if (!response.ok || !data?.id) {
    throw new Error(getGoogleTokenErrorMessage(data, "Não foi possível acessar a pasta informada do Google Drive."));
  }

  if (data.mimeType !== GOOGLE_DRIVE_FOLDER_MIME_TYPE) {
    throw new Error("O link informado não aponta para uma pasta do Google Drive.");
  }

  return data;
}

export async function createGoogleDriveFolder(accessToken: string, params: { name: string; parentFolderId?: string | null }) {
  const payload: Record<string, unknown> = {
    name: params.name,
    mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
  };

  if (params.parentFolderId) {
    payload.parents = [params.parentFolderId];
  }

  const response = await fetch(
    `${GOOGLE_DRIVE_API_BASE_URL}/files?fields=id,name,webViewLink,mimeType&supportsAllDrives=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const data = (await response.json().catch(() => null)) as GoogleDriveFileRecord | null;

  if (!response.ok || !data?.id) {
    throw new Error(getGoogleTokenErrorMessage(data, "Não foi possível criar a pasta no Google Drive."));
  }

  return {
    id: data.id,
    name: data.name || params.name,
    webViewLink: data.webViewLink || buildGoogleDriveFolderUrl(data.id),
  };
}

export async function createGoogleDriveFolderStructure(
  accessToken: string,
  parentFolderId: string,
  folderNames: readonly string[] = DEFAULT_PROCESS_DOCUMENT_FOLDERS
): Promise<GoogleDriveFolderStructure> {
  const existingChildren = await listGoogleDriveChildren(accessToken, parentFolderId);
  const existingFolders = new Map(
    existingChildren
      .filter((file) => isGoogleDriveFolder(file) && file.name)
      .map((file) => [file.name as string, {
        id: file.id,
        name: file.name as string,
        webViewLink: file.webViewLink || buildGoogleDriveFolderUrl(file.id),
      }])
  );

  const structure: GoogleDriveFolderStructure = {};

  for (const folderName of folderNames) {
    const folder = existingFolders.get(folderName)
      || await createGoogleDriveFolder(accessToken, {
        name: folderName,
        parentFolderId,
      });

    structure[folderName] = folder;
  }

  return structure;
}

export async function listGoogleDriveChildren(accessToken: string, folderId: string): Promise<GoogleDriveFileRecord[]> {
  const items: GoogleDriveFileRecord[] = [];
  let pageToken: string | null = null;

  do {
    const url = new URL(`${GOOGLE_DRIVE_API_BASE_URL}/files`);
    url.searchParams.set("q", `'${folderId}' in parents and trashed = false`);
    url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime,parents,size)");
    url.searchParams.set("orderBy", "modifiedTime desc");
    url.searchParams.set("pageSize", "200");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const data = (await response.json().catch(() => null)) as { files?: GoogleDriveFileRecord[]; nextPageToken?: string } | null;

    if (!response.ok) {
      throw new Error(getGoogleTokenErrorMessage(data, "Não foi possível listar os arquivos do Google Drive."));
    }

    items.push(...(data?.files || []));
    pageToken = data?.nextPageToken || null;
  } while (pageToken);

  return items;
}

export function isGoogleDriveFolder(file: Pick<GoogleDriveFileRecord, "mimeType">): boolean {
  return file.mimeType === GOOGLE_DRIVE_FOLDER_MIME_TYPE;
}

export async function uploadGoogleDriveFile(
  accessToken: string,
  params: {
    name: string;
    mimeType: string;
    bytes: ArrayBuffer;
    parentFolderId?: string | null;
  }
) {
  const boundary = `mayus-${Date.now().toString(36)}`;
  const metadata = {
    name: params.name,
    ...(params.parentFolderId ? { parents: [params.parentFolderId] } : {}),
  };

  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${params.mimeType}\r\n\r\n`
  );
  const suffix = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([prefix, Buffer.from(params.bytes), suffix]);

  const response = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,modifiedTime,parents,size&supportsAllDrives=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  const data = (await response.json().catch(() => null)) as GoogleDriveFileRecord | null;

  if (!response.ok || !data?.id) {
    throw new Error(getGoogleTokenErrorMessage(data, "Não foi possível enviar o arquivo para o Google Drive."));
  }

  return data;
}

export async function downloadGoogleDriveFile(accessToken: string, fileId: string): Promise<Uint8Array> {
  const response = await fetch(
    `${GOOGLE_DRIVE_API_BASE_URL}/files/${fileId}?alt=media&supportsAllDrives=true`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(getGoogleTokenErrorMessage(data, "Não foi possível baixar o arquivo do Google Drive."));
  }

  return new Uint8Array(await response.arrayBuffer());
}

export function buildProcessGoogleDriveFolderName(task: {
  id?: string | null;
  title?: string | null;
  client_name?: string | null;
  process_number?: string | null;
}): string {
  const parts = [task.client_name, task.process_number, task.title]
    .map((item) => sanitizeFolderNamePart(String(item || "")))
    .filter(Boolean);

  const fallback = sanitizeFolderNamePart(task.title || "") || `Processo-${String(task.id || "").slice(0, 8) || "MAYUS"}`;
  return (parts.join(" - ") || fallback).slice(0, 180);
}

export function mergeGoogleDriveMetadata(
  currentMetadata: Record<string, unknown> | null | undefined,
  nextMetadata: GoogleDriveIntegrationMetadata
): GoogleDriveIntegrationMetadata {
  return {
    ...(currentMetadata || {}),
    ...nextMetadata,
  };
}

export function sanitizeGoogleDriveState(
  integration: GoogleDriveIntegrationRecord | null | undefined
): GoogleDriveSanitizedState {
  const metadata = getGoogleDriveMetadata(integration);
  const connected = integration?.status === "connected" && Boolean(integration?.api_key);

  return {
    available: true,
    connected,
    status: integration?.status || "disconnected",
    connectedEmail: metadata.connected_email || null,
    rootFolderId: metadata.drive_root_folder_id || null,
    rootFolderName: metadata.drive_root_folder_name || null,
    rootFolderUrl: metadata.drive_root_folder_url || null,
  };
}

export function getGoogleDriveIntegrationMetadata(record: GoogleDriveIntegrationRecord | null | undefined) {
  return getGoogleDriveMetadata(record);
}
