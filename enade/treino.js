// Player com acompanhamento do vídeo + questões de treino liberadas só depois de assistir.
var Treino = (function () {
  var LIMITE = 0.9;          // fração do vídeo que precisa ser assistida para liberar as questões
  var CHAVE = "enade-progresso";
  var LETRAS = "ABCDE";

  // ---------- Progresso salvo no navegador ----------
  var prog = {};
  try { prog = JSON.parse(localStorage.getItem(CHAVE) || "{}") || {}; } catch (e) {}
  function salvar() { try { localStorage.setItem(CHAVE, JSON.stringify(prog)); } catch (e) {} }
  function reg(id) { return prog[id] || (prog[id] = { s: [], d: 0, ok: false }); }
  function fracao(id) {
    var r = prog[id];
    if (!r) return 0;
    if (r.ok) return 1;
    return r.d ? Math.min(1, r.s.length / Math.floor(r.d)) : 0;
  }

  // ---------- API do YouTube (carregada só quando alguém abre um vídeo) ----------
  var apiPronta = null;
  function carregarAPI() {
    if (apiPronta) return apiPronta;
    apiPronta = new Promise(function (ok, falha) {
      if (window.YT && window.YT.Player) return ok();
      var antes = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () { if (antes) antes(); ok(); };
      var s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.onerror = falha;
      document.head.appendChild(s);
      setTimeout(falha, 12000);
    });
    apiPronta.catch(function () { apiPronta = null; });
    return apiPronta;
  }

  // ---------- Abrir o player ----------
  var player = null, timer = null, atual = null, aoFechar = null;
  var $ = function (s) { return document.querySelector(s); };

  function abrir(v, fechar) {
    var id = ytId(v.youtube);
    atual = { v: v, id: id, ultimo: null, respostas: {}, corrigido: false };
    aoFechar = fechar;
    var r = reg(id);
    $("#ptitle").textContent = v.titulo;
    $("#pmeta").textContent = [v.curso, "ENADE " + v.ano + (v.questao ? ", questão " + v.questao : ""), v.tema, v.professor].filter(Boolean).join(" · ");
    $("#pdesc").textContent = v.descricao || "";
    $("#frame").innerHTML = '<div id="yt"></div>';
    renderTreino();
    $("#player").showModal();
    $("#player").scrollTop = 0;

    carregarAPI().then(function () {
      if (!atual || atual.id !== id) return;
      player = new YT.Player("yt", {
        host: "https://www.youtube-nocookie.com",
        videoId: id,
        playerVars: { autoplay: 1, rel: 0, playsinline: 1 },
        events: { onStateChange: function (e) { if (e.data === 0) marcarFim(); } }
      });
      timer = setInterval(acompanhar, 1000);
    }).catch(function () {
      // Sem a API não há como acompanhar o vídeo: ele toca, mas as questões continuam bloqueadas.
      if (!atual || atual.id !== id) return;
      $("#frame").innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0" title="' + esc(v.titulo) +
        '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
      atual.semAPI = true;
      renderTreino();
    });
  }

  // Conta cada segundo realmente reproduzido. Saltos para frente (arrastar a barra) não contam.
  function acompanhar() {
    if (!player || !player.getPlayerState || !atual) return;
    var r = reg(atual.id), t = player.getCurrentTime(), d = player.getDuration();
    if (d > 0) r.d = d;
    if (player.getPlayerState() === 1 && atual.ultimo !== null && t > atual.ultimo && t - atual.ultimo <= 4.5) {
      adicionar(r, atual.ultimo, t);
    }
    atual.ultimo = player.getPlayerState() === 1 ? t : null;
    verificar();
  }
  function adicionar(r, de, ate) {
    var set = {};
    r.s.forEach(function (x) { set[x] = 1; });
    for (var s = Math.floor(de); s < Math.floor(ate); s++) if (!set[s]) { set[s] = 1; r.s.push(s); }
  }
  function marcarFim() {
    var r = reg(atual.id);
    if (atual.ultimo !== null && r.d && r.d - atual.ultimo <= 4.5) adicionar(r, atual.ultimo, r.d);
    atual.ultimo = null;
    verificar();
  }
  function verificar() {
    var r = reg(atual.id), antes = r.ok;
    if (!r.ok && fracao(atual.id) >= LIMITE) r.ok = true;
    salvar();
    if (r.ok && !antes) { renderTreino(); avisoLiberado(); }
    else if (!r.ok) atualizarBarra();
  }

  function fechar() {
    clearInterval(timer); timer = null;
    if (player && player.destroy) player.destroy();
    player = null; atual = null;
    $("#frame").innerHTML = "";
    salvar();
    if (aoFechar) aoFechar();
  }

  // ---------- Questões ----------
  function renderTreino() {
    var box = $("#treino"), v = atual.v, qs = v.questoes || [];
    if (!qs.length) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    var n = qs.length + (qs.length === 1 ? " questão" : " questões");
    var head = '<div class="thead"><div><span class="kicker">Treino</span><h3>Pratique o que você aprendeu</h3></div>' +
      '<span class="tcount">' + n + (v.tema ? " sobre " + esc(v.tema) : "") + '</span></div>';

    if (!reg(atual.id).ok) {
      box.innerHTML = head +
        '<div class="lock">' +
          '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>' +
          '<div><strong>As questões aparecem depois que você assistir à explicação.</strong>' +
          (atual.semAPI
            ? '<p>Não foi possível acompanhar o vídeo neste navegador. Verifique se algum bloqueador está impedindo o YouTube e abra o vídeo de novo.</p>'
            : '<p id="lockmsg"></p><div class="pbar"><i id="lockbar"></i></div>') +
          '</div></div>';
      atualizarBarra();
      return;
    }

    var html = head + '<ol class="qs">';
    qs.forEach(function (q, qi) {
      var disc = q.tipo === "discursiva" || !q.alternativas;
      html += '<li class="tq" data-q="' + qi + '"><div class="qnum">Questão ' + (qi + 1) + (disc ? ' <em>discursiva</em>' : '') + '</div>' +
        (q.imagem ? '<img class="qimg" src="' + esc(q.imagem) + '" alt="Figura da questão ' + (qi + 1) + '">' : '') +
        '<p class="enun">' + esc(q.enunciado) + '</p>';
      if (disc) {
        html += '<label class="sr" for="d' + qi + '">Sua resposta</label><textarea id="d' + qi + '" data-d="' + qi + '" placeholder="Escreva sua resposta aqui…"></textarea>';
      } else {
        html += '<div class="alts" role="radiogroup" aria-label="Alternativas da questão ' + (qi + 1) + '">';
        q.alternativas.forEach(function (a, ai) {
          var L = LETRAS[ai];
          html += '<label class="alt" data-l="' + L + '"><input type="radio" name="q' + qi + '" value="' + L + '"><span class="L">' + L + '</span><span class="txt">' + esc(a) + '</span></label>';
        });
        html += '</div>';
      }
      html += '<div class="fb" hidden></div></li>';
    });
    html += '</ol><div class="tfoot"><span id="tstatus" aria-live="polite"></span>' +
      '<button class="btn gab" type="button" id="vergab">Ver gabarito</button>' +
      '<button class="btn sec" type="button" id="refazer" hidden>Refazer</button></div>';
    box.innerHTML = html;
    atualizarStatus();
  }

  function atualizarBarra() {
    var bar = $("#lockbar"), msg = $("#lockmsg");
    if (!bar || !atual) return;
    var f = fracao(atual.id), meta = Math.round(LIMITE * 100);
    bar.style.width = Math.min(100, f / LIMITE * 100) + "%";
    msg.textContent = f > 0
      ? "Você já assistiu " + Math.round(f * 100) + "% do vídeo. As questões liberam em " + meta + "%."
      : "Assista ao vídeo até o fim (pelo menos " + meta + "%) para liberar.";
  }
  function avisoLiberado() {
    var box = $("#treino");
    var aviso = document.createElement("div");
    aviso.className = "unlocked"; aviso.setAttribute("role", "status");
    aviso.textContent = "Questões liberadas! Role para baixo e pratique.";
    box.insertBefore(aviso, box.children[1]);
  }

  function objetivas() { return (atual.v.questoes || []).map(function (q, i) { return (q.tipo === "discursiva" || !q.alternativas) ? -1 : i; }).filter(function (i) { return i >= 0; }); }
  function atualizarStatus() {
    var obj = objetivas(), feitas = obj.filter(function (i) { return atual.respostas[i]; }).length;
    var st = $("#tstatus"), btn = $("#vergab");
    if (!st || atual.corrigido) return;
    var falta = obj.length - feitas;
    btn.disabled = falta > 0;
    st.textContent = falta > 0 ? "Responda " + (falta === 1 ? "mais 1 questão" : "mais " + falta + " questões") + " para ver o gabarito." : "Tudo respondido. Confira o gabarito!";
  }

  function corrigir() {
    var qs = atual.v.questoes, acertos = 0, obj = objetivas();
    atual.corrigido = true;
    qs.forEach(function (q, qi) {
      var li = document.querySelector('.tq[data-q="' + qi + '"]'), fb = li.querySelector(".fb");
      if (q.tipo === "discursiva" || !q.alternativas) {
        li.querySelector("textarea").readOnly = true;
        fb.className = "fb info";
        fb.innerHTML = '<strong>Padrão de resposta</strong><p>' + esc(q.resposta || "—") + '</p>';
      } else {
        var certa = String(q.correta || "").toUpperCase().trim(), marcada = atual.respostas[qi];
        var ok = marcada === certa; if (ok) acertos++;
        li.classList.add(ok ? "certo" : "errado");
        li.querySelectorAll(".alt").forEach(function (a) {
          a.querySelector("input").disabled = true;
          if (a.dataset.l === certa) a.classList.add("correta");
          else if (a.dataset.l === marcada) a.classList.add("marcada-errada");
        });
        fb.className = "fb " + (ok ? "ok" : "no");
        fb.innerHTML = '<strong>' + (ok ? "Você acertou!" : "Resposta correta: " + esc(certa)) + '</strong>' +
          (q.comentario ? '<p>' + esc(q.comentario) + '</p>' : '');
      }
      fb.hidden = false;
    });
    var pct = obj.length ? Math.round(acertos / obj.length * 100) : 0;
    $("#tstatus").innerHTML = obj.length ? '<span class="score">' + acertos + ' de ' + obj.length + '</span> questões objetivas certas (' + pct + '%)' : "Compare sua resposta com o padrão.";
    $("#vergab").hidden = true; $("#refazer").hidden = false;
    document.querySelector('.tq[data-q="0"]').scrollIntoView({ behavior: "smooth", block: "start" });
  }

  document.addEventListener("change", function (e) {
    if (!atual || !e.target.matches('#treino input[type=radio]')) return;
    atual.respostas[+e.target.name.slice(1)] = e.target.value;
    atualizarStatus();
  });
  document.addEventListener("click", function (e) {
    if (!atual) return;
    if (e.target.id === "vergab") corrigir();
    if (e.target.id === "refazer") { atual.respostas = {}; atual.corrigido = false; renderTreino(); $(".treino .qs").scrollIntoView({ behavior: "smooth" }); }
  });

  return { abrir: abrir, fechar: fechar, fracao: fracao };
})();
