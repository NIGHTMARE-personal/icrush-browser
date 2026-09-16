import { supabase } from './supabase';

export interface UserSettings {
  theme: string;
  searchEngine: string;
  adblockEnabled: boolean;
  torEnabled: boolean;
}

export interface ExtensionSyncData {
  extension_id: string;
  name: string;
  version: string;
  enabled: boolean;
  path: string;
}

export const syncSettingsToCloud = async (settings: UserSettings): Promise<void> => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('browser_settings').upsert({
      user_id: user.id,
      theme: settings.theme,
      search_engine: settings.searchEngine,
      adblock_enabled: settings.adblockEnabled,
      tor_enabled: settings.torEnabled,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.warn('[Sync] Failed to push settings to cloud:', error.message);
    }
  } catch (err) {
    console.warn('[Sync] Error pushing settings to cloud:', err);
  }
};

export const syncSettingsFromCloud = async (): Promise<UserSettings | null> => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('browser_settings')
      .select('theme, search_engine, adblock_enabled, tor_enabled')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.warn('[Sync] Failed to fetch settings from cloud:', error.message);
      return null;
    }

    if (data) {
      return {
        theme: data.theme,
        searchEngine: data.search_engine,
        adblockEnabled: data.adblock_enabled,
        torEnabled: data.tor_enabled,
      };
    }
  } catch (err) {
    console.warn('[Sync] Error fetching settings from cloud:', err);
  }
  return null;
};

export const syncExtensionsToCloud = async (extensions: ExtensionSyncData[]): Promise<void> => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error: deleteError } = await supabase
      .from('browser_extensions')
      .delete()
      .eq('user_id', user.id);

    if (deleteError) {
      console.warn('[Sync] Failed to clean old extensions for sync:', deleteError.message);
    }

    if (extensions.length === 0) return;

    const records = extensions.map(ext => ({
      user_id: user.id,
      extension_id: ext.extension_id,
      name: ext.name,
      version: ext.version,
      enabled: ext.enabled,
      path: ext.path,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from('browser_extensions').insert(records);
    if (error) {
      console.warn('[Sync] Failed to sync extensions list to cloud:', error.message);
    }
  } catch (err) {
    console.warn('[Sync] Error syncing extensions to cloud:', err);
  }
};

export const syncExtensionsFromCloud = async (): Promise<ExtensionSyncData[] | null> => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('browser_extensions')
      .select('extension_id, name, version, enabled, path')
      .eq('user_id', user.id);

    if (error) {
      console.warn('[Sync] Failed to load extensions from cloud:', error.message);
      return null;
    }

    return data as ExtensionSyncData[];
  } catch (err) {
    console.warn('[Sync] Error loading extensions from cloud:', err);
  }
  return null;
};
