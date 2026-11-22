# ENADE Explicado

Plataforma de assinatura com vídeos curtos em que professores explicam questões do ENADE,
com questões de treino liberadas depois de assistir.

**Para colocar no ar, siga o [guia de implantação](IMPLANTACAO.md).**

## Como funciona

- **Vitrine aberta**: qualquer pessoa vê o catálogo, mas os vídeos têm cadeado. Ao clicar, recebe o convite certo
  (criar conta, assinar ou aguardar o pagamento).
- **Login** (`entrar.html`): cadastro com confirmação de e-mail, entrar, esqueci minha senha.
- **Planos** (`planos.html`): assinatura recorrente pelo Mercado Pago.
- **Minha conta** (`conta.html`): situação da assinatura, cancelamento (o acesso continua até o fim do período pago),
  troca de nome e senha, exclusão da conta (LGPD).
- **Vídeos e treino**: os vídeos ficam no Bunny Stream. Só assinantes recebem o link, que é assinado pelo servidor e expira em 3 horas. As questões liberam quando o aluno assiste a 90% do vídeo,
  conferido pelo servidor. O gabarito fica protegido no banco e só é enviado depois das respostas.
- **Vídeos grátis**: marque "Grátis" no cadastro do vídeo para liberá-lo a quem só tem conta (amostra).
- **Histórico guardado**: cada pagamento, cada mudança da assinatura, cada login e vídeo aberto (acessos por 2 anos).
  O aluno vê os próprios pagamentos em Minha conta.
- **Relatórios** (na Administração): assinantes com acesso, receita do mês e dos últimos 6 meses, novas assinaturas,
  cancelamentos, vídeos mais assistidos, histórico completo de um aluno pelo e-mail e planilha de pagamentos para o contador.
- **Administração** (`admin.html`): cadastrar e editar vídeos e questões, e mudar planos e preços. Só para administradores,
  com **verificação em duas etapas** obrigatória (código de um aplicativo autenticador no celular).

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `config.js` | Endereço e chave pública do Supabase. **Preencha na implantação.** |
| `index.html` | Vitrine, filtros, player e questões |
| `entrar.html`, `planos.html`, `conta.html` | Login, planos e conta do aluno |
| `admin.html` | Painel de administração |
| `termos.html`, `privacidade.html` | Rascunhos de Termos de uso e Política de privacidade (revisar antes de vender) |
| `api.js` | Toda a comunicação com o Supabase |
| `treino.js` | Player do Bunny, acompanhamento dos 90% assistidos e questões de treino |
| `comum.js`, `estilo.css` | Cards e visual |
| `supabase/schema.sql` | Banco de dados e regras de acesso |
| `supabase/exemplos.sql` | Vídeos de exemplo (opcional) |
| `supabase/functions/` | Funções do servidor: criar e cancelar assinatura, receber avisos do Mercado Pago, gerar link assinado do vídeo |

## Filtros da vitrine

Busca por palavra (ignora acentos), filtros por curso, ano, tipo de questão, tema e professor, e ordenação.
Os filtros ficam no endereço da página (ex.: `index.html?curso=Administração&ano=2022`), então dá para mandar
o link já filtrado para uma turma.
