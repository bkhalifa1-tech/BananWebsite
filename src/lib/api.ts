export type Theme =
  | "forest"
  | "ocean"
  | "lavender"
  | "rose"
  | "ember"
  | "midnight";
export type Preferences = {
  theme: Theme;
  mode: "light" | "dark" | "system";
  language: "ar" | "en";
  track: "semester" | "personal";
  onboarded: boolean;
};
export type Account = {
  user: { id: string; name: string; email: string; emailVerified: boolean };
  emailDelivery: "local" | "email" | "unavailable";
  preferences: Preferences;
};
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
function dataChanged(path: string, method: string) {
  if (method !== "GET" && typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent("study-data-changed", { detail: { path, method } }),
    );
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Study-Client": "web" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) {
    dataChanged(path, method);
    return undefined as T;
  }
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(data.error ?? "Request failed.", response.status);
  dataChanged(path, method);
  return data;
}
export const themes: { id: Theme; label: string; ar: string; color: string }[] =
  [
    { id: "forest", label: "Forest", ar: "الغابة", color: "#216348" },
    { id: "ocean", label: "Ocean", ar: "المحيط", color: "#286fb0" },
    { id: "lavender", label: "Lavender", ar: "الخزامى", color: "#7960b0" },
    { id: "rose", label: "Rose", ar: "الورد", color: "#b94c72" },
    { id: "ember", label: "Ember", ar: "الجمر", color: "#b55c32" },
    { id: "midnight", label: "Midnight", ar: "منتصف الليل", color: "#414e9c" },
  ];

export async function uploadFile<T>(path: string, data: FormData): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "X-Study-Client": "web" },
    body: data,
  });
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(result.error ?? "Upload failed.", response.status);
  dataChanged(path, "POST");
  return result;
}
