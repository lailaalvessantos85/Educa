// Conexão com o Supabase (login, banco de dados e funções de pagamento).
// Todas as páginas usam este arquivo; nenhuma outra parte do site fala com o banco.
var Api = (function () {
  var C = window.CONFIG || {};
  var configurado = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY && window.supabase);
  var sb = configurado ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY) : null;

  function falhou(r) {
    if (r.error) throw r.error;
    return r.data;
  }
  function exigir() {
    if (!sb) throw new Error("A plataforma ainda não foi configurada (config.js).");
  }

  // ---------- Sessão ----------
  var cache = null;
  async function estado(forcar) {
    if (cache && !forcar) return cache;
    if (!sb) return (cache = { configurado: false, user: null, perfil: null, acesso: false, assinatura: null });
    var s = (await sb.auth.getSession()).data.session;
    var user = s ? s.user : null, perfil = null, assinatura = null;
    if (user) {
      perfil = (await sb.from("perfis").select("nome, admin").eq("id", user.id).maybeSingle()).data;
      assinatura = (await sb.from("assinaturas").select("*").eq("user_id", user.id)
        .order("criado_em", { ascending: false }).limit(1).maybeSingle()).data;
      var comAcesso = (await sb.from("assinaturas").select("*").eq("user_id", user.id)
        .gt("acesso_ate", new Date().toISOString()).order("acesso_ate", { ascending: false }).limit(1).maybeSingle()).data;
      if (comAcesso && (!assinatura || assinatura.status === "pendente")) assinatura = comAcesso;
      var acesso = !!(perfil && perfil.admin) || !!comAcesso;
    }
    cache = { configurado: true, user: user, perfil: perfil, assinatura: assinatura, acesso: !!acesso,
      acessoAte: comAcesso ? comAcesso.acesso_ate : null, admin: !!(perfil && perfil.admin) };
    return cache;
  }

  async function entrar(email, senha) {
    exigir();
    falhou(await sb.auth.signInWithPassword({ email: email, password: senha }));
    cache = null;
  }
  async function cadastrar(nome, email, senha) {
    exigir();
    var d = falhou(await sb.auth.signUp({
      email: email, password: senha,
      options: { data: { nome: nome }, emailRedirectTo: urlDe("entrar.html?confirmado=1") }
    }));
    cache = null;
    return { precisaConfirmar: !d.session };
  }
  async function recuperar(email) {
    exigir();
    falhou(await sb.auth.resetPasswordForEmail(email, { redirectTo: urlDe("entrar.html?modo=nova-senha") }));
  }
  async function novaSenha(senha) {
    exigir();
    falhou(await sb.auth.updateUser({ password: senha }));
  }
  async function sair() {
    if (sb) await sb.auth.signOut();
    cache = null;
  }
  function aoMudarSessao(fn) {
    if (sb) sb.auth.onAuthStateChange(function (ev) { cache = null; fn(ev); });
  }
  function urlDe(pagina) {
    return new URL(pagina, location.href).href;
  }

  // ---------- Catálogo e conteúdo ----------
  async function catalogo() {
    if (!sb) return [];
    return falhou(await sb.from("catalogo").select("*").order("criado_em", { ascending: true }));
  }
  // Links dos vídeos que o usuário pode ver (o banco só devolve os permitidos).
  async function conteudos() {
    if (!sb) return {};
    var linhas = falhou(await sb.from("videos_conteudo").select("video_id, youtube_id"));
    var m = {};
    linhas.forEach(function (l) { m[l.video_id] = l.youtube_id; });
    return m;
  }
  async function progressos() {
    var e = await estado();
    if (!e.user) return {};
    var linhas = falhou(await sb.from("progresso").select("video_id, segundos, duracao, liberado"));
    var m = {};
    linhas.forEach(function (l) {
      m[l.video_id] = { liberado: l.liberado, fracao: l.liberado ? 1 : (l.duracao > 0 ? Math.min(1, l.segundos.length / Math.floor(l.duracao)) : 0) };
    });
    return m;
  }
  async function registrarProgresso(videoId, segundos, duracao) {
    return falhou(await sb.rpc("registrar_progresso", { p_video: videoId, p_segundos: segundos, p_duracao: duracao }));
  }
  async function questoes(videoId) {
    return falhou(await sb.from("questoes").select("id, ordem, tipo, enunciado, alternativas, imagem").eq("video_id", videoId).order("ordem"));
  }
  async function corrigir(videoId, respostas) {
    return falhou(await sb.rpc("corrigir", { p_video: videoId, p_respostas: respostas }));
  }

  // ---------- Planos e pagamento ----------
  async function planos() {
    if (!sb) return [];
    return falhou(await sb.from("planos").select("*").eq("ativo", true).order("ordem"));
  }
  async function chamarFuncao(nome, corpo) {
    exigir();
    var r = await sb.functions.invoke(nome, { body: corpo || {} });
    if (r.error) {
      var msg = "Não foi possível concluir agora. Tente novamente.";
      try { var j = await r.error.context.json(); if (j && j.erro) msg = j.erro; } catch (e) {}
      throw new Error(msg);
    }
    return r.data;
  }
  async function assinar(planoId) {
    var d = await chamarFuncao("criar-assinatura", { plano_id: planoId });
    location.href = d.url;
  }
  async function cancelar() {
    var d = await chamarFuncao("cancelar-assinatura");
    cache = null;
    return d;
  }

  // ---------- Conta ----------
  async function salvarNome(nome) {
    var e = await estado();
    falhou(await sb.from("perfis").update({ nome: nome }).eq("id", e.user.id));
    cache = null;
  }
  async function excluirConta() {
    falhou(await sb.rpc("excluir_minha_conta"));
    await sb.auth.signOut();
    cache = null;
  }

  // ---------- Administração ----------
  var admin = {
    videos: async function () { return falhou(await sb.from("videos").select("*").order("criado_em", { ascending: false })); },
    contarQuestoes: async function () {
      var l = falhou(await sb.from("questoes").select("video_id"));
      var m = {}; l.forEach(function (q) { m[q.video_id] = (m[q.video_id] || 0) + 1; }); return m;
    },
    obter: async function (id) { return falhou(await sb.rpc("admin_obter_video", { p_id: id })); },
    salvar: async function (dados) { return falhou(await sb.rpc("admin_salvar_video", { p: dados })); },
    excluir: async function (id) { falhou(await sb.from("videos").delete().eq("id", id)); },
    planos: async function () { return falhou(await sb.from("planos").select("*").order("ordem")); },
    salvarPlano: async function (p) { falhou(await sb.from("planos").upsert(p)); }
  };

  return {
    configurado: configurado, estado: estado, entrar: entrar, cadastrar: cadastrar, recuperar: recuperar,
    novaSenha: novaSenha, sair: sair, aoMudarSessao: aoMudarSessao, catalogo: catalogo, conteudos: conteudos,
    progressos: progressos, registrarProgresso: registrarProgresso, questoes: questoes, corrigir: corrigir,
    planos: planos, assinar: assinar, cancelar: cancelar, salvarNome: salvarNome, excluirConta: excluirConta, admin: admin
  };
})();

