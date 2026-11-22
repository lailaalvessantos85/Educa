// Chamada pela página conta.html: cancela a cobrança recorrente.
// O aluno continua com acesso até o fim do período já pago.
import { cancelarAssinatura } from "../_shared/assinaturas.ts";
import { banco, CORS, json, mp, tratarErro, usuario } from "../_shared/servidor.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const user = await usuario(req);
    return json(await cancelarAssinatura(user.id, mp(), banco()));
  } catch (e) {
    return tratarErro(e);
  }
});
