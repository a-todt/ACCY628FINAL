-- Allow participants to delete individual messages and whole chats.

drop policy if exists "messages_delete" on public.messages;
create policy "messages_delete"
  on public.messages
  for delete
  to authenticated
  using (public.is_message_thread_participant(thread_id));

drop policy if exists "message_threads_delete" on public.message_threads;
create policy "message_threads_delete"
  on public.message_threads
  for delete
  to authenticated
  using (public.is_message_thread_participant(id));
