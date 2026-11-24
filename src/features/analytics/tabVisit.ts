import { api_request } from "@/features/api/client";

const storage_key = "panio.tab-visit.v1";

interface tab_visit {
  session_id: string;
  path: string;
  recorded_actor?: string;
}

let current_visit: tab_visit | undefined;
let pending_request: Promise<void> | undefined;

function save_visit(visit: tab_visit) {
  try {
    sessionStorage.setItem(storage_key, JSON.stringify(visit));
  } catch {
    // In-memory deduplication still works when browser storage is unavailable.
  }
}

function get_visit(path: string): tab_visit {
  if (current_visit) return current_visit;
  try {
    const stored: tab_visit | null = JSON.parse(sessionStorage.getItem(storage_key) ?? "null");
    if (stored && /^[a-zA-Z0-9_-]{32,64}$/.test(stored.session_id) &&
      typeof stored.path === "string" && stored.path.startsWith("/") &&
      (stored.recorded_actor === undefined || typeof stored.recorded_actor === "string")) {
      current_visit = stored;
      return stored;
    }
  } catch {
    // A new tab or invalid storage starts a new visit.
  }
  const session_id = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  current_visit = { session_id, path };
  // Persist before sending, so refreshing during the request keeps its identity.
  save_visit(current_visit);
  return current_visit;
}

export async function record_tab_visit(path: string, user_id?: string): Promise<void> {
  const visit = get_visit(path);
  const actor = user_id ?? "guest";
  if (visit.recorded_actor === actor || (!user_id && visit.recorded_actor)) return;
  if (pending_request) {
    await pending_request;
    return record_tab_visit(path, user_id);
  }
  pending_request = api_request("/api/v1/access-events", {
    method: "POST",
    body: { path: visit.path, session_id: visit.session_id },
  }).then(() => {
    visit.recorded_actor = actor;
    save_visit(visit);
  });
  try {
    await pending_request;
  } finally {
    pending_request = undefined;
  }
}
