-- Guarda as fotos EXTRAS da nota (a 2ª, 3ª... foto, quando a nota tem muitos itens
-- e foi fotografada em partes). A 1ª foto continua em nota_arquivo_url.
-- Rodar uma vez no SQL Editor do Supabase.
alter table rl_rota_paradas add column if not exists nota_arquivos_extras jsonb;
