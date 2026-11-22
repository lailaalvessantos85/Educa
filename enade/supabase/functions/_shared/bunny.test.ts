// Rodar com: deno test supabase/functions/_shared/
import { linkAssinado, sha256Hex } from "./bunny.ts";

Deno.test("link do Bunny: token = SHA256_HEX(chave + id + expira)", async () => {
  const agora = Date.UTC(2026, 10, 22, 12, 0, 0);
  const r = await linkAssinado({ biblioteca: "12345", videoId: "abcd-1", chave: "CHAVE", agora, validade: 600 });
  const expira = agora / 1000 + 600;
  if (r.expira !== expira) throw new Error("expira errado: " + r.expira);
  const esperado = await sha256Hex("CHAVE" + "abcd-1" + expira);
  const u = new URL(r.url);
  if (u.host !== "iframe.mediadelivery.net") throw new Error("host: " + u.host);
  if (u.pathname !== "/embed/12345/abcd-1") throw new Error("caminho: " + u.pathname);
  if (u.searchParams.get("token") !== esperado) throw new Error("token diferente");
  if (u.searchParams.get("expires") !== String(expira)) throw new Error("expires diferente");
});

Deno.test("sha256Hex confere com valor conhecido", async () => {
  // SHA-256 de "abc" (vetor de teste padrão)
  const h = await sha256Hex("abc");
  if (h !== "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad") throw new Error(h);
});
