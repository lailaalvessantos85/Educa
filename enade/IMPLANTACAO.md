# Guia de implantação — ENADE Explicado

Passo a passo para colocar a plataforma no ar com login, assinatura e pagamento.
Siga na ordem. Onde aparecer **[você]**, é uma etapa que só você pode fazer (envolve seus documentos ou contas).

## Visão geral

| Peça | Serviço | Onde ficam os dados |
|---|---|---|
| Site (páginas) | Cloudflare Pages | Só os arquivos do site, sem dados de alunos |
| Login e banco de dados | Supabase, região **São Paulo** | Contas, assinaturas, progresso, respostas, questões e gabaritos |
| Pagamento | Mercado Pago (conta do seu MEI) | Dados de cartão e Pix (nunca passam pelo site) |
| Vídeos | YouTube, como **não listados** | Vídeos |
| Endereço | Registro.br | — |

```
Aluno ──► site (Cloudflare) ──► Supabase (login + banco, São Paulo)
                │                        ▲
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
7. Torne sua conta administradora: crie sua conta pelo próprio site (`entrar.html` > Criar conta), confirme o e-mail e rode no SQL Editor:
   ```sql
   update public.perfis set admin = true
   where id = (select id from auth.users where email = 'SEU-EMAIL-AQUI');
   ```
   Depois disso, o menu da conta mostra **Administração** (`admin.html`).

## 2. Mercado Pago (pagamento)

1. **[você]** Crie (ou use) uma conta Mercado Pago **como empresa, com o CNPJ do MEI**.
2. Acesse **mercadopago.com.br/developers > Suas integrações > Criar aplicação**.
   - Tipo de pagamento: **Assinaturas**.
3. Em **Credenciais**, você terá dois *Access Tokens*: **de teste** e **de produção**. Comece com o de teste.
4. Em **Webhooks > Configurar notificações**:
   - URL: `https://SEU-PROJETO.supabase.co/functions/v1/webhook-mercadopago`
   - Eventos: **Planos e assinaturas** (assinaturas e pagamentos autorizados).
   - Copie a **assinatura secreta** gerada (vira o `MP_WEBHOOK_SECRET`).

## 3. Funções de pagamento (Supabase Edge Functions)

São três funções na pasta `supabase/functions`: `criar-assinatura`, `cancelar-assinatura` e `webhook-mercadopago`.

1. No computador, com Node instalado, na pasta `enade`:
   ```bash
   npx supabase login
   npx supabase link --project-ref SEU-PROJETO
   npx supabase functions deploy criar-assinatura
   npx supabase functions deploy cancelar-assinatura
   npx supabase functions deploy webhook-mercadopago --no-verify-jwt
   ```
2. Cadastre os segredos (ficam só no servidor):
   ```bash
   npx supabase secrets set MP_ACCESS_TOKEN=SEU_ACCESS_TOKEN
   npx supabase secrets set MP_WEBHOOK_SECRET=SUA_ASSINATURA_SECRETA
   npx supabase secrets set SITE_URL=https://SEU-ENDERECO
   ```
   (`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` o Supabase já fornece sozinho.)

## 4. Site no ar (Cloudflare Pages)

1. **[você]** Crie uma conta em cloudflare.com > **Workers & Pages > Create > Pages > Connect to Git**.
2. Escolha o repositório `Educa` e o branch `main`.
   - *Build command*: deixe vazio.
   - *Build output directory*: `enade`
3. O site fica em `https://NOME.pages.dev`. Teste tudo nesse endereço.
4. **[você]** Registre o domínio no registro.br e, em **Custom domains** do Cloudflare Pages, conecte-o.
   Atualize `SITE_URL` e as URLs do Supabase (passo 1.3) para o domínio final.

## 5. Teste antes de vender (com as credenciais de TESTE)

1. No Mercado Pago Developers, crie **usuários de teste** (um vendedor e um comprador).
2. No site, crie uma conta **com o e-mail do comprador de teste** e assine um plano.
   O Mercado Pago pode exigir que o e-mail da conta do site seja o mesmo da conta que paga.
3. Pague com um cartão de teste (lista na documentação do Mercado Pago).
4. Confira: em *Minha conta* a assinatura fica **Ativa** em poucos minutos, e os vídeos liberam.
   Se ficar "Aguardando pagamento", veja **Edge Functions > webhook-mercadopago > Logs** no Supabase.
5. Cancele em *Minha conta* e confira que o acesso continua até a data mostrada.
6. Tudo certo? Troque `MP_ACCESS_TOKEN` pelo token de **produção** e refaça a configuração do webhook no modo produção.

## 6. Antes de abrir as vendas

- [ ] Definir os planos e preços em **Administração > Planos e preços**.
- [ ] Revisar `termos.html` e `privacidade.html` com advogado ou contador; preencher nome do MEI, CNPJ, cidade e data; apagar o aviso de rascunho.
- [ ] Preencher `CONTATO_EMAIL` no `config.js`.
- [ ] Configurar SMTP próprio (passo 1.5).
- [ ] Emissão de nota fiscal das assinaturas (MEI): confirmar com o contador. Atenção ao limite anual de faturamento do MEI.
- [ ] Subir os vídeos no YouTube como **não listados** e cadastrar em `admin.html`.
- [ ] Para quem não assina, os cards mostram uma capa desenhada. Se quiser uma imagem, use o campo *Imagem de capa* (não use a miniatura do YouTube: ela revela o link do vídeo).

## Custos aproximados (confira os valores atuais em cada site)

| Item | Custo |
|---|---|
| Cloudflare Pages | Grátis |
| Supabase | Grátis para testar. Para produção, o plano Pro (cerca de US$ 25/mês) evita que o projeto seja pausado por inatividade e inclui backups |
| Mercado Pago | Taxa por cobrança (porcentagem sobre o valor), sem mensalidade |
| Domínio .com.br | Cerca de R$ 40/ano |
| E-mail (SMTP) | Grátis nos planos iniciais de Brevo/Resend |

## Limitações conhecidas

- **YouTube não listado**: o assinante pode copiar o link do vídeo (ele aparece no código da página para quem assiste). Quando o número de assinantes crescer, vale migrar para uma hospedagem com bloqueio por domínio (ex.: Panda Video); só o player muda.
- **Controle dos 90% assistidos**: o servidor confere os segundos assistidos, mas quem tiver conhecimento técnico consegue simular. Para treino, é suficiente.

## Testes automáticos

- Regras de pagamento: `deno test supabase/functions/_shared/` (12 testes).
- As regras de acesso do banco foram testadas em PostgreSQL 16 com 41 cenários (visitante, sem plano, assinante, vencido, admin).
