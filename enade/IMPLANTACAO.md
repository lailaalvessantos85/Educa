# Guia de implantação — ENADE Explicado

Passo a passo para colocar a plataforma no ar com login, assinatura e pagamento.
Siga na ordem. Onde aparecer **[você]**, é uma etapa que só você pode fazer (envolve seus documentos ou contas).

## Visão geral

| Peça | Serviço | Onde ficam os dados |
|---|---|---|
| Site (páginas) | Cloudflare Pages | Só os arquivos do site, sem dados de alunos |
| Login e banco de dados | Supabase, região **São Paulo** | Contas, assinaturas, pagamentos, histórico de acessos, progresso, respostas, questões e gabaritos |
| Pagamento | Mercado Pago (conta do seu MEI) | Dados de cartão e Pix (nunca passam pelo site) |
| Vídeos | Bunny Stream (link assinado que expira) | Vídeos |
| Endereço | Registro.br | — |

```
Aluno ──► site (Cloudflare) ──► Supabase (login + banco, São Paulo)
                │                        ▲        │
                │                        │        └─ função link-video ──► link assinado do Bunny (expira em 3 h)
                └──► Mercado Pago ───────┘ aviso automático (webhook) quando paga/cancela
```

---

## 1. Supabase (login e banco de dados)

1. **[você]** Crie uma conta em supabase.com e um projeto novo.
   - **Region: South America (São Paulo)** — importante para a LGPD e para a velocidade.
   - Guarde a senha do banco num lugar seguro.
2. No projeto, abra **SQL Editor**, cole todo o arquivo `supabase/schema.sql` e clique em **Run**.
   - Opcional: rode também `supabase/exemplos.sql` para ter os 6 vídeos de exemplo.
3. **Authentication > URL Configuration**
   - *Site URL*: o endereço final do site (ex.: `https://enadeexplicado.com.br`).
   - *Redirect URLs*: adicione `https://SEU-ENDERECO/entrar.html` (e o endereço provisório do Cloudflare, ex.: `https://enade-explicado.pages.dev/entrar.html`).
4. **Authentication > Emails (Templates)**: traduza os textos de "Confirm signup" e "Reset password" para português.
5. **Authentication > Emails (SMTP)**: o envio de e-mails embutido do Supabase tem limite baixo por hora e serve só para testes. Antes de abrir as vendas, configure um provedor de e-mail (ex.: Brevo ou Resend) com o domínio do site.
6. **Project Settings > API**: copie a *Project URL* e a *anon / publishable key* para o arquivo `config.js`.
   **Nunca** coloque a *service_role key* no site.
7. **Authentication > Multi-Factor**: confira se **TOTP (App Authenticator)** está habilitado. É o que permite a verificação em duas etapas.
8. Torne sua conta administradora: crie sua conta pelo próprio site (`entrar.html` > Criar conta), confirme o e-mail e rode no SQL Editor:
   ```sql
   update public.perfis set admin = true
   where id = (select id from auth.users where email = 'SEU-EMAIL-AQUI');
   ```
9. Entre no site e abra **Administração** no menu da conta. Na primeira vez, a página pede para **ativar a verificação em duas etapas**: instale um aplicativo autenticador no celular (Google Authenticator, Microsoft Authenticator ou similar), leia o QR code e digite o código. A partir daí, todo login pede o código.
   - Sem o código, a conta de administradora funciona como a de um aluno comum: o banco recusa qualquer alteração.
   - **Perdeu o celular?** Rode no SQL Editor e ative de novo pelo site:
     ```sql
     delete from auth.mfa_factors
     where user_id = (select id from auth.users where email = 'SEU-EMAIL-AQUI');
     ```

### Dados guardados e por quanto tempo

| Tabela | O que guarda | Por quanto tempo |
|---|---|---|
| `perfis`, `progresso`, `tentativas` | Nome, progresso nos vídeos, respostas | Enquanto a conta existir |
| `acessos` | Cada login e cada vídeo aberto, com data e hora | **2 anos** (limpeza automática diária) |
| `assinaturas`, `assinatura_eventos` | Plano, situação e cada mudança (criada, ativada, renovada, pausada, cancelada, reativada) | Permanente; se a conta for excluída, fica sem identificar a pessoa |
| `pagamentos` | Cada cobrança: data, valor, situação e o aviso completo do Mercado Pago | Permanente (registro fiscal); se a conta for excluída, fica sem identificar a pessoa |

