import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { serveSite } from "./adapter.mjs";
import { handleQuiz } from "./handler.mjs";

Deno.serve(serveSite(handleQuiz, {
  createClient,
  env: (name: string) => Deno.env.get(name),
}));
