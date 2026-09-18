import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

export default function useLogin() {
  return useMutation({
    mutationKey: ['login'],
    mutationFn: async ({ email, password }) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      return data;
    }
  });
}
