-- Etiqueta LS passa a ser LS<filial><ano2dígitos>-<sequencial> (ex.: LS126-3 = lâmina seca, filial 1, ano 26,
-- 3ª etiqueta). Padrão da fábrica para qualquer processo com etiqueta em várias filiais: prefixo do processo +
-- id da filial + ano com 2 dígitos + "-" + sequencial. O sequencial reinicia a cada ano E é separado por filial.
-- Continua compartilhado entre Produção Secagem e Produção Serra (mesma função/contador), então um código LS nunca
-- existe nas duas tabelas. Etiquetas já gravadas (LS26-2) não são renomeadas: podem já estar impressas.

-- A filial do apontamento passa a ficar gravada nas duas tabelas (vem da OP quando não informada).
alter table public.secagem_apontamentos add column bpl_id integer;
update public.secagem_apontamentos a set bpl_id = o.bpl_id from public.pcp_op_secagem o where o.id = a.op_id;

alter table public.serra_apontamentos add column bpl_id integer;
update public.serra_apontamentos a set bpl_id = o.bpl_id from public.pcp_op_serra o where o.id = a.op_id;

-- Contador por filial + ano (o que já existia era da filial 1).
alter table public.pcp_secagem_qrcode_seq add column bpl_id integer not null default 1;
alter table public.pcp_secagem_qrcode_seq alter column bpl_id drop default;
alter table public.pcp_secagem_qrcode_seq drop constraint pcp_secagem_qrcode_seq_pkey;
alter table public.pcp_secagem_qrcode_seq add primary key (bpl_id, ano);

create or replace function public.gerar_qrcode_secagem()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ano integer := extract(year from now())::integer % 100;
  v_bpl integer := new.bpl_id;
  v_num integer;
begin
  -- Filial: a do apontamento; se não veio, a da OP; se ainda assim não houver, filial 1 (padrão das tabelas de OP).
  if v_bpl is null and new.op_id is not null then
    if tg_table_name = 'serra_apontamentos' then
      select o.bpl_id into v_bpl from public.pcp_op_serra o where o.id = new.op_id;
    else
      select o.bpl_id into v_bpl from public.pcp_op_secagem o where o.id = new.op_id;
    end if;
  end if;
  v_bpl := coalesce(v_bpl, 1);
  new.bpl_id := v_bpl;

  if new.qrcode is null or new.qrcode = '' then
    insert into public.pcp_secagem_qrcode_seq (bpl_id, ano, ultimo) values (v_bpl, v_ano, 1)
      on conflict (bpl_id, ano) do update set ultimo = public.pcp_secagem_qrcode_seq.ultimo + 1
      returning ultimo into v_num;
    new.qrcode := 'LS' || v_bpl || lpad(v_ano::text, 2, '0') || '-' || v_num;
  end if;
  return new;
end;
$function$;
