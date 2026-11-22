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

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select admin from public.perfis where id = auth.uid()), false);
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
  user_id            uuid not null references auth.users(id) on delete cascade,
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

create table if not exists public.videos_conteudo (
  video_id    bigint primary key references public.videos(id) on delete cascade,
  youtube_id  text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$')
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

-- Excluir a própria conta (LGPD). Apaga perfil, progresso, tentativas e assinaturas em cascata.
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

  if coalesce(p->>'youtube_id', '') <> '' then
    insert into public.videos_conteudo (video_id, youtube_id) values (v_id, p->>'youtube_id')
    on conflict (video_id) do update set youtube_id = excluded.youtube_id;
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
      'youtube_id', (select youtube_id from public.videos_conteudo where video_id = v.id),
      'questoes', coalesce((
        select jsonb_agg(jsonb_build_object('tipo', q.tipo, 'enunciado', q.enunciado, 'alternativas', q.alternativas,
               'imagem', q.imagem, 'correta', g.correta, 'comentario', g.comentario, 'resposta', g.resposta) order by q.ordem)
          from public.questoes q left join public.gabaritos g on g.questao_id = q.id
         where q.video_id = v.id), '[]'::jsonb))
    from public.videos v where v.id = p_id);
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

-- ---------------------------------------------------------------------
-- Permissões das funções
-- ---------------------------------------------------------------------
revoke execute on function public.registrar_progresso(bigint, int[], numeric) from public, anon;
revoke execute on function public.corrigir(bigint, jsonb) from public, anon;
revoke execute on function public.excluir_minha_conta() from public, anon;
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
