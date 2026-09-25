-- Etiqueta manual (2026-09-25): na Produção Secagem o funcionário pode usar uma etiqueta impressa antecipadamente,
-- com código próprio, bipando o QR em vez de gerar/imprimir o automático (LS<filial><ano>-<seq>).
-- O banco aceita os dois tipos de código, mas NUNCA duplicado:
--  - a unicidade vale entre as duas tabelas (secagem_apontamentos e serra_apontamentos), sem diferenciar
--    maiúsculas/minúsculas; o código manual é gravado em MAIÚSCULAS e sem espaços nas pontas;
--  - travas (advisory lock) por código evitam dois tablets gravando o mesmo código ao mesmo tempo;
--  - o gerador automático PULA códigos que já existam (ex.: um manual "LS126-50" cadastrado antes de o contador chegar em 50).
-- etiqueta_manual marca os apontamentos feitos com etiqueta manual (o gatilho define; o cliente não precisa enviar).

alter table public.secagem_apontamentos add column etiqueta_manual boolean not null default false;
alter table public.serra_apontamentos add column etiqueta_manual boolean not null default false;

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
  v_cand text;
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

  if new.qrcode is not null and btrim(new.qrcode) <> '' then
    -- Código manual (etiqueta impressa antecipadamente)
    new.qrcode := upper(btrim(new.qrcode));
    if length(new.qrcode) > 60 then
      raise exception 'QRCODE_INVALIDO' using errcode = '22023';
    end if;

    perform pg_advisory_xact_lock(hashtext('qrcode:' || new.qrcode));
    if exists (select 1 from public.secagem_apontamentos a where upper(a.qrcode) = new.qrcode)
       or exists (select 1 from public.serra_apontamentos a where upper(a.qrcode) = new.qrcode) then
      raise exception 'QRCODE_DUPLICADO' using errcode = '23505';
    end if;
    new.etiqueta_manual := true;
  else
    -- Código automático: LS<filial><ano>-<seq>, pulando qualquer código que já esteja em uso
    loop
      insert into public.pcp_secagem_qrcode_seq (bpl_id, ano, ultimo) values (v_bpl, v_ano, 1)
        on conflict (bpl_id, ano) do update set ultimo = public.pcp_secagem_qrcode_seq.ultimo + 1
        returning ultimo into v_num;
      v_cand := 'LS' || v_bpl || lpad(v_ano::text, 2, '0') || '-' || v_num;

      perform pg_advisory_xact_lock(hashtext('qrcode:' || v_cand));
      exit when not exists (select 1 from public.secagem_apontamentos a where upper(a.qrcode) = v_cand)
            and not exists (select 1 from public.serra_apontamentos a where upper(a.qrcode) = v_cand);
    end loop;
    new.qrcode := v_cand;
    new.etiqueta_manual := false;
  end if;
  return new;
end;
$function$;

-- O app confere o código assim que ele é bipado (aviso antes de o funcionário digitar o PIN). O banco continua
-- sendo quem garante a unicidade no gravar.
create or replace function public.qrcode_em_uso(p_qrcode text)
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select exists (select 1 from public.secagem_apontamentos a where upper(a.qrcode) = upper(btrim(p_qrcode)))
      or exists (select 1 from public.serra_apontamentos a where upper(a.qrcode) = upper(btrim(p_qrcode)));
$function$;

revoke execute on function public.qrcode_em_uso(text) from public, anon;
grant execute on function public.qrcode_em_uso(text) to authenticated;
