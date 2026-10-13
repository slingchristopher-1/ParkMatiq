import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Backend toggle (see .env). When off, `supabase` is null and every sync
// helper in ./sync is a no-op — the app runs exactly as before, local-only.
export const backendEnabled =
  import.meta.env.VITE_BACKEND === 'supabase' && !!url && !!key

export const supabase = backendEnabled ? createClient(url, key) : null
