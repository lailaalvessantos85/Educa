-- =====================================================================
--  ENADE Explicado — banco de dados (Supabase / PostgreSQL)
--  Como usar: no painel do Supabase, abra "SQL Editor", cole este
--  arquivo inteiro e clique em "Run". Pode rodar de novo sem problema.
--
--  Regra geral de segurança (Row Level Security):
--   • Catálogo (títulos, cursos, temas) e planos: qualquer visitante vê.
--   • Link do vídeo e questões: só quem tem assinatura ativa.
--   • Gabarito: ninguém lê direto; só sai pela função corrigir(),
--     depois que o aluno assistiu ao vídeo.
--   • Assinaturas: só o servidor (webhook do Mercado Pago) altera.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Perfis (um por conta criada)
-- ---------------------------------------------------------------------
create table if not exists public.perfis (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null default '',
  admin       boolean not null default false,
  criado_em   timestamptz not null default now()
);

create or replace function public.criar_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.criar_perfil();

-- Admin só vale com verificação em duas etapas concluída nesta sessão (aal2).
-- Sem o código do aplicativo autenticador, a conta de admin funciona como a de um aluno comum.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select admin from public.perfis where id = auth.uid()), false)
     and coalesce(auth.jwt()->>'aal', '') = 'aal2';
$$;

-- ---------------------------------------------------------------------
-- Planos de assinatura
-- ---------------------------------------------------------------------
create table if not exists public.planos (
  id          text primary key,                         -- ex.: 'mensal'
  nome        text not null,
  descricao   text not null default '',
  preco       numeric(10,2) not null check (preco > 0), -- valor cobrado a cada ciclo
  meses       int not null check (meses in (1, 3, 6, 12)), -- de quantos em quantos meses cobra
  beneficios  text[] not null default '{}',
  destaque    boolean not null default false,
  ativo       boolean not null default true,
  ordem       int not null default 0
);

-- ---------------------------------------------------------------------
-- Assinaturas (escritas só pelo servidor)
-- ---------------------------------------------------------------------
create table if not exists public.assinaturas (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users(id) on delete set null, -- fica vazio se a conta for excluída (registro fiscal anonimizado)
  plano_id           text not null references public.planos(id),
  status             text not null default 'pendente'
                     check (status in ('pendente', 'ativa', 'pausada', 'cancelada')),
  mp_preapproval_id  text unique,
  acesso_ate         timestamptz,       -- até quando o aluno pode assistir
  proxima_cobranca   timestamptz,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);
create index if not exists assinaturas_user_idx on public.assinaturas(user_id);
-- (para bancos criados com a versão anterior deste arquivo)
alter table public.assinaturas alter column user_id drop not null;
alter table public.assinaturas drop constraint if exists assinaturas_user_id_fkey;
alter table public.assinaturas add constraint assinaturas_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

-- Tem acesso = assinatura com acesso_ate no futuro (ou é admin).
-- Quem cancela continua assistindo até o fim do período já pago.
create or replace function public.tem_acesso()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    public.is_admin() or exists (
      select 1 from public.assinaturas
      where user_id = auth.uid() and acesso_ate > now()
    )
  );
$$;

