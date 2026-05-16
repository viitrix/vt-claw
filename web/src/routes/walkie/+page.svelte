<script lang="ts">
  import { onMount } from 'svelte';

  type TalkieMessage = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  };

  let messages = $state<TalkieMessage[]>([]);
  let lastId = $state<string | null>(null);
  let containerRef: HTMLDivElement | null = $state(null);
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
 
  async function pollMessages() {
    try {
      const query = lastId ? `?after=${encodeURIComponent(lastId)}` : '';
      const resp = await fetch(`/walkie/api/asr${query}`);
      if (!resp.ok) return;
      const batch: TalkieMessage[] = await resp.json();
      if (batch.length > 0) {
        messages = [...messages, ...batch];
        lastId = batch[batch.length - 1].id;
      }
    } catch {
      // network error — keep polling
    }
  }

  function startPolling() {
    pollMessages();
    pollTimer = setInterval(pollMessages, 3000);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  $effect(() => {
    messages;
    if (containerRef) {
      containerRef.scrollTop = containerRef.scrollHeight;
    }
  });

  onMount(() => {
    startPolling();
    return () => stopPolling();
  });
</script>

<svelte:head>
  <title>对讲机</title>
</svelte:head>

<div class="flex h-dvh flex-col bg-zinc-50 dark:bg-zinc-950">
  <!-- Header -->
  <header class="flex items-center gap-2 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
    <div class="flex size-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900">
      <svg class="size-4 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <line x1="17" y1="2" x2="12" y2="7" />
        <rect x="3" y="7" width="14" height="14" rx="2" />
        <rect x="5.5" y="9.5" width="9" height="5" rx="1" />
        <rect x="6" y="16" width="4" height="2.5" rx="0.5" fill="currentColor" stroke="none" />
      </svg>
    </div>
    <div class="flex-1">
      <h1 class="text-sm font-semibold">对讲机频道</h1>
      <p class="text-xs text-zinc-500">实时语音对话 · 只读浏览</p>
    </div>
    <div class="flex items-center gap-1.5">
      <span class="relative flex size-2">
        <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
        <span class="relative inline-flex size-2 rounded-full bg-emerald-500"></span>
      </span>
      <span class="text-xs text-emerald-600 dark:text-emerald-400">监听中</span>
    </div>
  </header>

  <!-- Messages -->
  <div bind:this={containerRef} class="flex-1 overflow-y-auto px-4 py-4">
    <div class="mx-auto max-w-lg space-y-3">
      {#if messages.length === 0}
        <div class="flex flex-col items-center justify-center py-20 text-zinc-400">
          <p class="text-sm">等待对讲机语音消息...</p>
        </div>
      {/if}

      {#each messages as msg (msg.id)}
        <div class="flex flex-col {msg.role === 'user' ? 'items-end' : 'items-start'}">
          <div
            class="max-w-[80%] rounded-2xl px-3.5 py-2.5 {msg.role === 'user'
              ? 'rounded-br-md bg-blue-600 text-white'
              : 'rounded-bl-md bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700'}"
          >
            <div class="mb-1 flex items-center gap-1.5 {msg.role === 'user' ? 'text-blue-200' : 'text-zinc-400 dark:text-zinc-500'}">
              {#if msg.role === 'user'}
                <svg class="size-3" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM5 10a1 1 0 0 0-2 0 9 9 0 0 0 8 8.94V22h-2a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-3.06A9 9 0 0 0 21 10a1 1 0 1 0-2 0 7 7 0 0 1-14 0z" />
                </svg>
                <span class="text-[10px]">对讲机</span>
              {:else}
                <svg class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 3v3m0 12v3m-7-8H2m20 0h-3m-1.5-5.5L16 7m-8-1.5L6.5 4m11 13L19 19m-13 0l1.5-1.5" />
                  <circle cx="12" cy="12" r="4" />
                </svg>
                <span class="text-[10px]">助手</span>
              {/if}
            </div>
            <p class="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
          </div>
          <span class="mt-1 text-[10px] text-zinc-400">{formatTime(msg.timestamp)}</span>
        </div>
      {/each}
    </div>
  </div>

  <!-- Footer -->
  <footer class="border-t border-zinc-200 bg-white px-4 py-3 text-center dark:border-zinc-800 dark:bg-zinc-900">
    <p class="text-xs text-zinc-400">只读模式 · 自动刷新中 · 每3秒更新</p>
  </footer>
</div>
