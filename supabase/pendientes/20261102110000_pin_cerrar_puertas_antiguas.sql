-- APLICAR SOLO DESPUÉS de unir a main los PR del POS y del PIN seguro.
-- Retira las funciones antiguas: el PIN sin contraseña y la validación sin persona.
drop function if exists public.asignar_pin(uuid, uuid, text);
drop function if exists public.validar_pin(uuid, text);