-- ---------------------------------------------------------------------
-- Catálogo de vídeos (público) e conteúdo protegido
-- ---------------------------------------------------------------------
create table if not exists public.videos (
  id          bigint generated always as identity primary key,
  titulo      text not null,
  curso       text not null,
  ano         int,
  questao     int,
  tipo        text not null default 'Componente Específico'
              check (tipo in ('Formação Geral', 'Componente Específico')),
  tema        text not null default '',
  professor   text not null default '',
  duracao     text not null default '',      -- ex.: '6:40'
  descricao   text not null default '',
  capa        text not null default '',      -- imagem pública opcional (não use a miniatura do YouTube)
  destaque    boolean not null default false,
  gratuito    boolean not null default false, -- vídeo de amostra: qualquer pessoa logada assiste
  publicado   boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- ID do vídeo no Bunny Stream. Só quem pode assistir lê; o link de reprodução
-- é gerado pela função link-video, assinado e com validade curta.
create table if not exists public.videos_conteudo (
  video_id    bigint primary key references public.videos(id) on delete cascade,
  bunny_id    text not null check (bunny_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);

create table if not exists public.questoes (
  id           bigint generated always as identity primary key,
  video_id     bigint not null references public.videos(id) on delete cascade,
  ordem        int not null default 0,
  tipo         text not null default 'objetiva' check (tipo in ('objetiva', 'discursiva')),
  enunciado    text not null,
  alternativas jsonb not null default '[]',
  imagem       text not null default ''
);
create index if not exists questoes_video_idx on public.questoes(video_id, ordem);

create table if not exists public.gabaritos (
  questao_id  bigint primary key references public.questoes(id) on delete cascade,
  correta     text not null default '',   -- letra (objetiva)
  comentario  text not null default '',
  resposta    text not null default ''    -- padrão de resposta (discursiva)
);

-- Pode assistir a um vídeo específico?
create or replace function public.pode_assistir(p_video bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select public.tem_acesso() or (
    auth.uid() is not null and exists (select 1 from public.videos where id = p_video and gratuito and publicado)
  );
$$;

-- Catálogo público: metadados + quantidade de questões (sem link do vídeo e sem gabarito).
drop view if exists public.catalogo;
create view public.catalogo
with (security_invoker = false) as
  select v.id, v.titulo, v.curso, v.ano, v.questao, v.tipo, v.tema, v.professor,
         v.duracao, v.descricao, v.capa, v.destaque, v.gratuito, v.criado_em,
         (select count(*) from public.questoes q where q.video_id = v.id)::int as n_questoes,
         exists (select 1 from public.videos_conteudo c where c.video_id = v.id) as tem_video
  from public.videos v
  where v.publicado;

-- ---------------------------------------------------------------------
-- Progresso nos vídeos e tentativas nas questões
-- ---------------------------------------------------------------------
create table if not exists public.progresso (
  user_id       uuid not null references auth.users(id) on delete cascade,
  video_id      bigint not null references public.videos(id) on delete cascade,
  segundos      int[] not null default '{}',   -- segundos do vídeo efetivamente assistidos
  duracao       numeric not null default 0,
  liberado      boolean not null default false,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, video_id)
);

create table if not exists public.tentativas (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  video_id   bigint not null references public.videos(id) on delete cascade,
  respostas  jsonb not null,
  acertos    int not null,
  total      int not null,
  criado_em  timestamptz not null default now()
);

-- "6:40" -> 400 segundos (0 se não der para ler)
create or replace function public.duracao_segundos(t text)
returns int language sql immutable as $$
  select case
    when t ~ '^\d+:\d{2}:\d{2}$' then split_part(t,':',1)::int*3600 + split_part(t,':',2)::int*60 + split_part(t,':',3)::int
    when t ~ '^\d+:\d{2}$' then split_part(t,':',1)::int*60 + split_part(t,':',2)::int
    else 0 end;
$$;

-- O navegador envia os segundos assistidos; o servidor junta e decide se libera (90%).
create or replace function public.registrar_progresso(p_video bigint, p_segundos int[], p_duracao numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_dur numeric;
  v_seg int[];
  v_lib boolean;
begin
  if not public.pode_assistir(p_video) then
    raise exception 'sem acesso a este vídeo' using errcode = '42501';
  end if;
  -- usa a maior duração entre a informada pelo player e a cadastrada no vídeo
  select greatest(coalesce(p_duracao, 0), public.duracao_segundos(duracao)) into v_dur
    from public.videos where id = p_video;

  insert into public.progresso as pr (user_id, video_id, segundos, duracao)
  values (auth.uid(), p_video, '{}', v_dur)
  on conflict (user_id, video_id) do nothing;

  select array(
    select distinct s from unnest(pr.segundos || coalesce(p_segundos, '{}')) s
    where s >= 0 and s <= v_dur order by s
  ) into v_seg
  from public.progresso pr where pr.user_id = auth.uid() and pr.video_id = p_video;

  update public.progresso pr
     set segundos = v_seg,
         duracao = greatest(pr.duracao, v_dur),
         liberado = pr.liberado or (v_dur > 0 and cardinality(v_seg) >= 0.9 * floor(v_dur)),
         atualizado_em = now()
   where pr.user_id = auth.uid() and pr.video_id = p_video
  returning pr.liberado into v_lib;

  return jsonb_build_object('fracao', case when v_dur > 0 then least(1, cardinality(v_seg) / floor(v_dur)) else 0 end,
                            'liberado', v_lib);
end $$;

-- Corrige as respostas e devolve o gabarito (só se o vídeo foi assistido).
-- p_respostas: {"<id da questão>": "B", ...}
create or replace function public.corrigir(p_video bigint, p_respostas jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_acertos int;
  v_total int;
begin
  if not public.pode_assistir(p_video) then
    raise exception 'sem acesso a este vídeo' using errcode = '42501';
  end if;
  if not public.is_admin() and not exists (
    select 1 from public.progresso where user_id = auth.uid() and video_id = p_video and liberado
  ) then
    raise exception 'assista ao vídeo para ver o gabarito' using errcode = '42501';
  end if;

  select count(*) filter (where upper(coalesce(p_respostas->>q.id::text, '')) = upper(g.correta)),
         count(*)
    into v_acertos, v_total
    from public.questoes q join public.gabaritos g on g.questao_id = q.id
   where q.video_id = p_video and q.tipo = 'objetiva';

  insert into public.tentativas (user_id, video_id, respostas, acertos, total)
  values (auth.uid(), p_video, coalesce(p_respostas, '{}'), v_acertos, v_total);

  return jsonb_build_object(
    'acertos', v_acertos,
    'total', v_total,
    'gabarito', coalesce((
      select jsonb_agg(jsonb_build_object('questao_id', q.id, 'correta', g.correta,
                                          'comentario', g.comentario, 'resposta', g.resposta) order by q.ordem)
        from public.questoes q join public.gabaritos g on g.questao_id = q.id
       where q.video_id = p_video), '[]'::jsonb));
end $$;

-- Excluir a própria conta (LGPD). Apaga perfil, progresso, respostas e acessos.
-- Assinaturas, pagamentos e eventos ficam guardados SEM identificar a pessoa
-- (o vínculo com a conta fica vazio), porque registros de cobrança são exigidos pela lei fiscal.
create or replace function public.excluir_minha_conta()
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------
-- Funções de administração (página admin.html)
-- ---------------------------------------------------------------------
-- Salva um vídeo com suas questões e gabaritos de uma vez.
-- (função interna: ninguém chama direto; o painel usa admin_salvar_video, que confere se é admin)
create or replace function public.salvar_video_interno(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint := nullif(p->>'id', '')::bigint;
  q jsonb;
  v_q bigint;
  i int := 0;
begin

  if v_id is null then
    insert into public.videos (titulo, curso, ano, questao, tipo, tema, professor, duracao, descricao, capa, destaque, gratuito, publicado)
    values (p->>'titulo', p->>'curso', nullif(p->>'ano','')::int, nullif(p->>'questao','')::int,
            coalesce(nullif(p->>'tipo',''), 'Componente Específico'), coalesce(p->>'tema',''), coalesce(p->>'professor',''),
            coalesce(p->>'duracao',''), coalesce(p->>'descricao',''), coalesce(p->>'capa',''),
            coalesce((p->>'destaque')::boolean, false), coalesce((p->>'gratuito')::boolean, false),
            coalesce((p->>'publicado')::boolean, true))
    returning id into v_id;
  else
    update public.videos set
      titulo = p->>'titulo', curso = p->>'curso', ano = nullif(p->>'ano','')::int, questao = nullif(p->>'questao','')::int,
      tipo = coalesce(nullif(p->>'tipo',''), 'Componente Específico'), tema = coalesce(p->>'tema',''),
      professor = coalesce(p->>'professor',''), duracao = coalesce(p->>'duracao',''), descricao = coalesce(p->>'descricao',''),
      capa = coalesce(p->>'capa',''), destaque = coalesce((p->>'destaque')::boolean, false),
      gratuito = coalesce((p->>'gratuito')::boolean, false), publicado = coalesce((p->>'publicado')::boolean, true)
    where id = v_id;
  end if;

  if coalesce(p->>'bunny_id', '') <> '' then
    insert into public.videos_conteudo (video_id, bunny_id) values (v_id, lower(p->>'bunny_id'))
    on conflict (video_id) do update set bunny_id = excluded.bunny_id;
  else
    delete from public.videos_conteudo where video_id = v_id;
  end if;

  delete from public.questoes where video_id = v_id;
  for q in select * from jsonb_array_elements(coalesce(p->'questoes', '[]'::jsonb)) loop
    i := i + 1;
    insert into public.questoes (video_id, ordem, tipo, enunciado, alternativas, imagem)
    values (v_id, i, coalesce(nullif(q->>'tipo',''), 'objetiva'), q->>'enunciado',
            coalesce(q->'alternativas', '[]'::jsonb), coalesce(q->>'imagem',''))
    returning id into v_q;
    insert into public.gabaritos (questao_id, correta, comentario, resposta)
    values (v_q, upper(coalesce(q->>'correta','')), coalesce(q->>'comentario',''), coalesce(q->>'resposta',''));
  end loop;

  return v_id;
end $$;

create or replace function public.admin_salvar_video(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'apenas administradores' using errcode = '42501'; end if;
  return public.salvar_video_interno(p);
end $$;

-- Carrega um vídeo completo para edição.
create or replace function public.admin_obter_video(p_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'apenas administradores' using errcode = '42501'; end if;
  return (
    select to_jsonb(v) || jsonb_build_object(
      'bunny_id', (select bunny_id from public.videos_conteudo where video_id = v.id),
      'questoes', coalesce((
        select jsonb_agg(jsonb_build_object('tipo', q.tipo, 'enunciado', q.enunciado, 'alternativas', q.alternativas,
               'imagem', q.imagem, 'correta', g.correta, 'comentario', g.comentario, 'resposta', g.resposta) order by q.ordem)
          from public.questoes q left join public.gabaritos g on g.questao_id = q.id
         where q.video_id = v.id), '[]'::jsonb))
    from public.videos v where v.id = p_id);
end $$;


-- ---------------------------------------------------------------------
-- HISTÓRICOS
-- ---------------------------------------------------------------------
-- Cada cobrança da assinatura (um registro por cobrança, atualizado a cada aviso do Mercado Pago)
create table if not exists public.pagamentos (
  id             bigint generated always as identity primary key,
  mp_id          text not null unique,               -- id da cobrança no Mercado Pago (authorized_payment)
  assinatura_id  uuid references public.assinaturas(id) on delete set null,
  user_id        uuid references auth.users(id) on delete set null,
  plano_id       text,
  valor          numeric(10,2),
  status         text not null default 'outro'
                 check (status in ('aprovado', 'recusado', 'pendente', 'estornado', 'cancelado', 'agendado', 'outro')),
  status_mp      text not null default '',           -- situação exatamente como veio do Mercado Pago
  data           timestamptz,                        -- data da cobrança
  dados_mp       jsonb not null default '{}',        -- aviso completo, para conferência
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index if not exists pagamentos_user_idx on public.pagamentos(user_id, data desc);
create index if not exists pagamentos_data_idx on public.pagamentos(data);

-- Cada mudança da assinatura: criada, ativada, renovada, pausada, cancelada, reativada
create table if not exists public.assinatura_eventos (
  id               bigint generated always as identity primary key,
  assinatura_id    uuid references public.assinaturas(id) on delete set null,
  user_id          uuid references auth.users(id) on delete set null,
  plano_id         text,
  evento           text not null,
  status_anterior  text,
  status_novo      text,
  acesso_ate       timestamptz,
  criado_em        timestamptz not null default now()
);
create index if not exists eventos_user_idx on public.assinatura_eventos(user_id, criado_em desc);
create index if not exists eventos_data_idx on public.assinatura_eventos(criado_em);

create or replace function public.registrar_evento_assinatura()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_evento text;
begin
  if tg_op = 'INSERT' then
    v_evento := case when new.status = 'ativa' then 'ativada' else 'criada' end;
  elsif new.status is distinct from old.status then
    v_evento := case
      when new.status = 'ativa' and old.status = 'pendente' then 'ativada'
      when new.status = 'ativa' then 'reativada'
      when new.status = 'pausada' then 'pausada'
      when new.status = 'cancelada' then 'cancelada'
      else new.status end;
  elsif new.status = 'ativa' and new.acesso_ate > coalesce(old.acesso_ate, '-infinity') then
    v_evento := 'renovada';
  else
    return new;
  end if;
  insert into public.assinatura_eventos (assinatura_id, user_id, plano_id, evento, status_anterior, status_novo, acesso_ate)
  values (new.id, new.user_id, new.plano_id, v_evento, case when tg_op = 'UPDATE' then old.status end, new.status, new.acesso_ate);
  return new;
end $$;
drop trigger if exists ao_mudar_assinatura on public.assinaturas;
create trigger ao_mudar_assinatura after insert or update on public.assinaturas
  for each row execute function public.registrar_evento_assinatura();

-- Acessos: logins e vídeos abertos. Guardados por 2 anos.
create table if not exists public.acessos (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  tipo       text not null check (tipo in ('login', 'video')),
  video_id   bigint references public.videos(id) on delete set null,
  criado_em  timestamptz not null default now()
);
create index if not exists acessos_user_idx on public.acessos(user_id, criado_em desc);
create index if not exists acessos_video_idx on public.acessos(video_id, criado_em);
create index if not exists acessos_data_idx on public.acessos(criado_em);

create or replace function public.registrar_acesso(p_tipo text, p_video bigint default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'não autenticado' using errcode = '42501'; end if;
  if p_tipo = 'video' and not public.pode_assistir(p_video) then
    raise exception 'sem acesso a este vídeo' using errcode = '42501';
  end if;
  insert into public.acessos (user_id, tipo, video_id)
  values (auth.uid(), p_tipo, case when p_tipo = 'video' then p_video end);
end $$;

create or replace function public.limpar_acessos_antigos()
returns int language sql security definer set search_path = public as $$
  with apagados as (delete from public.acessos where criado_em < now() - interval '2 years' returning 1)
  select count(*)::int from apagados;
$$;

-- Limpeza automática todo dia às 4h17 (UTC). Precisa da extensão pg_cron.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('limpar-acessos', '17 4 * * *', 'select public.limpar_acessos_antigos()');
exception when others then
  raise notice 'Limpeza automática NÃO agendada (pg_cron indisponível: %). Ative "pg_cron" em Database > Extensions e rode este arquivo de novo.', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- RELATÓRIOS (administração)
-- ---------------------------------------------------------------------
create or replace function public.admin_relatorio()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  inicio_mes timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  if not public.is_admin() then raise exception 'apenas administradores' using errcode = '42501'; end if;
  return jsonb_build_object(
    'ativos', (select count(distinct user_id) from public.assinaturas where acesso_ate > now() and user_id is not null),
    'por_plano', coalesce((select jsonb_object_agg(plano_id, n) from (
        select plano_id, count(distinct user_id) n from public.assinaturas
        where acesso_ate > now() and status = 'ativa' and user_id is not null group by plano_id) x), '{}'::jsonb),
    'pendentes', (select count(*) from public.assinaturas where status = 'pendente' and criado_em > now() - interval '30 days'),
    'cadastros_mes', (select count(*) from public.perfis where criado_em >= inicio_mes),
    'cancelamentos_mes', (select count(*) from public.assinatura_eventos where evento = 'cancelada' and criado_em >= inicio_mes),
    'novas_mes', (select count(*) from public.assinatura_eventos where evento = 'ativada' and criado_em >= inicio_mes),
    'receita_mes', (select coalesce(sum(valor), 0) from public.pagamentos where status = 'aprovado' and data >= inicio_mes),
    'receita_meses', (select jsonb_agg(jsonb_build_object('mes', to_char(m, 'YYYY-MM'), 'valor', coalesce(v, 0)) order by m) from (
        select m, (select sum(valor) from public.pagamentos p
                   where p.status = 'aprovado' and p.data >= (m at time zone 'America/Sao_Paulo')
                     and p.data < ((m + interval '1 month') at time zone 'America/Sao_Paulo')) v
        from generate_series(date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '5 months',
                             date_trunc('month', now() at time zone 'America/Sao_Paulo'), interval '1 month') m) x),
    'videos_top', coalesce((select jsonb_agg(x order by x.acessos desc) from (
        select v.id, v.titulo, v.curso, count(*)::int acessos, count(distinct a.user_id)::int alunos
        from public.acessos a join public.videos v on v.id = a.video_id
        where a.tipo = 'video' and a.criado_em > now() - interval '30 days'
        group by v.id, v.titulo, v.curso order by count(*) desc limit 10) x), '[]'::jsonb),
    'gerado_em', now()
  );
end $$;

-- Histórico completo de um aluno, buscado pelo e-mail
create or replace function public.admin_aluno(p_email text)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare u record;
begin
  if not public.is_admin() then raise exception 'apenas administradores' using errcode = '42501'; end if;
  select id, email, created_at, last_sign_in_at into u from auth.users where lower(email) = lower(trim(p_email));
  if u.id is null then return null; end if;
  return jsonb_build_object(
    'email', u.email, 'cadastro', u.created_at, 'ultimo_login', u.last_sign_in_at,
    'nome', (select nome from public.perfis where id = u.id),
    'assinaturas', coalesce((select jsonb_agg(to_jsonb(a) - 'user_id' order by a.criado_em desc) from public.assinaturas a where a.user_id = u.id), '[]'::jsonb),
    'pagamentos', coalesce((select jsonb_agg(jsonb_build_object('data', p.data, 'valor', p.valor, 'status', p.status, 'status_mp', p.status_mp, 'plano_id', p.plano_id, 'mp_id', p.mp_id) order by p.data desc nulls last) from public.pagamentos p where p.user_id = u.id), '[]'::jsonb),
    'eventos', coalesce((select jsonb_agg(jsonb_build_object('data', e.criado_em, 'evento', e.evento, 'plano_id', e.plano_id, 'acesso_ate', e.acesso_ate) order by e.criado_em desc) from public.assinatura_eventos e where e.user_id = u.id), '[]'::jsonb),
    'acessos', coalesce((select jsonb_agg(x order by x.data desc) from (
        select a.criado_em data, a.tipo, v.titulo from public.acessos a left join public.videos v on v.id = a.video_id
        where a.user_id = u.id order by a.criado_em desc limit 100) x), '[]'::jsonb),
    'progresso', coalesce((select jsonb_agg(jsonb_build_object('titulo', v.titulo, 'liberado', pr.liberado,
        'fracao', case when pr.duracao > 0 then least(1, cardinality(pr.segundos) / floor(pr.duracao)) else 0 end, 'data', pr.atualizado_em) order by pr.atualizado_em desc)
        from public.progresso pr join public.videos v on v.id = pr.video_id where pr.user_id = u.id), '[]'::jsonb),
    'tentativas', coalesce((select jsonb_agg(jsonb_build_object('titulo', v.titulo, 'acertos', t.acertos, 'total', t.total, 'data', t.criado_em) order by t.criado_em desc)
        from public.tentativas t join public.videos v on v.id = t.video_id where t.user_id = u.id), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.perfis          enable row level security;
alter table public.planos          enable row level security;
alter table public.assinaturas     enable row level security;
alter table public.videos          enable row level security;
alter table public.videos_conteudo enable row level security;
alter table public.questoes        enable row level security;
alter table public.gabaritos       enable row level security;
alter table public.progresso       enable row level security;
alter table public.tentativas      enable row level security;
alter table public.pagamentos      enable row level security;
alter table public.assinatura_eventos enable row level security;
alter table public.acessos         enable row level security;

do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Perfis: cada um vê e edita o próprio nome; admin vê todos. Ninguém se promove a admin.
create policy perfis_ler on public.perfis for select using (id = auth.uid() or public.is_admin());
create policy perfis_editar on public.perfis for update using (id = auth.uid()) with check (id = auth.uid());
-- o aluno só pode alterar o nome (a coluna admin fica protegida)
revoke update on public.perfis from anon, authenticated;
grant update (nome) on public.perfis to authenticated;

-- Planos: todos veem os ativos; admin gerencia.
create policy planos_ler on public.planos for select using (ativo or public.is_admin());
create policy planos_admin on public.planos for all using (public.is_admin()) with check (public.is_admin());

-- Assinaturas: o aluno vê as suas; admin vê todas. Escrita só pelo servidor (service_role ignora RLS).
create policy assinaturas_ler on public.assinaturas for select using (user_id = auth.uid() or public.is_admin());

-- Vídeos: catálogo publicado é público; admin vê e edita tudo.
create policy videos_ler on public.videos for select using (publicado or public.is_admin());
create policy videos_admin on public.videos for all using (public.is_admin()) with check (public.is_admin());

-- Link do vídeo e questões: só quem pode assistir.
create policy conteudo_ler on public.videos_conteudo for select using (public.pode_assistir(video_id));
create policy conteudo_admin on public.videos_conteudo for all using (public.is_admin()) with check (public.is_admin());
create policy questoes_ler on public.questoes for select using (public.pode_assistir(video_id));
create policy questoes_admin on public.questoes for all using (public.is_admin()) with check (public.is_admin());

-- Gabarito: só admin lê direto. Alunos recebem pela função corrigir().
create policy gabaritos_admin on public.gabaritos for all using (public.is_admin()) with check (public.is_admin());

-- Progresso e tentativas: cada um vê os seus. Gravação só pelas funções acima.
create policy progresso_ler on public.progresso for select using (user_id = auth.uid());
create policy tentativas_ler on public.tentativas for select using (user_id = auth.uid() or public.is_admin());

-- Históricos: cada um vê os seus; admin vê todos. Gravação só pelo servidor e pelas funções.
create policy pagamentos_ler on public.pagamentos for select using (user_id = auth.uid() or public.is_admin());
create policy eventos_ler on public.assinatura_eventos for select using (user_id = auth.uid() or public.is_admin());
create policy acessos_ler on public.acessos for select using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------
-- Permissões das funções
-- ---------------------------------------------------------------------
revoke execute on function public.registrar_progresso(bigint, int[], numeric) from public, anon;
revoke execute on function public.corrigir(bigint, jsonb) from public, anon;
revoke execute on function public.excluir_minha_conta() from public, anon;
revoke execute on function public.registrar_acesso(text, bigint) from public, anon;
revoke execute on function public.limpar_acessos_antigos() from public, anon, authenticated;
revoke execute on function public.registrar_evento_assinatura() from public, anon, authenticated;
revoke execute on function public.admin_relatorio() from public, anon;
revoke execute on function public.admin_aluno(text) from public, anon;
grant execute on function public.registrar_acesso(text, bigint) to authenticated;
grant execute on function public.admin_relatorio() to authenticated;
grant execute on function public.admin_aluno(text) to authenticated;
revoke execute on function public.salvar_video_interno(jsonb) from public, anon, authenticated;
revoke execute on function public.admin_salvar_video(jsonb) from public, anon;
revoke execute on function public.admin_obter_video(bigint) from public, anon;
grant execute on function public.registrar_progresso(bigint, int[], numeric) to authenticated;
grant execute on function public.corrigir(bigint, jsonb) to authenticated;
grant execute on function public.excluir_minha_conta() to authenticated;
grant execute on function public.admin_salvar_video(jsonb) to authenticated;
grant execute on function public.admin_obter_video(bigint) to authenticated;
grant select on public.catalogo to anon, authenticated;

-- ---------------------------------------------------------------------
-- Planos de exemplo — TROQUE OS VALORES antes de abrir as vendas
-- (Supabase > Table Editor > planos)
-- ---------------------------------------------------------------------
insert into public.planos (id, nome, descricao, preco, meses, beneficios, destaque, ordem) values
  ('mensal', 'Mensal', 'Para quem quer começar agora.', 29.90, 1,
     array['Todos os vídeos de todos os cursos', 'Questões de treino com gabarito', 'Cancele quando quiser'], false, 1),
  ('semestral', 'Semestral', 'O semestre inteiro de preparação.', 149.90, 6,
     array['Todos os vídeos de todos os cursos', 'Questões de treino com gabarito', 'Economia em relação ao mensal'], true, 2),
  ('anual', 'Anual', 'Um ano de acesso completo.', 249.90, 12,
     array['Todos os vídeos de todos os cursos', 'Questões de treino com gabarito', 'Maior economia'], false, 3)
on conflict (id) do nothing;
