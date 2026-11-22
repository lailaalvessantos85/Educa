// Testes das regras de assinatura. Rodar com: deno test supabase/functions/_shared/
import {
  type Assinatura, avisoAutentico, type Banco, calcularAcesso, cancelarAssinatura, criarAssinatura, mercadoPago,
  type Pagamento, processarAviso, statusPagamento, TOLERANCIA_DIAS,
} from "./assinaturas.ts";

function igual(a: unknown, b: unknown, msg = "") {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}\n esperado: ${JSON.stringify(b)}\n recebido: ${JSON.stringify(a)}`);
}
async function rejeita(p: Promise<unknown>, status: number) {
  try { await p; } catch (e) { igual((e as { status: number }).status, status, "status do erro"); return; }
  throw new Error("deveria ter dado erro " + status);
}

// Banco em memória
function bancoFalso(inicial: Assinatura[] = []) {
  const linhas = [...inicial];
  const planos: Record<string, { id: string; nome: string; preco: number; meses: number; ativo: boolean }> = {
    mensal: { id: "mensal", nome: "Mensal", preco: 29.9, meses: 1, ativo: true },
    semestral: { id: "semestral", nome: "Semestral", preco: 149.9, meses: 6, ativo: true },
    velho: { id: "velho", nome: "Velho", preco: 10, meses: 1, ativo: false },
  };
  const pagamentos: Pagamento[] = [];
  const db: Banco & { linhas: Assinatura[]; pagamentos: Pagamento[] } = {
    linhas, pagamentos,
    registrarPagamento: async (p) => {
      const i = pagamentos.findIndex((x) => x.mp_id === p.mp_id);
      if (i >= 0) pagamentos[i] = p; else pagamentos.push(p);
    },
    plano: async (id) => planos[id] ?? null,
    assinaturaComAcesso: async (u) => linhas.find((l) => l.user_id === u && l.acesso_ate && new Date(l.acesso_ate) > new Date()) ?? null,
    assinaturaCancelavel: async (u) => linhas.find((l) => l.user_id === u && ["ativa", "pausada", "pendente"].includes(l.status) && l.mp_preapproval_id) ?? null,
    porPreapproval: async (id) => linhas.find((l) => l.mp_preapproval_id === id) ?? null,
    inserir: async (a) => { linhas.push({ id: "id" + linhas.length, ...a } as Assinatura); },
    atualizar: async (id, d) => { Object.assign(linhas.find((l) => l.id === id)!, d); },
  };
  return db;
}

// Mercado Pago falso: registra chamadas e responde por rota
function mpFalso(rotas: Record<string, unknown>) {
  const chamadas: { metodo: string; url: string; corpo: unknown }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const caminho = url.replace("https://api.mercadopago.com", "");
    chamadas.push({ metodo: init.method!, url: caminho, corpo: init.body ? JSON.parse(init.body as string) : null });
    const chave = `${init.method} ${caminho}`;
    if (!(chave in rotas)) return new Response("não encontrado", { status: 404 });
    return new Response(JSON.stringify(rotas[chave]), { status: 200 });
  }) as unknown as typeof fetch;
  return { mp: mercadoPago("TOKEN", f), chamadas };
}

const FUTURO = "2027-03-10T12:00:00.000Z";
const mais3 = (d: string) => new Date(new Date(d).getTime() + TOLERANCIA_DIAS * 864e5).toISOString();

Deno.test("criar: plano inexistente ou inativo → 404", async () => {
  const { mp } = mpFalso({});
  await rejeita(criarAssinatura({ userId: "u1", email: "a@x", planoId: "nada", siteUrl: "https://s" }, mp, bancoFalso()), 404);
  await rejeita(criarAssinatura({ userId: "u1", email: "a@x", planoId: "velho", siteUrl: "https://s" }, mp, bancoFalso()), 404);
});

Deno.test("criar: envia dados certos ao Mercado Pago e grava pendente", async () => {
  const { mp, chamadas } = mpFalso({ "POST /preapproval": { id: "pre1", status: "pending", init_point: "https://mp/pagar" } });
  const db = bancoFalso();
  const r = await criarAssinatura({ userId: "u1", email: "a@x", planoId: "semestral", siteUrl: "https://site.com/" }, mp, db);
  igual(r, { url: "https://mp/pagar" });
  const c = chamadas[0].corpo as Record<string, any>;
  igual(c.auto_recurring, { frequency: 6, frequency_type: "months", transaction_amount: 149.9, currency_id: "BRL" });
  igual(c.external_reference, "u1:semestral");
  igual(c.back_url, "https://site.com/conta.html?retorno=mp");
  igual(c.payer_email, "a@x");
  igual(db.linhas[0].status, "pendente");
  igual(db.linhas[0].mp_preapproval_id, "pre1");
  igual(db.linhas[0].acesso_ate, null, "pendente não dá acesso");
});

Deno.test("criar: quem já tem assinatura ativa → 409", async () => {
  const { mp } = mpFalso({});
  const db = bancoFalso([{ id: "a", user_id: "u1", plano_id: "mensal", status: "ativa", mp_preapproval_id: "p", acesso_ate: FUTURO, proxima_cobranca: null }]);
  await rejeita(criarAssinatura({ userId: "u1", email: "a@x", planoId: "mensal", siteUrl: "https://s" }, mp, db), 409);
});

Deno.test("aviso: assinatura autorizada libera acesso até a próxima cobrança + tolerância", async () => {
  const { mp } = mpFalso({ "GET /preapproval/pre1": { id: "pre1", status: "authorized", next_payment_date: FUTURO } });
  const db = bancoFalso([{ id: "a", user_id: "u1", plano_id: "mensal", status: "pendente", mp_preapproval_id: "pre1", acesso_ate: null, proxima_cobranca: null }]);
  await processarAviso("subscription_preapproval", "pre1", mp, db);
  igual(db.linhas[0].status, "ativa");
  igual(db.linhas[0].acesso_ate, mais3(FUTURO));
});

Deno.test("aviso de pagamento: busca a assinatura ligada ao pagamento", async () => {
  const { mp, chamadas } = mpFalso({
    "GET /authorized_payments/777": { id: 777, preapproval_id: "pre1", status: "processed" },
    "GET /preapproval/pre1": { id: "pre1", status: "authorized", next_payment_date: FUTURO },
  });
  const db = bancoFalso([{ id: "a", user_id: "u1", plano_id: "mensal", status: "ativa", mp_preapproval_id: "pre1", acesso_ate: null, proxima_cobranca: null }]);
  igual(await processarAviso("subscription_authorized_payment", "777", mp, db), "pagamento registrado: outro");
  igual(chamadas.map((c) => c.url), ["/authorized_payments/777", "/preapproval/pre1"]);
  igual(db.linhas[0].acesso_ate, mais3(FUTURO));
});

Deno.test("aviso: cancelamento mantém o período já pago", async () => {
  const { mp } = mpFalso({ "GET /preapproval/pre1": { id: "pre1", status: "cancelled", next_payment_date: "2027-01-01T00:00:00Z" } });
  const db = bancoFalso([{ id: "a", user_id: "u1", plano_id: "mensal", status: "ativa", mp_preapproval_id: "pre1", acesso_ate: FUTURO, proxima_cobranca: null }]);
  await processarAviso("subscription_preapproval", "pre1", mp, db);
  igual(db.linhas[0].status, "cancelada");
  igual(db.linhas[0].acesso_ate, FUTURO);
});

Deno.test("acesso nunca diminui com aviso antigo chegando atrasado", () => {
  igual(calcularAcesso(FUTURO, { id: "x", status: "authorized", next_payment_date: "2026-01-01T00:00:00Z" }), FUTURO);
});

Deno.test("aviso de assinatura desconhecida: cria pela external_reference", async () => {
  const { mp } = mpFalso({ "GET /preapproval/novo": { id: "novo", status: "authorized", external_reference: "u9:semestral", next_payment_date: FUTURO } });
  const db = bancoFalso();
  await processarAviso("subscription_preapproval", "novo", mp, db);
  igual([db.linhas[0].user_id, db.linhas[0].plano_id, db.linhas[0].status], ["u9", "semestral", "ativa"]);
});

Deno.test("aviso de outro tipo é ignorado", async () => {
  const { mp, chamadas } = mpFalso({});
  igual(await processarAviso("payment", "1", mp, bancoFalso()), "ignorado: tipo payment");
  igual(chamadas.length, 0);
});

Deno.test("cancelar: sem assinatura → 404; com assinatura → cancela no MP", async () => {
  const { mp, chamadas } = mpFalso({ "PUT /preapproval/pre1": { id: "pre1", status: "cancelled" } });
  await rejeita(cancelarAssinatura("u1", mp, bancoFalso()), 404);
  const db = bancoFalso([{ id: "a", user_id: "u1", plano_id: "mensal", status: "ativa", mp_preapproval_id: "pre1", acesso_ate: FUTURO, proxima_cobranca: null }]);
  const r = await cancelarAssinatura("u1", mp, db);
  igual(chamadas[0], { metodo: "PUT", url: "/preapproval/pre1", corpo: { status: "cancelled" } });
  igual(db.linhas[0].status, "cancelada");
  igual(r.acesso_ate, FUTURO);
});

Deno.test("erro do Mercado Pago vira erro 502 (para o aviso ser reenviado)", async () => {
  const { mp } = mpFalso({});
  await rejeita(processarAviso("subscription_preapproval", "sumiu", mp, bancoFalso()), 502);
});

Deno.test("assinatura digital do aviso: aceita a válida e recusa a falsa", async () => {
  const segredo = "segredo-teste", ts = "1700000000", reqId = "req-1", id = "ABC123";
  const manifesto = `id:abc123;request-id:${reqId};ts:${ts};`;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const v1 = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(manifesto))))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  const h = (v: string) => new Headers({ "x-signature": `ts=${ts},v1=${v}`, "x-request-id": reqId });
  igual(await avisoAutentico(h(v1), id, segredo), true, "válida");
  igual(await avisoAutentico(h("0".repeat(64)), id, segredo), false, "falsa");
  igual(await avisoAutentico(new Headers(), id, segredo), false, "sem cabeçalho");
});

Deno.test("pagamento: cada cobrança vira um registro, atualizado a cada aviso", async () => {
  const rotas: Record<string, unknown> = {
    "GET /authorized_payments/900": { id: 900, preapproval_id: "pre1", status: "scheduled", transaction_amount: 29.9, date_created: "2026-11-01T10:00:00Z" },
    "GET /preapproval/pre1": { id: "pre1", status: "authorized", next_payment_date: FUTURO, auto_recurring: { transaction_amount: 29.9 } },
  };
  const { mp } = mpFalso(rotas);
  const db = bancoFalso([{ id: "a", user_id: "u1", plano_id: "mensal", status: "ativa", mp_preapproval_id: "pre1", acesso_ate: null, proxima_cobranca: null }]);
  igual(await processarAviso("subscription_authorized_payment", "900", mp, db), "pagamento registrado: agendado");
  // segundo aviso da MESMA cobrança: agora paga
  rotas["GET /authorized_payments/900"] = { id: 900, preapproval_id: "pre1", status: "processed", transaction_amount: 29.9, debit_date: "2026-11-02T10:00:00Z", payment: { id: 55, status: "approved" } };
  await processarAviso("subscription_authorized_payment", "900", mp, db);
  igual(db.pagamentos.length, 1, "não duplica");
  const p = db.pagamentos[0];
  igual([p.mp_id, p.status, p.status_mp, p.valor, p.user_id, p.plano_id, p.assinatura_id, p.data],
    ["900", "aprovado", "approved", 29.9, "u1", "mensal", "a", "2026-11-02T10:00:00Z"]);
});

Deno.test("pagamento: sem valor na cobrança, usa o valor da assinatura", async () => {
  const { mp } = mpFalso({
    "GET /authorized_payments/901": { id: 901, preapproval_id: "pre1", payment: { status: "rejected" } },
    "GET /preapproval/pre1": { id: "pre1", status: "authorized", next_payment_date: FUTURO, auto_recurring: { transaction_amount: 149.9 } },
  });
  const db = bancoFalso([{ id: "a", user_id: "u1", plano_id: "semestral", status: "ativa", mp_preapproval_id: "pre1", acesso_ate: null, proxima_cobranca: null }]);
  await processarAviso("subscription_authorized_payment", "901", mp, db);
  igual([db.pagamentos[0].valor, db.pagamentos[0].status], [149.9, "recusado"]);
});

Deno.test("situação da cobrança: tradução para português", () => {
  igual(statusPagamento({ payment: { status: "approved" } }), "aprovado");
  igual(statusPagamento({ payment: { status: "refunded" } }), "estornado");
  igual(statusPagamento({ payment: { status: "charged_back" } }), "estornado");
  igual(statusPagamento({ status: "recycling" }), "recusado");
  igual(statusPagamento({ status: "scheduled" }), "agendado");
  igual(statusPagamento({ status: "algo_novo" }), "outro");
});
