// Regras de assinatura com o Mercado Pago (sem dependência de banco: fácil de testar).
// Documentação: https://www.mercadopago.com.br/developers/pt/docs/subscriptions

export type Plano = { id: string; nome: string; preco: number; meses: number; ativo: boolean };
export type Assinatura = {
  id: string; user_id: string; plano_id: string; status: string;
  mp_preapproval_id: string | null; acesso_ate: string | null; proxima_cobranca: string | null;
};
export type Preapproval = {
  id: string; status: string; external_reference?: string; next_payment_date?: string; init_point?: string;
  auto_recurring?: { transaction_amount?: number };
};
export type Pagamento = {
  mp_id: string; assinatura_id: string | null; user_id: string | null; plano_id: string | null;
  valor: number | null; status: string; status_mp: string; data: string | null; dados_mp: unknown;
};

// O que as funções precisam do banco (implementado com supabase-js em db.ts).
export interface Banco {
  plano(id: string): Promise<Plano | null>;
  assinaturaComAcesso(userId: string): Promise<Assinatura | null>;
  assinaturaCancelavel(userId: string): Promise<Assinatura | null>;
  porPreapproval(mpId: string): Promise<Assinatura | null>;
  inserir(a: Partial<Assinatura>): Promise<void>;
  atualizar(id: string, dados: Partial<Assinatura>): Promise<void>;
  registrarPagamento(p: Pagamento): Promise<void>; // cria ou atualiza pelo mp_id
}

export class ErroHttp extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

