import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

export default function useSignUphook() {
  return useMutation({
    mutationKey: ['signup'],
    mutationFn: async ({ email, password, options }) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options,
      });
      if (error) throw error;
      return data;
    }
  });
}
