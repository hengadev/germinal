<script lang="ts">
    import { onMount } from 'svelte';
    import { t } from 'svelte-i18n';

    const DISMISSED_KEY = 'pwa-install-dismissed';
    const DISMISSED_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

    let deferredPrompt: any = null;
    let visible = $state(false);

    onMount(() => {
        // Don't show if already running as installed PWA
        if (window.matchMedia('(display-mode: standalone)').matches) return;

        // Don't show if dismissed recently
        const dismissed = localStorage.getItem(DISMISSED_KEY);
        if (dismissed && Date.now() - parseInt(dismissed) < DISMISSED_DURATION_MS) return;

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            setTimeout(() => { visible = true; }, 2500);
        });

        window.addEventListener('appinstalled', () => {
            visible = false;
            deferredPrompt = null;
        });
    });

    async function install() {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') visible = false;
        deferredPrompt = null;
    }

    function dismiss() {
        visible = false;
        localStorage.setItem(DISMISSED_KEY, Date.now().toString());
    }
</script>

<div
    class="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-50 rounded-xl border border-border-card bg-background p-4 shadow-popover pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4"
    style="transition: opacity 300ms; opacity: {visible ? 1 : 0}; pointer-events: {visible ? 'auto' : 'none'};"
    aria-hidden={!visible}
>
    <div class="flex items-start gap-3">
        <img src="/pwa-192x192.png" alt="Germinal" class="h-10 w-10 rounded-xl flex-shrink-0" />
        <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-foreground">{$t('pwa.installTitle')}</p>
            <p class="mt-0.5 text-xs text-muted-foreground">{$t('pwa.installDescription')}</p>
            <div class="mt-3 flex items-center gap-2">
                <button
                    onclick={install}
                    class="rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:bg-foreground/80 transition-colors"
                >
                    {$t('pwa.installButton')}
                </button>
                <button
                    onclick={dismiss}
                    class="text-xs text-muted-foreground hover:text-foreground-alt transition-colors"
                >
                    {$t('pwa.installDismiss')}
                </button>
            </div>
        </div>
        <button
            onclick={dismiss}
            aria-label={$t('pwa.close')}
            class="text-muted-foreground hover:text-foreground-alt transition-colors flex-shrink-0"
        >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
        </button>
    </div>
</div>