// ---------- Cliente da API do Mercado Pago ----------
export function mercadoPago(token: string, f: typeof fetch = fetch) {
  async function chamar(metodo: string, caminho: string, corpo?: unknown) {
    const r = await f("https://api.mercadopago.com" + caminho, {
      method: metodo,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        ...(metodo === "POST" ? { "X-Idempotency-Key": crypto.randomUUID() } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const txt = await r.text();
    if (!r.ok) throw new ErroHttp(502, `Mercado Pago ${metodo} ${caminho}: ${r.status} ${txt.slice(0, 300)}`);
    return txt ? JSON.parse(txt) : {};
  }
  return {
    get: (c: string) => chamar("GET", c),
    post: (c: string, b: unknown) => chamar("POST", c, b),
    put: (c: string, b: unknown) => chamar("PUT", c, b),
  };
}
export type MP = ReturnType<typeof mercadoPago>;

// ---------- Regras ----------
const STATUS: Record<string, string> = {
  pending: "pendente", authorized: "ativa", paused: "pausada", cancelled: "cancelada",
};
// Dias de tolerância depois da data da próxima cobrança (o Mercado Pago tenta cobrar de novo se falhar).
export const TOLERANCIA_DIAS = 3;

// Até quando o aluno pode assistir. Só aumenta enquanto a assinatura está ativa;
// se pausar ou cancelar, ele mantém o período que já pagou.
export function calcularAcesso(atual: string | null, pre: Preapproval): string | null {
  if (pre.status !== "authorized" || !pre.next_payment_date) return atual;
  const novo = new Date(new Date(pre.next_payment_date).getTime() + TOLERANCIA_DIAS * 864e5);
  if (atual && new Date(atual) >= novo) return atual;
  return novo.toISOString();
}

export async function sincronizar(pre: Preapproval, db: Banco) {
  const status = STATUS[pre.status] ?? "pendente";
  const existente = await db.porPreapproval(pre.id);
  if (existente) {
    await db.atualizar(existente.id, {
      status,
      acesso_ate: calcularAcesso(existente.acesso_ate, pre),
      proxima_cobranca: pre.next_payment_date ?? existente.proxima_cobranca,
    });
    return;
  }
  // Assinatura que não conhecíamos: usa a referência "userId:planoId" enviada na criação.
  const [user_id, plano_id] = (pre.external_reference ?? "").split(":");
  if (!user_id || !plano_id) throw new ErroHttp(422, "assinatura sem external_reference válida: " + pre.id);
  await db.inserir({
    user_id, plano_id, status, mp_preapproval_id: pre.id,
    acesso_ate: calcularAcesso(null, pre), proxima_cobranca: pre.next_payment_date ?? null,
  });
}

// ---------- Casos de uso ----------
export async function criarAssinatura(
  p: { userId: string; email: string; planoId: string; siteUrl: string }, mp: MP, db: Banco,
) {
  const plano = await db.plano(p.planoId);
  if (!plano || !plano.ativo) throw new ErroHttp(404, "Plano não encontrado.");
  const atual = await db.assinaturaComAcesso(p.userId);
  if (atual && atual.status === "ativa") throw new ErroHttp(409, "Você já tem uma assinatura ativa.");

  const pre: Preapproval = await mp.post("/preapproval", {
    reason: `ENADE Explicado — Plano ${plano.nome}`,
    external_reference: `${p.userId}:${plano.id}`,
    payer_email: p.email,
    back_url: `${p.siteUrl.replace(/\/$/, "")}/conta.html?retorno=mp`,
    status: "pending",
    auto_recurring: {
      frequency: plano.meses,
      frequency_type: "months",
      transaction_amount: Number(plano.preco),
      currency_id: "BRL",
    },
  });
  if (!pre.init_point) throw new ErroHttp(502, "Mercado Pago não devolveu o link de pagamento.");
  await db.inserir({
    user_id: p.userId, plano_id: plano.id, status: "pendente", mp_preapproval_id: pre.id,
    acesso_ate: null, proxima_cobranca: null,
  });
  return { url: pre.init_point };
}

export async function cancelarAssinatura(userId: string, mp: MP, db: Banco) {
  const a = await db.assinaturaCancelavel(userId);
  if (!a || !a.mp_preapproval_id) throw new ErroHttp(404, "Nenhuma assinatura ativa para cancelar.");
  const pre: Preapproval = await mp.put("/preapproval/" + a.mp_preapproval_id, { status: "cancelled" });
  await db.atualizar(a.id, { status: "cancelada" });
  return { acesso_ate: a.acesso_ate, status: pre.status };
}

// Situação de uma cobrança. Lê primeiro o pagamento gerado (payment.status) e, se não houver,
// a situação da cobrança agendada. O texto original fica guardado em status_mp e o aviso completo em dados_mp.
export function statusPagamento(pag: Record<string, any>): string {
  const p = String(pag?.payment?.status ?? "").toLowerCase();
  const porPagamento: Record<string, string> = {
    approved: "aprovado", authorized: "pendente", pending: "pendente", in_process: "pendente", in_mediation: "pendente",
    rejected: "recusado", cancelled: "cancelado", refunded: "estornado", charged_back: "estornado",
  };
  if (porPagamento[p]) return porPagamento[p];
  const c = String(pag?.status ?? "").toLowerCase();
  const porCobranca: Record<string, string> = { scheduled: "agendado", recycling: "recusado", cancelled: "cancelado" };
  return porCobranca[c] ?? "outro";
}

// Avisos do Mercado Pago. Nunca confiamos no conteúdo do aviso: buscamos o dado na API.
export async function processarAviso(tipo: string, id: string, mp: MP, db: Banco) {
  if (!id) return "ignorado: sem id";
  if (tipo === "subscription_preapproval") {
    await sincronizar(await mp.get("/preapproval/" + id), db);
    return "assinatura sincronizada";
  }
  if (tipo === "subscription_authorized_payment") {
    const pag = await mp.get("/authorized_payments/" + id);
    if (!pag.preapproval_id) return "ignorado: pagamento sem assinatura";
    const pre: Preapproval = await mp.get("/preapproval/" + pag.preapproval_id);
    await sincronizar(pre, db);
    const a = await db.porPreapproval(pre.id);
    const valor = Number(pag.transaction_amount ?? pre.auto_recurring?.transaction_amount);
    await db.registrarPagamento({
      mp_id: String(pag.id ?? id),
      assinatura_id: a?.id ?? null, user_id: a?.user_id ?? null, plano_id: a?.plano_id ?? null,
      valor: Number.isFinite(valor) ? valor : null,
      status: statusPagamento(pag),
      status_mp: String(pag.payment?.status ?? pag.status ?? ""),
      data: pag.debit_date ?? pag.date_created ?? null,
      dados_mp: pag,
    });
    return "pagamento registrado: " + statusPagamento(pag);
  }
  return "ignorado: tipo " + tipo;
}

// Confere a assinatura digital do aviso (cabeçalho x-signature), configurada no painel do Mercado Pago.
export async function avisoAutentico(headers: Headers, dataId: string, segredo: string): Promise<boolean> {
  const sig = headers.get("x-signature") ?? "";
  const reqId = headers.get("x-request-id") ?? "";
  const partes = Object.fromEntries(sig.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  if (!partes.ts || !partes.v1) return false;
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  let manifesto = "";
  if (id) manifesto += `id:${id};`;
  if (reqId) manifesto += `request-id:${reqId};`;
  manifesto += `ts:${partes.ts};`;
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const assinatura = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(manifesto));
  const hex = Array.from(new Uint8Array(assinatura)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === partes.v1;
}
