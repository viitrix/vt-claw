<script lang="ts">
  import { useSidebar } from './ui/sidebar';
  import SidebarToggle from './sidebar-toggle.svelte';
  import { innerWidth } from 'svelte/reactivity/window';
  import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
  import { Button } from './ui/button';
  import PlusIcon from './icons/plus.svelte';
  import WeChatIcon from './icons/wechat.svelte';
  import WalkieTalkieIcon from './icons/walkie-talkie.svelte';
  import { goto } from '$app/navigation';
  import type { Chat, User } from '$lib/server/db/schema';
  import VisibilitySelector from './visibility-selector.svelte';
  let {
    user,
    chat,
    readonly
  }: {
    user: User | undefined;
    chat: Chat | undefined;
    readonly: boolean;
  } = $props();

  const sidebar = useSidebar();
</script>

<header class="bg-background sticky top-0 relative flex items-center gap-2 p-2">
  <SidebarToggle />

  {#if !sidebar.open || (innerWidth.current ?? 768) < 768}
    <Tooltip>
      <TooltipTrigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="outline"
            class="order-2 ml-auto px-2 md:order-1 md:ml-0 md:h-fit md:px-2"
            onclick={() => {
              goto('/', {
                invalidateAll: true
              });
            }}
          >
            <PlusIcon />
            <span class="md:sr-only">New Chat</span>
          </Button>
        {/snippet}
      </TooltipTrigger>
      <TooltipContent>New Chat</TooltipContent>
    </Tooltip>
  {/if}

  {#if !readonly && chat}
    <VisibilitySelector {chat} class="order-1 md:order-3" />
  {/if}

  <Tooltip>
    <TooltipTrigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="outline"
          class="order-4 ml-auto px-2 md:h-[34px]"
          onclick={() => goto('/weixin')}
        >
          <WeChatIcon size={16} />
        </Button>
      {/snippet}
    </TooltipTrigger>
    <TooltipContent>微信扫码</TooltipContent>
  </Tooltip>

  <Tooltip>
    <TooltipTrigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="outline"
          class="order-4 px-2 md:h-[34px]"
          onclick={() => window.open('/walkie', '_blank', 'width=480,height=720')}
        >
          <WalkieTalkieIcon size={16} />
        </Button>
      {/snippet}
    </TooltipTrigger>
    <TooltipContent>对讲机</TooltipContent>
  </Tooltip>

  <img
    src="https://www.viitrix.cn/header-logo.png"
    alt="Viitrix"
    class="absolute left-1/2 -translate-x-1/2 h-8 object-contain"
  />

  {#if !user}
    <Button href="/signin" class="order-5 px-2 py-1.5 md:h-[34px]">Sign In</Button>
  {/if}
</header>
