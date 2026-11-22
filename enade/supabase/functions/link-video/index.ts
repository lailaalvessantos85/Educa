// Chamada quando o aluno abre um vídeo: confere no banco se ele pode assistir
// e devolve um link do Bunny Stream assinado, que expira em poucas horas.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { ErroHttp } from "../_shared/assinaturas.ts";
import { linkAssinado } from "../_shared/bunny.ts";
import { CORS, env, json, tratarErro } from "../_shared/servidor.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth) throw new ErroHttp(401, "Faça login para assistir.");
    const { video_id } = await req.json().catch(() => ({}));
    if (!Number.isInteger(video_id)) throw new ErroHttp(400, "Vídeo inválido.");

    // Consulta feita COM o login do aluno: as regras do banco (RLS) só devolvem
    // o vídeo se ele tiver assinatura ativa (ou se o vídeo for grátis).
    const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { data, error } = await sb.from("videos_conteudo").select("bunny_id").eq("video_id", video_id).maybeSingle();
    if (error) throw error;
    if (!data) throw new ErroHttp(403, "Este vídeo é para assinantes.");

    // Histórico de acessos (guardado por 2 anos). Uma falha aqui não impede o aluno de assistir.
    const reg = await sb.rpc("registrar_acesso", { p_tipo: "video", p_video: video_id });
    if (reg.error) console.error("registrar_acesso", reg.error);

    return json(await linkAssinado({
      biblioteca: env("BUNNY_LIBRARY_ID"),
      videoId: data.bunny_id,
      chave: env("BUNNY_TOKEN_KEY"),
    }));
  } catch (e) {
    return tratarErro(e);
  }
});
