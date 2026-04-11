import { createClient } from '@supabase/supabase-js';

// These will be populated if the user sets up Firebase/Supabase
// For now, we'll use placeholders or handle missing config gracefully
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const offlineManager = {
  saveContract: (data: any) => {
    const existing = JSON.parse(localStorage.getItem('pending_contracts') || '[]');
    const newEntry = { ...data, id: Date.now(), offline: true, createdAt: new Date().toISOString() };
    existing.push(newEntry);
    localStorage.setItem('pending_contracts', JSON.stringify(existing));
    return newEntry;
  },
  getPending: () => JSON.parse(localStorage.getItem('pending_contracts') || '[]'),
  removeSynced: (id: number) => {
    const existing = JSON.parse(localStorage.getItem('pending_contracts') || '[]');
    const filtered = existing.filter((c: any) => c.id !== id);
    localStorage.setItem('pending_contracts', JSON.stringify(filtered));
  },
  saveEmployer: (data: any) => {
    localStorage.setItem('employer_settings', JSON.stringify(data));
  },
  getEmployer: () => {
    const defaultEmployer = {
      company_name: "Domaine des Plaines",
      siret: "123 456 789 00012",
      address: "12 Route des Vignes, 33000 Bordeaux",
      msa_number: "",
      custom_clause: "Le présent contrat est conclu au titre de l'article L.1242-2 du Code du Travail."
    };
    const stored = localStorage.getItem('employer_settings');
    return stored ? JSON.parse(stored) : defaultEmployer;
  }
};
