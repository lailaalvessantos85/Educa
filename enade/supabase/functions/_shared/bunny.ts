// Link de reprodução do Bunny Stream assinado e com validade curta.
// Documentação: "Embed view token authentication" do Bunny Stream.
//   token = SHA256_HEX(chave_de_token + id_do_video + expira_em_unix)
// Um link copiado deixa de funcionar quando expira.

export const VALIDADE_SEGUNDOS = 3 * 60 * 60; // 3 horas

export async function sha256Hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function linkAssinado(
  p: { biblioteca: string; videoId: string; chave: string; agora?: number; validade?: number },
) {
  const expira = Math.floor((p.agora ?? Date.now()) / 1000) + (p.validade ?? VALIDADE_SEGUNDOS);
  const token = await sha256Hex(p.chave + p.videoId + expira);
  const url = `https://iframe.mediadelivery.net/embed/${encodeURIComponent(p.biblioteca)}/${encodeURIComponent(p.videoId)}` +
    `?token=${token}&expires=${expira}&autoplay=true&preload=true`;
  return { url, expira };
}
