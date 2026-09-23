-- gerar_qrcode_secagem() só deve rodar como trigger (o Postgres não checa EXECUTE nesse caso).
-- Revogar o EXECUTE direto evita que fique exposta como RPC chamável via /rest/v1/rpc/... .
revoke execute on function public.gerar_qrcode_secagem() from public, anon, authenticated;
