<script lang="ts">
    import { enhance } from '$app/forms';
    import { ArrowLeft, Upload, Trash2, Image, Video } from 'lucide-svelte';
    import { getToastContext } from '$lib/components/toast/state.svelte';
    import type { PageData } from './$types';

    let { data }: { data: PageData } = $props();

    const toast = getToastContext();

    let heroImageFile = $state<File | null>(null);
    let heroVideoFile = $state<File | null>(null);
    let heroImageInput: HTMLInputElement;
    let heroVideoInput: HTMLInputElement;

    function makeEnhance(label: string) {
        return ({ formData }: { formData: FormData }) =>
            async ({ result, update }: { result: import('@sveltejs/kit').ActionResult; update: () => Promise<void> }) => {
                if (result.type === 'success') {
                    toast.success('Succès', `${label} mis à jour`);
                    heroImageFile = null;
                    heroVideoFile = null;
                    await update();
                } else if (result.type === 'failure') {
                    const err = (result.data as { error?: string })?.error ?? 'Une erreur est survenue';
                    toast.error('Erreur', err);
                }
            };
    }

    function makeClearEnhance(label: string) {
        return async ({ result, update }: { result: import('@sveltejs/kit').ActionResult; update: () => Promise<void> }) => {
            if (result.type === 'success') {
                toast.success('Supprimé', `${label} supprimé`);
                await update();
            } else if (result.type === 'failure') {
                const err = (result.data as { error?: string })?.error ?? 'Une erreur est survenue';
                toast.error('Erreur', err);
            }
        };
    }

    const settings = $derived(data.settings);
    const hasBoth = $derived(!!(settings?.heroImageId && settings?.heroVideoId));
</script>

<svelte:head>
    <title>Paramètres | Tableau de bord Admin</title>
</svelte:head>

