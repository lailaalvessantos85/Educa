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

var PLAY_ICON = '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="#fff"/></svg>';

function cardHTML(v, i) {
  var id = ytId(v.youtube);
  var tipoCls = v.tipo === "Formação Geral" ? "fg" : "ce";
  var thumb;
  if (id) {
    thumb =
      '<button class="thumb" type="button" data-play="' + i + '" aria-label="Assistir: ' + esc(v.titulo) + '">' +
        '<img loading="lazy" src="https://i.ytimg.com/vi/' + id + '/hqdefault.jpg" alt="">' +
        '<span class="play"><span>' + PLAY_ICON + '</span></span>' +
        (v.duracao ? '<span class="dur">' + esc(v.duracao) + '</span>' : '') +
      '</button>';
  } else {
    thumb =
      '<div class="thumb soon"><div class="ph"><strong>Q' + esc(v.questao || "?") + '</strong>' +
      '<small>ENADE ' + esc(v.ano || "") + ' · vídeo em breve</small></div></div>';
  }
  return '<article class="card">' + thumb +
    '<div class="body">' +
      '<div class="tags">' +
        (v.tipo ? '<span class="tag ' + tipoCls + '">' + esc(v.tipo) + '</span>' : '') +
        (v.tema ? '<span class="tag">' + esc(v.tema) + '</span>' : '') +
      '</div>' +
      '<h3>' + esc(v.titulo) + '</h3>' +
      (v.descricao ? '<p class="d">' + esc(v.descricao) + '</p>' : '') +
      '<div class="foot"><span><strong>' + esc(v.curso) + '</strong> · ENADE ' + esc(v.ano) +
        (v.questao ? ', questão ' + esc(v.questao) : '') + '</span><span>com ' + esc(v.professor) + '</span></div>' +
    '</div></article>';
}
