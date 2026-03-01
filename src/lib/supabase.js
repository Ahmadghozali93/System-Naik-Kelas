import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mock.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'mock-key';

// Cek apakah variabel ENV berhasil terbaca oleh Vite
console.log("Cek Supabase URL:", import.meta.env.VITE_SUPABASE_URL ? "Berhasil dimuat" : "Kosong/Gagal");
console.log("Cek Supabase Anon Key:", import.meta.env.VITE_SUPABASE_ANON_KEY ? "Berhasil dimuat" : "Kosong/Gagal");

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
