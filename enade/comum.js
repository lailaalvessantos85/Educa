// Funções usadas pela página principal e pelo gerador de cards.

// ID do vídeo no Bunny Stream (formato 0a1b2c3d-...). Aceita o ID puro ou um link que o contenha
// (página do vídeo no painel, link de embed ou de "play").
function bunnyId(valor) {
  var m = String(valor || "").match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return m ? m[0].toLowerCase() : "";
}
// Miniatura gerada pelo Bunny (precisa do "CDN Hostname" da biblioteca no config.js)
function miniatura(id) {
  var host = window.CONFIG && window.CONFIG.BUNNY_CDN_HOST;
  return id && host ? "https://" + host.replace(/^https?:\/\//, "").replace(/\/$/, "") + "/" + id + "/thumbnail.jpg" : "";
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

var PLAY_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';

var LOCK_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';

// v.bunny só vem preenchido quando o usuário pode assistir. v.tem_video diz se o vídeo já existe.
function cardHTML(v, i, progresso) {
  var id = bunnyId(v.bunny);
  var fg = v.tipo === "Formação Geral";
  var badge = v.tipo ? '<span class="badge ' + (fg ? "fg" : "ce") + '" title="' + esc(v.tipo) + '">' + (fg ? "FORMAÇÃO GERAL" : "ESPECÍFICA") + '</span>' : "";
  var q = '<span class="q"><small>ENADE ' + esc(v.ano) + '</small>' + (v.questao ? "Questão " + esc(v.questao) : "") + '</span>';
  var capa = v.capa ? '<img loading="lazy" src="' + esc(v.capa) + '" alt="">' : '';
  var thumb;
  if (id) {
    thumb = '<button class="thumb" type="button" data-play="' + i + '" aria-label="Assistir: ' + esc(v.titulo) + '">' +
        (miniatura(id) ? '<img loading="lazy" src="' + miniatura(id) + '" alt="" onerror="this.remove()">' : capa) +
        badge + q + (v.duracao ? '<span class="dur">' + esc(v.duracao) + '</span>' : '') +
        (v.gratuito ? '<span class="free">GRÁTIS</span>' : '') +
        (progresso > 0 ? '<span class="prog" aria-label="Assistido ' + Math.round(progresso * 100) + '%"><i style="width:' + Math.round(progresso * 100) + '%"></i></span>' : '') +
        '<span class="playic"><span style="color:#1A1413">' + PLAY_ICON + '</span></span>' +
      '</button>';
  } else if (v.tem_video) {
    thumb = '<button class="thumb locked" type="button" data-lock="' + i + '" aria-label="' + esc(v.titulo) + (v.gratuito ? ' (grátis com cadastro)' : ' (para assinantes)') + '">' +
        capa + badge + q + (v.duracao ? '<span class="dur">' + esc(v.duracao) + '</span>' : '') +
        (v.gratuito ? '<span class="free">GRÁTIS</span>' : '<span class="lock">' + LOCK_ICON + ' Assinantes</span>') +
      '</button>';
  } else {
    thumb = '<div class="thumb soon">' + capa + badge + q + '<span class="soonlbl">Em breve</span></div>';
  }
  var nq = v.n_questoes || 0;
  return '<article class="card">' + thumb +
    '<div class="info"><h3>' + esc(v.titulo) + '</h3>' +
    '<p class="sub"><span class="tema">' + esc(v.tema) + '</span>' + (v.professor ? ' · ' + esc(v.professor) : '') + '</p>' +
    '<p class="sub">' + esc(v.curso) + (nq ? ' · <span class="ex">' + nq + (nq === 1 ? ' exercício' : ' exercícios') + '</span>' : '') + '</p></div></article>';
}
