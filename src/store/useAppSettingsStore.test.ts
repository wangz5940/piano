import { afterEach, describe, expect, it, vi } from "vitest";
import { create_initial_settings } from "@/features/settings/storage";
import { set_settings_sync_handler, use_app_settings_store } from "./useAppSettingsStore";

afterEach(() => {
  set_settings_sync_handler(undefined);
  vi.unstubAllGlobals();
  use_app_settings_store.getState().replace_settings(create_initial_settings());
});
describe("固定学习权限的设置同步", () => {
  it("接收旧账号设置时开启学习权限并保留其他偏好", () => {
    const setItem = vi.fn();
    vi.stubGlobal("window", { localStorage: { setItem } });
    use_app_settings_store.getState().replace_settings({ ...create_initial_settings(), free_practice: false, sidebar_collapsed: true, show_fingerings: false });
    expect(use_app_settings_store.getState()).toMatchObject({ free_practice: true, sidebar_collapsed: true, show_fingerings: false });
    expect(JSON.parse(setItem.mock.calls[0][1])).toMatchObject({ free_practice: true, sidebar_collapsed: true });
  });
  it("更改功能设置时同步的学习权限始终开启", () => {
    const sync = vi.fn();
    set_settings_sync_handler(sync);
    use_app_settings_store.getState().set_feature_enabled("courses", true);
    expect(sync).toHaveBeenCalledWith(expect.objectContaining({ free_practice: true, feature_switches: expect.objectContaining({ courses: true }) }));
  });
});
