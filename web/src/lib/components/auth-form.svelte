<script module lang="ts">
  export type FormSuccessData = {
    success: true;
  };
  export type FormFailureData = {
    success: false;
    message: string;
    email?: string;
  };
  export type FormData = FormSuccessData | FormFailureData;

  export type RoleOption = {
    name: string;
    displayName: string;
    description: string;
  };

  export type AuthFormProps = {
    form?: FormData;
    roles?: RoleOption[];
    submitButton: Snippet<[{ pending: boolean; success: boolean }]>;
    children: Snippet;
  };
</script>

<script lang="ts">
  import { enhance } from '$app/forms';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import type { SubmitFunction } from '@sveltejs/kit';
  import type { Snippet } from 'svelte';
  import { toast } from 'svelte-sonner';

  let { form, roles, submitButton, children }: AuthFormProps = $props();

  let pending = $state(false);
  const enhanceCallback: SubmitFunction<FormSuccessData, FormFailureData> = () => {
    pending = true;
    return async ({ result, update }) => {
      if (result.type === 'failure' && result.data?.message) {
        toast.error(result.data.message, { duration: 5000 });
      }
      pending = false;
      return update();
    };
  };

  const defaultValue = $derived.by(() => {
    if (!form?.success && form?.email) {
      return form.email;
    }
    return undefined;
  });
</script>

<form method="POST" class="flex flex-col gap-4 px-4 sm:px-16" use:enhance={enhanceCallback}>
  <div class="flex flex-col gap-2">
    <Label for="email" class=" text-zinc-600 dark:text-zinc-400">Email Address</Label>

    <Input
      id="email"
      name="email"
      class="text-md bg-muted md:text-sm"
      type="email"
      placeholder="user@acme.com"
      autocomplete="email"
      required
      autofocus
      {defaultValue}
    />
  </div>

  <div class="flex flex-col gap-2">
    <Label for="password" class="text-zinc-600 dark:text-zinc-400">Password</Label>

    <Input
      id="password"
      name="password"
      class="text-md bg-muted md:text-sm"
      type="password"
      required
    />
  </div>

  {#if roles}
    <div class="flex flex-col gap-2">
      <Label class="text-zinc-600 dark:text-zinc-400">角色</Label>
      {#if roles.length > 0}
        <div class="flex gap-3">
          {#each roles as role, i (role.name)}
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="role" value={role.name} checked={i === 0} class="accent-zinc-900 dark:accent-zinc-100" />
              <span class="text-sm text-zinc-700 dark:text-zinc-300">{role.displayName}</span>
            </label>
          {/each}
        </div>
      {:else}
        <span class="text-sm text-muted-foreground">加载中...</span>
      {/if}
    </div>
  {/if}

  {@render submitButton({ pending, success: !!form?.success })}
  {@render children()}
</form>