- **Limpeza dos acessos:** o `schema.sql` agenda a limpeza com a extensão **pg_cron**. Se, ao rodar o arquivo, aparecer o aviso *"Limpeza automática NÃO agendada"*, ative **pg_cron** em *Database > Extensions* (ou *Integrations > Cron*) e rode o `schema.sql` de novo. Para conferir: `select * from cron.job;` deve mostrar `limpar-acessos`.
- **Cópias de segurança:** o plano gratuito do Supabase não faz backup automático. Antes de abrir as vendas, assine o **plano Pro**, que faz backup diário. Para guardar uma cópia sua de tempos em tempos: *Database > Backups* (no Pro) ou baixe as tabelas em CSV pelo *Table Editor*.
- **Onde ver os dados:** na própria plataforma, em *Administração > Relatórios* (indicadores, receita mensal, vídeos mais assistidos, histórico completo de um aluno pelo e-mail e planilha de pagamentos do mês para o contador). Também dá para ver tudo no *Table Editor* do Supabase.

## 2. Mercado Pago (pagamento)

1. **[você]** Crie (ou use) uma conta Mercado Pago **como empresa, com o CNPJ do MEI**.
2. Acesse **mercadopago.com.br/developers > Suas integrações > Criar aplicação**.
   - Tipo de pagamento: **Assinaturas**.
3. Em **Credenciais**, você terá dois *Access Tokens*: **de teste** e **de produção**. Comece com o de teste.
4. Em **Webhooks > Configurar notificações**:
   - URL: `https://SEU-PROJETO.supabase.co/functions/v1/webhook-mercadopago`
   - Eventos: **Planos e assinaturas** (assinaturas e pagamentos autorizados).
   - Copie a **assinatura secreta** gerada (vira o `MP_WEBHOOK_SECRET`).

## 3. Bunny Stream (vídeos)

1. **[você]** Crie uma conta em bunny.net > **Stream > Add Video Library**. Escolha as regiões de armazenamento mais próximas do Brasil.
2. Envie os vídeos (**Upload**). Para cada vídeo, copie o **Video ID** (formato `0a1b2c3d-...`) e cole em *Administração > Vídeo no Bunny Stream*.
3. Em **Security** da biblioteca:
   - Ative **Embed view token authentication**. Isso faz o link do vídeo exigir assinatura e expirar.
   - Em **Allowed domains**, adicione o domínio do site (e o provisório `NOME.pages.dev`).
   - Ative **Block direct URL file access**.
4. Anote três dados:
   - **Library ID** (em *API*), que vira o segredo `BUNNY_LIBRARY_ID`.
   - **Token authentication key** (em *Security*), que vira `BUNNY_TOKEN_KEY`. A documentação do Bunny se contradiz sobre qual chave usar: se o vídeo der erro 403, troque por *API Key* da biblioteca.
   - **CDN Hostname** (em *API*, ex.: `vz-1a2b3c4d-5e6.b-cdn.net`), que vai em `BUNNY_CDN_HOST` no `config.js` (só para as miniaturas).
5. **Nunca** coloque a Token authentication key nem a API Key no `config.js` ou em qualquer arquivo do site.

## 4. Funções do servidor (Supabase Edge Functions)

São quatro funções na pasta `supabase/functions`: `criar-assinatura`, `cancelar-assinatura`, `webhook-mercadopago` e `link-video`.

1. No computador, com Node instalado, na pasta `enade`:
   ```bash
   npx supabase login
   npx supabase link --project-ref SEU-PROJETO
   npx supabase functions deploy criar-assinatura
   npx supabase functions deploy cancelar-assinatura
   npx supabase functions deploy webhook-mercadopago --no-verify-jwt
   npx supabase functions deploy link-video
   ```
2. Cadastre os segredos (ficam só no servidor):
   ```bash
   npx supabase secrets set MP_ACCESS_TOKEN=SEU_ACCESS_TOKEN
   npx supabase secrets set MP_WEBHOOK_SECRET=SUA_ASSINATURA_SECRETA
   npx supabase secrets set SITE_URL=https://SEU-ENDERECO
   npx supabase secrets set BUNNY_LIBRARY_ID=SEU_LIBRARY_ID
   npx supabase secrets set BUNNY_TOKEN_KEY=SUA_TOKEN_AUTHENTICATION_KEY
   ```
   (`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` o Supabase já fornece sozinho.)

## 5. Site no ar (Cloudflare Pages)

