/*
  CONFIGURAÇÃO DA PLATAFORMA
  Preencha com os dados do seu projeto no Supabase:
  Supabase > Project Settings > API (ou "Data API").

  A "anon key" (ou "publishable key") é PÚBLICA: pode ficar aqui sem problema.
  Ela só permite o que as regras do banco (schema.sql) deixam.
  NUNCA coloque aqui a "service_role key" nem o token do Mercado Pago.
*/
window.CONFIG = {
  SUPABASE_URL: "",        // ex.: "https://abcdefghijk.supabase.co"
  SUPABASE_ANON_KEY: "",   // ex.: "eyJhbGciOi..." ou "sb_publishable_..."
  CONTATO_EMAIL: "",       // e-mail de atendimento mostrado em Termos e Privacidade
  BUNNY_CDN_HOST: ""       // Bunny > Stream > sua biblioteca > API > "CDN Hostname" (ex.: "vz-1a2b3c4d-5e6.b-cdn.net"). Usado só para as miniaturas.
};
