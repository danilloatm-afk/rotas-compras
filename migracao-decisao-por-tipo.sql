-- Uma decisão (justificativa) para CADA tipo de divergência do card:
-- valor, CNPJ, itens (ou prestadora) e condição de pagamento.
-- O card só conta como "justificado" quando todos os tipos que divergiram têm decisão.
-- resolucoes_meta guarda quem registrou e quando, por tipo.
-- Rodar uma vez no SQL Editor do Supabase.
alter table rl_rota_paradas
  add column if not exists resolucao_valor text,
  add column if not exists resolucao_cnpj text,
  add column if not exists resolucao_itens text,
  add column if not exists resolucao_condicao text,
  add column if not exists resolucoes_meta jsonb;
