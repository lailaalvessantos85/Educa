// Recebe os avisos do Mercado Pago (assinatura criada, paga, pausada, cancelada)
// e atualiza a tabela de assinaturas. Configure esta URL no painel do Mercado Pago.
import { avisoAutentico, processarAviso } from "../_shared/assinaturas.ts";
import { banco, env, mp } from "../_shared/servidor.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  try {
    const url = new URL(req.url);
    const corpo = await req.json().catch(() => ({}));
    const tipo = url.searchParams.get("type") ?? corpo.type ?? "";
    const id = String(url.searchParams.get("data.id") ?? corpo?.data?.id ?? "");

    const segredo = Deno.env.get("MP_WEBHOOK_SECRET");
    if (segredo && !(await avisoAutentico(req.headers, id, segredo))) {
      console.warn("aviso com assinatura inválida", tipo, id);
      return new Response("assinatura inválida", { status: 401 });
    }
    env("MP_ACCESS_TOKEN");
    const r = await processarAviso(tipo, id, mp(), banco());
    console.log(tipo, id, r);
    return new Response(r);
  } catch (e) {
    // Erro 500 faz o Mercado Pago tentar de novo mais tarde.
    console.error(e);
    return new Response("erro", { status: 500 });
  }
});
