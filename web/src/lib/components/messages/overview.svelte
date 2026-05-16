<script lang="ts">
  import MessageIcon from '../icons/message.svelte';
  import { scale } from 'svelte/transition';
</script>

<div class="mx-auto max-w-3xl md:mt-20" transition:scale={{ opacity: 0, start: 0.98 }}>
  <div class="flex max-w-xl flex-col gap-8 rounded-xl p-6 text-center leading-relaxed">
    <p class="flex flex-row items-center justify-center gap-4">
      <MessageIcon size={32} />
    </p>
    <p>
      This is an AI chatbot built with SvelteKit and the AI SDK. It uses the
      <code class="bg-muted rounded-md px-1 py-0.5">streamText</code>
      function in the server and the
      <code class="bg-muted rounded-md px-1 py-0.5">useChat</code> hook on the client to create a seamless
      chat experience.
    </p>
  </div>
</div>
