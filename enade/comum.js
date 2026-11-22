// Funções usadas pela página principal e pelo gerador de cards.

// Aceita link do YouTube em qualquer formato (watch, youtu.be, shorts, embed) ou só o ID.
function ytId(valor) {
  if (!valor) return "";
  var v = String(valor).trim();
  if (/^[\w-]{11}$/.test(v)) return v;
  var m = v.match(/(?:youtu\.be\/|[?&]v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/);
  return m ? m[1] : "";
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

var PLAY_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';

var LOCK_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';

// v.youtube só vem preenchido quando o usuário pode assistir. v.tem_video diz se o vídeo já existe.
function cardHTML(v, i, progresso) {
  var id = ytId(v.youtube);
  var fg = v.tipo === "Formação Geral";
  var badge = v.tipo ? '<span class="badge ' + (fg ? "fg" : "ce") + '" title="' + esc(v.tipo) + '">' + (fg ? "FORMAÇÃO GERAL" : "ESPECÍFICA") + '</span>' : "";
  var q = '<span class="q"><small>ENADE ' + esc(v.ano) + '</small>' + (v.questao ? "Questão " + esc(v.questao) : "") + '</span>';
  var capa = v.capa ? '<img loading="lazy" src="' + esc(v.capa) + '" alt="">' : '';
  var thumb;
  if (id) {
    thumb = '<button class="thumb" type="button" data-play="' + i + '" aria-label="Assistir: ' + esc(v.titulo) + '">' +
        '<img loading="lazy" src="https://i.ytimg.com/vi/' + id + '/hqdefault.jpg" alt="">' +
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
