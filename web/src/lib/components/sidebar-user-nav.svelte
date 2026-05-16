<script lang="ts">
  import type { User } from '$lib/server/db/schema';
  import { cn } from '$lib/utils/shadcn';
  import ChevronUp from './icons/chevron-up.svelte';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
  } from './ui/dropdown-menu';
  import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from './ui/sidebar';
  import { getTheme } from '@sejohnson/svelte-themes';

  let { user }: { user: User } = $props();
  const theme = getTheme();
</script>

<SidebarMenu>
  <SidebarMenuItem>
    <DropdownMenu>
      <DropdownMenuTrigger>
        {#snippet child({ props })}
          <SidebarMenuButton
            {...props}
            class="bg-background data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground h-10"
          >
            <div
              class="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase"
            >
              {user.email?.[0] ?? 'U'}
            </div>
            <span class="truncate">{user?.email}</span>
            <ChevronUp class="ml-auto" />
          </SidebarMenuButton>
        {/snippet}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" class="w-[--bits-floating-anchor-width]">
        <DropdownMenuItem
          class="cursor-pointer"
          onSelect={() =>
            (theme.selectedTheme = theme.resolvedTheme === 'light' ? 'dark' : 'light')}
        >
          切换{theme.resolvedTheme === 'light' ? '暗色' : '浅色'}模式
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          {#snippet child({ props })}
            <a
              {...props}
              href="/signout"
              class={cn('w-full cursor-pointer', props.class as string)}
              data-sveltekit-preload-data="false"
              data-sveltekit-reload>登出</a
            >
          {/snippet}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </SidebarMenuItem>
</SidebarMenu>
