-- pcp_secagem_qrcode_seq é um contador interno (não deve ser lido/gravado direto via API REST).
-- RLS ativo e sem policies bloqueia authenticated/anon; a trigger vira SECURITY DEFINER para
-- continuar gravando (roda com o privilégio do dono da função, ignorando o RLS da tabela).
alter table public.pcp_secagem_qrcode_seq enable row level security;

create or replace function public.gerar_qrcode_secagem()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ano integer := extract(year from now())::integer % 100;
  v_num integer;
begin
  if new.qrcode is null or new.qrcode = '' then
    insert into public.pcp_secagem_qrcode_seq (ano, ultimo) values (v_ano, 1)
      on conflict (ano) do update set ultimo = public.pcp_secagem_qrcode_seq.ultimo + 1
      returning ultimo into v_num;
    new.qrcode := 'LS' || lpad(v_ano::text, 2, '0') || '-' || v_num;
  end if;
  return new;
end;
$function$;

revoke all on public.pcp_secagem_qrcode_seq from anon, authenticated;
