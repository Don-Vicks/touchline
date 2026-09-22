export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function csrf() {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|; )tl_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1] ?? "") : "";
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const token = csrf();
  if (token) headers.set("X-CSRF-Token", token);
  const response = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new ApiError(data.error ?? "Something went wrong.", response.status);
  return data as T;
}
