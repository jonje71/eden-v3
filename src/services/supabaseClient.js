import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-supabase-project.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';

export const isSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && 
  import.meta.env.VITE_SUPABASE_ANON_KEY &&
  !import.meta.env.VITE_SUPABASE_URL.includes('your-supabase-project')
);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Auth helper functions
export async function signUpUser(email, password, fullName) {
  if (!isSupabaseConfigured) {
    return { error: { message: 'Supabase credentials not configured in .env yet.' } };
  }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName }
    }
  });
  return { data, error };
}

export async function signInUser(email, password) {
  if (!isSupabaseConfigured) {
    return { error: { message: 'Supabase credentials not configured in .env yet.' } };
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  return { data, error };
}

export async function signOutUser() {
  if (isSupabaseConfigured) {
    await supabase.auth.signOut();
  }
}

export async function getCurrentUser() {
  if (!isSupabaseConfigured) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function updateUserPassword(newPassword) {
  if (!isSupabaseConfigured) {
    return { error: { message: 'Supabase credentials not configured in .env yet.' } };
  }
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword
  });
  return { data, error };
}

export async function signInWithGoogle() {
  if (!isSupabaseConfigured) {
    return { error: { message: 'Supabase credentials not configured in .env yet.' } };
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin
    }
  });
  return { data, error };
}

