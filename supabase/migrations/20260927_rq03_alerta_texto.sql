-- RQ03: o alerta de WhatsApp agora manda uma mensagem de texto ("RQ03 REPROVADA" + dados) antes do PDF (o send-doc
-- do BubbleWhats não tem legenda). Esta coluna marca que o texto já saiu, para uma retentativa (por falha no PDF)
-- não repetir a mensagem de texto no grupo.
alter table public.qualidade_rq03_alertas add column if not exists texto_enviado_em timestamptz;