<div class="min-h-screen bg-muted">
    <nav class="bg-background border-b border-border-card">
        <div class="container mx-auto px-4">
            <div class="flex items-center h-16">
                <a
                    href="/admin"
                    class="flex items-center gap-2 text-foreground-alt hover:text-foreground transition-colors"
                >
                    <ArrowLeft size={20} />
                    <span>Retour au Tableau de Bord</span>
                </a>
            </div>
        </div>
    </nav>

    <main class="container mx-auto px-4 py-12">
        <div class="max-w-2xl mx-auto grid gap-8">
            <div>
                <h1 class="text-2xl font-bold">Paramètres du Site</h1>
                <p class="text-muted-foreground mt-1 text-sm">Configurez les médias de la page d'accueil.</p>
            </div>

            {#if hasBoth}
                <div class="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3">
                    <p class="text-sm text-amber-800 dark:text-amber-300">La vidéo est prioritaire sur l'image lorsque les deux sont définies.</p>
                </div>
            {/if}

            <!-- Hero Image -->
            <div class="bg-background rounded-lg border border-border-card p-6 grid gap-5">
                <div class="flex items-center gap-3">
                    <Image size={20} class="text-muted-foreground" />
                    <div>
                        <h2 class="font-semibold">Image Hero</h2>
                        <p class="text-xs text-muted-foreground">Accepte: JPEG, PNG, WebP, GIF</p>
                    </div>
                </div>

                {#if settings?.heroImage}
                    <div class="relative">
                        <img
                            src={settings.heroImage.url}
                            alt="Hero actuel"
                            class="w-full max-h-48 object-cover rounded-md border border-border-card"
                        />
                        <p class="text-xs text-muted-foreground mt-1">
                            {(settings.heroImage.size / 1024).toFixed(0)} Ko · {settings.heroImage.mimeType}
                        </p>
                    </div>

                    <form
                        method="POST"
                        action="?/clearHeroImage"
                        use:enhance={makeClearEnhance('Image hero')}
                    >
                        <button
                            type="submit"
                            class="flex items-center gap-2 px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                        >
                            <Trash2 size={16} />
                            Supprimer l'image hero
                        </button>
                    </form>
                {:else}
                    <p class="text-sm text-muted-foreground">Aucune image hero définie — l'image statique par défaut est utilisée.</p>
                {/if}

                <form
                    method="POST"
                    action="?/uploadHeroImage"
                    enctype="multipart/form-data"
                    use:enhance={makeEnhance('Image hero')}
                    class="grid gap-3"
                >
                    <input
                        bind:this={heroImageInput}
                        type="file"
                        name="file"
                        accept="image/*"
                        class="hidden"
                        onchange={(e) => {
                            const f = (e.target as HTMLInputElement).files?.[0];
                            heroImageFile = f ?? null;
                        }}
                    />
                    <div class="flex items-center gap-3">
                        <button
                            type="button"
                            onclick={() => heroImageInput.click()}
                            class="flex items-center gap-2 px-4 py-2 text-sm border border-border-card rounded-lg hover:bg-muted transition-colors"
                        >
                            <Upload size={16} />
                            {heroImageFile ? heroImageFile.name : 'Choisir un fichier'}
                        </button>
                        {#if heroImageFile}
                            <button
                                type="submit"
                                class="flex items-center gap-2 px-4 py-2 text-sm bg-foreground text-background rounded-lg hover:opacity-80 transition-opacity"
                            >
                                Enregistrer
                            </button>
                        {/if}
                    </div>
                </form>
            </div>

            <!-- Hero Video -->
            <div class="bg-background rounded-lg border border-border-card p-6 grid gap-5">
                <div class="flex items-center gap-3">
                    <Video size={20} class="text-muted-foreground" />
                    <div>
                        <h2 class="font-semibold">Vidéo Hero</h2>
                        <p class="text-xs text-muted-foreground">Accepte: MP4, WebM, QuickTime · Lecture automatique, muet, en boucle</p>
                    </div>
                </div>

                {#if settings?.heroVideo}
                    <div>
                        <video
                            src={settings.heroVideo.url}
                            class="w-full max-h-48 object-cover rounded-md border border-border-card"
                            autoplay
                            muted
                            loop
                            playsinline
                        ></video>
                        <p class="text-xs text-muted-foreground mt-1">
                            {(settings.heroVideo.size / 1024 / 1024).toFixed(1)} Mo · {settings.heroVideo.mimeType}
                        </p>
                    </div>

                    <form
                        method="POST"
                        action="?/clearHeroVideo"
                        use:enhance={makeClearEnhance('Vidéo hero')}
                    >
                        <button
                            type="submit"
                            class="flex items-center gap-2 px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                        >
                            <Trash2 size={16} />
                            Supprimer la vidéo hero
                        </button>
                    </form>
                {:else}
                    <p class="text-sm text-muted-foreground">Aucune vidéo hero définie.</p>
                {/if}

                <form
                    method="POST"
                    action="?/uploadHeroVideo"
                    enctype="multipart/form-data"
                    use:enhance={makeEnhance('Vidéo hero')}
                    class="grid gap-3"
                >
                    <input
                        bind:this={heroVideoInput}
                        type="file"
                        name="file"
                        accept="video/*"
                        class="hidden"
                        onchange={(e) => {
                            const f = (e.target as HTMLInputElement).files?.[0];
                            heroVideoFile = f ?? null;
                        }}
                    />
                    <div class="flex items-center gap-3">
                        <button
                            type="button"
                            onclick={() => heroVideoInput.click()}
                            class="flex items-center gap-2 px-4 py-2 text-sm border border-border-card rounded-lg hover:bg-muted transition-colors"
                        >
                            <Upload size={16} />
                            {heroVideoFile ? heroVideoFile.name : 'Choisir un fichier'}
                        </button>
                        {#if heroVideoFile}
                            <button
                                type="submit"
                                class="flex items-center gap-2 px-4 py-2 text-sm bg-foreground text-background rounded-lg hover:opacity-80 transition-opacity"
                            >
                                Enregistrer
                            </button>
                        {/if}
                    </div>
                </form>
            </div>
        </div>
    </main>
</div>