1. **[você]** Crie uma conta em cloudflare.com > **Workers & Pages > Create > Pages > Connect to Git**.
2. Escolha o repositório `Educa` e o branch `main`.
   - *Build command*: deixe vazio.
   - *Build output directory*: `enade`
3. O site fica em `https://NOME.pages.dev`. Teste tudo nesse endereço.
4. **[você]** Registre o domínio no registro.br e, em **Custom domains** do Cloudflare Pages, conecte-o.
   Atualize `SITE_URL`, as URLs do Supabase (passo 1.3) e os *Allowed domains* do Bunny (passo 3.3) para o domínio final.

## 6. Teste antes de vender (com as credenciais de TESTE)

1. No Mercado Pago Developers, crie **usuários de teste** (um vendedor e um comprador).
2. No site, crie uma conta **com o e-mail do comprador de teste** e assine um plano.
   O Mercado Pago pode exigir que o e-mail da conta do site seja o mesmo da conta que paga.
3. Pague com um cartão de teste (lista na documentação do Mercado Pago).
4. Confira: em *Minha conta* a assinatura fica **Ativa** em poucos minutos, e os vídeos liberam.
   Confira também em *Administração > Relatórios > Histórico de um aluno* que o pagamento apareceu com **valor e situação corretos**.
   Se o valor vier vazio ou a situação como "Outro", abra a tabela `pagamentos` no Supabase, copie o conteúdo da coluna `dados_mp` (o aviso completo do Mercado Pago) e me envie: ajusto a leitura dos campos.
   Se ficar "Aguardando pagamento", veja **Edge Functions > webhook-mercadopago > Logs** no Supabase.
5. Cancele em *Minha conta* e confira que o acesso continua até a data mostrada.
6. Abra um vídeo como assinante e confira que ele toca. Copie o endereço do player e abra em outra aba ou outro navegador depois de 3 horas: deve dar erro.
7. Tudo certo? Troque `MP_ACCESS_TOKEN` pelo token de **produção** e refaça a configuração do webhook no modo produção.

## 7. Antes de abrir as vendas

- [ ] Definir os planos e preços em **Administração > Planos e preços**.
- [ ] Revisar `termos.html` e `privacidade.html` com advogado ou contador; preencher nome do MEI, CNPJ, cidade e data; apagar o aviso de rascunho.
- [ ] Preencher `CONTATO_EMAIL` no `config.js`.
- [ ] Configurar SMTP próprio (passo 1.5).
- [ ] Verificação em duas etapas ativada na conta de administradora (passo 1.9).
- [ ] Emissão de nota fiscal das assinaturas (MEI): confirmar com o contador. Atenção ao limite anual de faturamento do MEI.
- [ ] Enviar os vídeos ao Bunny Stream e cadastrar em `admin.html`.
- [ ] Para quem não assina, os cards mostram uma capa desenhada. Se quiser uma imagem, use o campo *Imagem de capa*.

## Custos aproximados (confira os valores atuais em cada site)

| Item | Custo |
|---|---|
| Cloudflare Pages | Grátis |
| Supabase | Grátis para testar. Para produção, o plano Pro (cerca de US$ 25/mês) evita que o projeto seja pausado por inatividade e inclui backups |
| Mercado Pago | Taxa por cobrança (porcentagem sobre o valor), sem mensalidade |
| Bunny Stream | Por uso, em dólar: cerca de US$ 0,045 por GB assistido (América do Sul) + US$ 0,01 por GB armazenado; mínimo US$ 1/mês |
| Domínio .com.br | Cerca de R$ 40/ano |
| E-mail (SMTP) | Grátis nos planos iniciais de Brevo/Resend |

## Limitações conhecidas

- **Link do vídeo**: é gerado pelo servidor só para quem pode assistir e expira em 3 horas; um link copiado não serve depois disso, nem em outros sites. Ninguém consegue impedir 100% uma gravação de tela. Para proteção extra contra download, o Bunny oferece DRM (MediaCage), cobrado à parte.
- **Controle dos 90% assistidos**: o servidor confere os segundos assistidos, mas quem tiver conhecimento técnico consegue simular. Para treino, é suficiente.

## Testes automáticos

- Funções do servidor: `deno test supabase/functions/_shared/` (17 testes: assinatura, registro de cada cobrança e link assinado do Bunny).
- As regras de acesso do banco foram testadas em PostgreSQL 16 com 45 cenários (visitante, sem plano, assinante, vencido, admin com e sem verificação em duas etapas), e os históricos com outros 31 (eventos automáticos, limpeza de 2 anos, relatórios, exclusão com anonimização).
