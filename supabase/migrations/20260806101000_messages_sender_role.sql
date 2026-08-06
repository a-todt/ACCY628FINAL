-- Store acting role on each message so client/PM chat sides work under demo role preview
-- (same auth user can send as client then as PM).

alter table public.messages
  add column if not exists sender_role text;

comment on column public.messages.sender_role is
  'Role the sender was acting as (client or project_manager). Used for chat alignment under demo role preview.';
