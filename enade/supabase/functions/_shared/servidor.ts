// Ligação das regras com o Supabase (banco, login) e com as requisições HTTP.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import { type Assinatura, type Banco, ErroHttp, mercadoPago } from "./assinaturas.ts";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function env(nome: string): string {
  const v = Deno.env.get(nome);
  if (!v) throw new ErroHttp(500, `Configuração ausente: ${nome}`);
  return v;
}

export function json(dados: unknown, status = 200) {
  return new Response(JSON.stringify(dados), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

export function tratarErro(e: unknown) {
  const status = e instanceof ErroHttp ? e.status : 500;
  console.error(e);
  // Para o aluno, só mensagens simples; detalhes técnicos ficam no log da função.
  const msg = status < 500 && e instanceof Error ? e.message : "Não foi possível concluir agora. Tente novamente em instantes.";
  return json({ erro: msg }, status);
}

export function clienteAdmin(): SupabaseClient {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}

// Usuário logado que fez a chamada (pelo token enviado pelo navegador).
export async function usuario(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new ErroHttp(401, "Faça login para continuar.");
  const { data, error } = await clienteAdmin().auth.getUser(token);
  if (error || !data.user) throw new ErroHttp(401, "Sessão expirada. Entre de novo.");
  return data.user;
}

export function mp() {
  return mercadoPago(env("MP_ACCESS_TOKEN"));
}

export function banco(sb: SupabaseClient = clienteAdmin()): Banco {
  const t = () => sb.from("assinaturas");
  const um = async (q: PromiseLike<{ data: unknown; error: unknown }>) => {
    const { data, error } = await q;
    if (error) throw error;
    return (data as Assinatura | null) ?? null;
  };
  return {
    async plano(id) {
      const { data, error } = await sb.from("planos").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
    assinaturaComAcesso: (userId) =>
      um(t().select("*").eq("user_id", userId).gt("acesso_ate", new Date().toISOString())
        .order("acesso_ate", { ascending: false }).limit(1).maybeSingle()),
    assinaturaCancelavel: (userId) =>
      um(t().select("*").eq("user_id", userId).in("status", ["ativa", "pausada", "pendente"])
        .not("mp_preapproval_id", "is", null).order("criado_em", { ascending: false }).limit(1).maybeSingle()),
    porPreapproval: (mpId) => um(t().select("*").eq("mp_preapproval_id", mpId).maybeSingle()),
    async inserir(a) {
      const { error } = await t().insert(a);
      if (error) throw error;
    },
    async atualizar(id, dados) {
      const { error } = await t().update({ ...dados, atualizado_em: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
  };
}
