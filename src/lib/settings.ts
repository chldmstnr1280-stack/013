import type { Store } from "./store/types";
import { DEFAULT_SETTINGS, type Settings } from "./types";

export async function getSettings(store: Store, userId: string): Promise<Settings> {
  const s = await store.get("settings", userId);
  return s ?? { user_id: userId, ...DEFAULT_SETTINGS, updated_at: new Date(0).toISOString() };
}
