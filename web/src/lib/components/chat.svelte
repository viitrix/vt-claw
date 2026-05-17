<script lang="ts">
  import { Chat } from '@ai-sdk/svelte';
  import type { Attachment } from 'ai';
  import { toast } from 'svelte-sonner';
  import { ChatHistory } from '$lib/hooks/chat-history.svelte';
  import ChatHeader from './chat-header.svelte';
  import type { Chat as DbChat, User } from '$lib/server/db/schema';
  import Messages from './messages.svelte';
  import MultimodalInput from './multimodal-input.svelte';
  import { untrack, onMount } from 'svelte';
  import type { UIMessage } from '@ai-sdk/svelte';

  import type { RoleInfo } from '$lib/server/claw-client';

  let {
    user,
    chat,
    readonly,
    initialMessages
  }: {
    user: User | undefined;
    chat: DbChat | undefined;
    initialMessages: UIMessage[];
    readonly: boolean;
  } = $props();

  const chatHistory = ChatHistory.fromContext();

  let selectedRole = $derived(user?.role ?? '');
  let roleDisplayName = $state('');
  let rolesMap = $state<Map<string, string>>(new Map());

  onMount(async () => {
    try {
      const resp = await fetch('/api/roles?channel=web');
      if (resp.ok) {
        const data = await resp.json();
        const roles: RoleInfo[] = data.roles ?? [];
        const map = new Map(roles.map(r => [r.name, r.displayName]));
        rolesMap = map;
        if (selectedRole && map.has(selectedRole)) {
          roleDisplayName = map.get(selectedRole)!;
        }
      }
    } catch {
      // ignore
    }
  });

  const chatClient = $derived(
    new Chat({
      id: chat?.id,
      // This way, the client is only recreated when the ID changes, allowing us to fully manage messages
      // clientside while still SSRing them on initial load or when we navigate to a different chat.
      initialMessages: untrack(() => initialMessages),
      sendExtraMessageFields: true,
      generateId: () =>
        globalThis.crypto?.randomUUID?.bind(globalThis.crypto)()?.toString() ??
        `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      onFinish: async () => {
        await chatHistory.refetch();
      },
      onError: (error) => {
        try {
          // If there's an API error, its message will be JSON-formatted
          const jsonError = JSON.parse(error.message);
          console.log(jsonError);
          if (
            typeof jsonError === 'object' &&
            jsonError !== null &&
            'message' in jsonError &&
            typeof jsonError.message === 'string'
          ) {
            toast.error(jsonError.message);
          } else {
            toast.error(error.message);
          }
        } catch {
          toast.error(error.message);
        }
      }
    })
  );

  let attachments = $state<Attachment[]>([]);
</script>

<div class="bg-background flex h-dvh min-w-0 flex-col">
  <ChatHeader {user} {chat} {readonly} />
  <Messages
    {readonly}
    loading={chatClient.status === 'streaming' || chatClient.status === 'submitted'}
    messages={chatClient.messages}
  />

  <form class="bg-background mx-auto flex w-full gap-2 px-4 pb-4 md:max-w-3xl md:pb-6">
    {#if !readonly}
      <MultimodalInput {attachments} {user} {chatClient} bind:selectedRole {roleDisplayName} class="flex-1" />
    {/if}
  </form>
</div>

<!-- TODO -->
<!-- <Artifact
	chatId={id}
	{input}
	{setInput}
	{handleSubmit}
	{isLoading}
	{stop}
	{attachments}
	{setAttachments}
	{append}
	{messages}
	{setMessages}
	{reload}
	{votes}
	{readonly}
/> -->
