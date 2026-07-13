import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://amjhrejmcnthlrqddznw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_5KkgIxPlTNAZjqgRX9Yh3A_tqLD2hNE";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});
