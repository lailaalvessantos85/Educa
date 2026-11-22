// Player com acompanhamento do vídeo + questões de treino liberadas só depois de assistir.
// O progresso é gravado no servidor (função registrar_progresso), que decide quando liberar (90%).
// As questões vêm do banco e o gabarito só chega pela função corrigir().
var Treino = (function () {
  var LIMITE = 0.9;
  var LETRAS = "ABCDE";
  var ENVIO_MS = 5000;

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

  var player = null, timer = null, timerEnvio = null, atual = null;
  var $ = function (s) { return document.querySelector(s); };

  // prog: { fracao, liberado } já salvo no servidor; aoFechar recebe o progresso atualizado
  function abrir(v, prog, aoFechar) {
    var id = ytId(v.youtube);
    atual = {
      v: v, id: id, ultimo: null, novos: {}, enviando: false, aoFechar: aoFechar,
      fracao: prog ? prog.fracao : 0, liberado: !!(prog && prog.liberado),
      qs: null, respostas: {}, corrigido: false
    };
    $("#ptitle").textContent = v.titulo;
    $("#pmeta").textContent = [v.curso, "ENADE " + v.ano + (v.questao ? ", questão " + v.questao : ""), v.tema, v.professor].filter(Boolean).join(" · ");
    $("#pdesc").textContent = v.descricao || "";
    $("#frame").innerHTML = '<div id="yt"></div>';
    renderTreino();
    $("#player").showModal();
    $("#player").scrollTop = 0;

    var esta = atual;
    carregarAPI().then(function () {
      if (atual !== esta) return;
      player = new YT.Player("yt", {
        host: "https://www.youtube-nocookie.com",
        videoId: id,
        playerVars: { autoplay: 1, rel: 0, playsinline: 1 },
        events: { onStateChange: function (e) { if (e.data === 0) marcarFim(); } }
      });
      timer = setInterval(acompanhar, 1000);
      timerEnvio = setInterval(enviar, ENVIO_MS);
    }).catch(function () {
      if (atual !== esta) return;
      $("#frame").innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0" title="' + esc(v.titulo) +
        '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
      atual.semAPI = true;
      renderTreino();
    });
  }

  // Conta cada segundo realmente reproduzido. Saltos para frente (arrastar a barra) não contam.
  function acompanhar() {
    if (!player || !player.getPlayerState || !atual) return;
    var t = player.getCurrentTime(), d = player.getDuration();
    if (d > 0) atual.duracao = d;
    if (player.getPlayerState() === 1 && atual.ultimo !== null && t > atual.ultimo && t - atual.ultimo <= 4.5) marcar(atual.ultimo, t);
    atual.ultimo = player.getPlayerState() === 1 ? t : null;
  }
  function marcar(de, ate) {
    for (var s = Math.floor(de); s < Math.floor(ate); s++) atual.novos[s] = 1;
  }
  function marcarFim() {
    if (!atual) return;
    if (atual.ultimo !== null && atual.duracao && atual.duracao - atual.ultimo <= 4.5) marcar(atual.ultimo, atual.duracao);
    atual.ultimo = null;
    enviar();
  }

  // Manda os segundos novos ao servidor; ele responde quanto já foi assistido e se liberou.
  async function enviar() {
    var a = atual;
    if (!a || a.enviando || a.liberado) return;
    var lista = Object.keys(a.novos).map(Number);
    if (!lista.length) return;
    a.enviando = true;
    a.novos = {};
    try {
      var r = await Api.registrarProgresso(a.v.id, lista, a.duracao || 0);
      a.fracao = Math.max(a.fracao, r.fracao);
      if (r.liberado && !a.liberado) {
        a.liberado = true;
        if (atual === a) { await renderTreino(); avisoLiberado(); }
      } else if (atual === a) atualizarBarra();
    } catch (e) {
      lista.forEach(function (s) { a.novos[s] = 1; }); // tenta de novo no próximo envio
      console.error(e);
    } finally { a.enviando = false; }
  }

  async function fechar() {
    clearInterval(timer); clearInterval(timerEnvio); timer = timerEnvio = null;
    var a = atual;
    if (a) { acompanhar(); await enviar(); }
    if (player && player.destroy) player.destroy();
    player = null; atual = null;
    $("#frame").innerHTML = "";
    if (a && a.aoFechar) a.aoFechar({ fracao: a.liberado ? 1 : a.fracao, liberado: a.liberado });
  }

  // ---------- Questões ----------
  async function renderTreino() {
    var box = $("#treino"), v = atual.v, n = v.n_questoes || 0;
    if (!n) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    var head = '<div class="thead"><div><span class="kicker">Treino</span><h3>Pratique o que você aprendeu</h3></div>' +
      '<span class="tcount">' + n + (n === 1 ? " questão" : " questões") + (v.tema ? " sobre " + esc(v.tema) : "") + '</span></div>';

    if (!atual.liberado) {
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

    if (!atual.qs) {
      box.innerHTML = head + '<p class="tcount">Carregando questões…</p>';
      try { atual.qs = await Api.questoes(v.id); }
      catch (e) { box.innerHTML = head + '<p class="msg erro">Não foi possível carregar as questões. Feche e abra o vídeo de novo.</p>'; return; }
    }
    var qs = atual.qs, html = head + '<ol class="qs">';
    qs.forEach(function (q, qi) {
      var disc = q.tipo === "discursiva";
      html += '<li class="tq" data-q="' + q.id + '"><div class="qnum">Questão ' + (qi + 1) + (disc ? ' <em>discursiva</em>' : '') + '</div>' +
        (q.imagem ? '<img class="qimg" src="' + esc(q.imagem) + '" alt="Figura da questão ' + (qi + 1) + '">' : '') +
        '<p class="enun">' + esc(q.enunciado) + '</p>';
      if (disc) {
        html += '<label class="sr" for="d' + q.id + '">Sua resposta</label><textarea id="d' + q.id + '" data-d="' + q.id + '" placeholder="Escreva sua resposta aqui…"></textarea>';
      } else {
        html += '<div class="alts" role="radiogroup" aria-label="Alternativas da questão ' + (qi + 1) + '">';
        (q.alternativas || []).forEach(function (a, ai) {
          var L = LETRAS[ai];
          html += '<label class="alt" data-l="' + L + '"><input type="radio" name="q' + q.id + '" value="' + L + '"><span class="L">' + L + '</span><span class="txt">' + esc(a) + '</span></label>';
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
    var f = atual.fracao, meta = Math.round(LIMITE * 100);
    bar.style.width = Math.min(100, f / LIMITE * 100) + "%";
    msg.textContent = f > 0
      ? "Você já assistiu " + Math.round(f * 100) + "% do vídeo. As questões liberam em " + meta + "%."
      : "Assista ao vídeo até o fim (pelo menos " + meta + "%) para liberar.";
  }
  function avisoLiberado() {
    var box = $("#treino");
    var el = document.createElement("div");
    el.className = "unlocked"; el.setAttribute("role", "status");
    el.textContent = "Questões liberadas! Role para baixo e pratique.";
    box.insertBefore(el, box.children[1]);
  }

  function objetivas() { return (atual.qs || []).filter(function (q) { return q.tipo !== "discursiva"; }); }
  function atualizarStatus() {
    var st = $("#tstatus"), btn = $("#vergab");
    if (!st || atual.corrigido) return;
    var obj = objetivas(), falta = obj.filter(function (q) { return !atual.respostas[q.id]; }).length;
    btn.disabled = falta > 0;
    st.textContent = falta > 0 ? "Responda " + (falta === 1 ? "mais 1 questão" : "mais " + falta + " questões") + " para ver o gabarito." : "Tudo respondido. Confira o gabarito!";
  }

  async function corrigir() {
    var btn = $("#vergab");
    btn.disabled = true; btn.textContent = "Corrigindo…";
    document.querySelectorAll("#treino textarea").forEach(function (t) { if (t.value.trim()) atual.respostas[t.dataset.d] = t.value.trim(); });
    var r;
    try { r = await Api.corrigir(atual.v.id, atual.respostas); }
    catch (e) { btn.disabled = false; btn.textContent = "Ver gabarito"; aviso(erroAmigavel(e), "erro"); return; }
    atual.corrigido = true;
    var gab = {};
    (r.gabarito || []).forEach(function (g) { gab[g.questao_id] = g; });
    atual.qs.forEach(function (q) {
      var li = document.querySelector('.tq[data-q="' + q.id + '"]'), fb = li.querySelector(".fb"), g = gab[q.id] || {};
      if (q.tipo === "discursiva") {
        li.querySelector("textarea").readOnly = true;
        fb.className = "fb info";
        fb.innerHTML = '<strong>Padrão de resposta</strong><p>' + esc(g.resposta || "—") + '</p>';
      } else {
        var certa = String(g.correta || "").toUpperCase(), marcada = atual.respostas[q.id], ok = marcada === certa;
        li.classList.add(ok ? "certo" : "errado");
        li.querySelectorAll(".alt").forEach(function (a) {
          a.querySelector("input").disabled = true;
          if (a.dataset.l === certa) a.classList.add("correta");
          else if (a.dataset.l === marcada) a.classList.add("marcada-errada");
        });
        fb.className = "fb " + (ok ? "ok" : "no");
        fb.innerHTML = '<strong>' + (ok ? "Você acertou!" : "Resposta correta: " + esc(certa)) + '</strong>' + (g.comentario ? '<p>' + esc(g.comentario) + '</p>' : '');
      }
      fb.hidden = false;
    });
    var pct = r.total ? Math.round(r.acertos / r.total * 100) : 0;
    $("#tstatus").innerHTML = r.total ? '<span class="score">' + r.acertos + ' de ' + r.total + '</span> questões objetivas certas (' + pct + '%)' : "Compare sua resposta com o padrão.";
    btn.hidden = true; $("#refazer").hidden = false;
    document.querySelector(".tq").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  document.addEventListener("change", function (e) {
    if (!atual || !e.target.matches("#treino input[type=radio]")) return;
    atual.respostas[e.target.name.slice(1)] = e.target.value;
    atualizarStatus();
  });
  document.addEventListener("click", function (e) {
    if (!atual) return;
    if (e.target.id === "vergab") corrigir();
    if (e.target.id === "refazer") {
      atual.respostas = {}; atual.corrigido = false;
      renderTreino().then(function () { $(".treino .qs").scrollIntoView({ behavior: "smooth" }); });
    }
  });

  return { abrir: abrir, fechar: fechar };
})();