// ---------- Utilidades de interface usadas por várias páginas ----------
function brl(v) { return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function dataBR(d) { return d ? new Date(d).toLocaleDateString("pt-BR") : ""; }

// Mensagem rápida no canto da tela
function aviso(msg, tipo) {
  var el = document.getElementById("toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.className = "toast " + (tipo || "");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(aviso._t);
  aviso._t = setTimeout(function () { el.hidden = true; }, 5000);
}

// Traduz as mensagens de erro mais comuns do login
function erroAmigavel(e) {
  var m = String((e && e.message) || e || "");
  if (/Invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
  if (/Email not confirmed/i.test(m)) return "Confirme seu e-mail antes de entrar. Procure a mensagem na sua caixa de entrada (e no spam).";
  if (/already registered|already been registered/i.test(m)) return "Já existe uma conta com este e-mail. Use \"Entrar\" ou \"Esqueci minha senha\".";
  if (/Password should be at least/i.test(m)) return "A senha precisa ter pelo menos 8 caracteres.";
  if (/rate limit|too many/i.test(m)) return "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";
  if (/network|fetch/i.test(m)) return "Sem conexão com o servidor. Verifique sua internet.";
  return m || "Algo deu errado. Tente novamente.";
}

// Menu do usuário no topo (Entrar / Assinar / Minha conta)
async function montarMenuUsuario() {
  var nav = document.getElementById("usuario");
  if (!nav) return;
  var e = await Api.estado();
  if (!e.configurado) { nav.innerHTML = ""; return; }
  if (!e.user) {
    nav.innerHTML = '<a class="btn-sm ghost" href="entrar.html">Entrar</a><a class="btn-sm" href="planos.html">Assinar</a>';
    return;
  }
  var nome = (e.perfil && e.perfil.nome) || e.user.email;
  nav.innerHTML = (e.acesso ? "" : '<a class="btn-sm" href="planos.html">Assinar</a>') +
    '<details class="menu"><summary aria-label="Menu da conta"><span class="avatar">' + esc(nome.trim().charAt(0).toUpperCase()) + '</span></summary>' +
    '<div class="menu-pop"><p class="menu-nome">' + esc(nome) + '</p>' +
    '<a href="conta.html">Minha conta</a>' + (e.admin ? '<a href="admin.html">Administração</a>' : '') +
    '<button type="button" id="sairbtn">Sair</button></div></details>';
  document.getElementById("sairbtn").addEventListener("click", async function () { await Api.sair(); location.href = "index.html"; });
}

// Aviso para quando o config.js ainda não foi preenchido
function avisoConfiguracao() {
  if (Api.configurado) return;
  var b = document.createElement("div");
  b.className = "setup";
  b.innerHTML = "<strong>Plataforma ainda não conectada.</strong> Preencha o arquivo <code>config.js</code> com os dados do Supabase (veja o guia IMPLANTACAO.md).";
  document.body.prepend(b);
}
