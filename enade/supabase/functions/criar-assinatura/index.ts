// Chamada pela página planos.html: cria a assinatura no Mercado Pago e devolve o link de pagamento.
import { criarAssinatura, ErroHttp } from "../_shared/assinaturas.ts";
import { banco, CORS, env, json, mp, tratarErro, usuario } from "../_shared/servidor.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const user = await usuario(req);
    const { plano_id } = await req.json().catch(() => ({}));
    if (!plano_id) throw new ErroHttp(400, "Escolha um plano.");
    if (!user.email) throw new ErroHttp(400, "Sua conta precisa ter um e-mail.");
    const r = await criarAssinatura({ userId: user.id, email: user.email, planoId: plano_id, siteUrl: env("SITE_URL") }, mp(), banco());
    return json(r);
  } catch (e) {
    return tratarErro(e);
  }
});
