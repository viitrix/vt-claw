<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { goto } from '$app/navigation';

  type RoleInfo = { name: string; displayName: string; description: string };
  type WxLoginResp = { status: string; qrcode?: string; rid?: string; error?: string };
  type QrStatusResp = { status: string };

  let roles = $state<RoleInfo[]>([]);
  let selectedRole = $state<string>('');
  let rid = $state<string | null>(null);
  let qrSrc = $state<string | null>(null);
  let status = $state<'init' | 'loading' | 'waiting' | 'scanned' | 'expired' | 'confirmed' | 'error'>('init');
  let errorMsg = $state('');

  let pollTimer: ReturnType<typeof setInterval> | null = null;

  async function loadRoles() {
    status = 'init';
    errorMsg = '';
    try {
      const resp = await fetch('/api/roles?channel=weixin');
      const data = await resp.json();
      if (data.status !== 'ok' || !data.roles?.length) {
        throw new Error(data.error || '获取角色列表失败');
      }
      roles = data.roles;
      selectedRole = roles[0].name;
      if (roles.length === 1) {
        startLogin();
      }
    } catch (err) {
      status = 'error';
      errorMsg = String(err);
    }
  }

  async function startLogin() {
    if (!selectedRole) return;
    status = 'loading';
    errorMsg = '';
    try {
      const resp = await fetch(`/api/wxlogin?role=${encodeURIComponent(selectedRole)}`, { method: 'POST' });
      const data: WxLoginResp = await resp.json();
      if (data.status !== 'ok' || !data.rid) {
        throw new Error(data.error || '获取二维码失败');
      }
      rid = data.rid;
      qrSrc = `/api/qrcode?rid=${encodeURIComponent(data.rid)}`;
      status = 'waiting';
      startPolling();
    } catch (err) {
      status = 'error';
      errorMsg = String(err);
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(pollStatus, 2000);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function pollStatus() {
    if (!rid) return;
    try {
      const resp = await fetch(`/api/qrstatus?rid=${encodeURIComponent(rid)}`);
      const data: QrStatusResp = await resp.json();
      switch (data.status) {
        case 'wait':
          status = 'waiting';
          break;
        case 'scaned':
          status = 'scanned';
          break;
        case 'expired':
          status = 'expired';
          stopPolling();
          break;
        case 'confirmed':
          status = 'confirmed';
          stopPolling();
          break;
      }
    } catch {
      // network error — keep polling
    }
  }

  function handleRetry() {
    stopPolling();
    rid = null;
    qrSrc = null;
    startLogin();
  }

  $effect(() => {
    loadRoles();
    return () => stopPolling();
  });
</script>

<div class="flex h-dvh flex-col items-center justify-center gap-6">
  <h1 class="text-2xl font-semibold">微信扫码登录</h1>

  {#if roles.length > 1 && (status === 'init' || status === 'error')}
    <div class="flex items-center gap-3">
      <label for="role-select" class="text-sm text-zinc-600 dark:text-zinc-400">选择角色</label>
      <select
        id="role-select"
        bind:value={selectedRole}
        class="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800"
      >
        {#each roles as r}
          <option value={r.name}>{r.displayName}</option>
        {/each}
      </select>
    </div>
  {/if}

  {#if status === 'init' && roles.length > 1}
    <Button onclick={startLogin} disabled={!selectedRole}>开始扫码登录</Button>
  {:else if status === 'loading'}
    <div class="flex h-70 w-70 items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
      <p class="text-sm text-zinc-500">二维码加载中...</p>
    </div>
  {:else if status === 'waiting' || status === 'scanned'}
    {#if qrSrc}
      <img
        src={qrSrc}
        alt="微信扫码二维码"
        class="h-70 w-70 rounded-xl border border-zinc-200 dark:border-zinc-700"
      />
    {/if}
    {#if status === 'waiting'}
      <p class="text-sm text-zinc-500">请使用微信扫描二维码</p>
    {:else}
      <p class="text-sm text-emerald-600">已扫描，请在手机上确认登录</p>
    {/if}
  {:else if status === 'expired'}
    <div class="flex h-70 w-70 items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
      <p class="text-sm text-zinc-500">二维码已过期</p>
    </div>
    <Button onclick={handleRetry}>重新获取二维码</Button>
  {:else if status === 'confirmed'}
    <div class="flex h-70 w-70 flex-col items-center justify-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950">
      <svg class="h-16 w-16 text-emerald-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
      <p class="text-sm font-medium text-emerald-700 dark:text-emerald-300">登录成功</p>
    </div>
  {:else if status === 'error'}
    <div class="flex h-70 w-70 flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
      <p class="text-sm text-red-600">加载失败</p>
      <p class="text-xs text-red-400">{errorMsg}</p>
    </div>
    <Button onclick={handleRetry}>重试</Button>
  {/if}

  <Button variant="outline" onclick={() => goto('/')}>返回聊天</Button>
</div>
