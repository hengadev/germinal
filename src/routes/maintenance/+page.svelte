<script lang="ts">
    // The upcoming season, so the teaser never shows a season that has already passed.
    // Meteorological seasons: Winter starts in December, Spring in March, Summer in June, Autumn in September.
    // A season is labelled with the year it starts in (Winter starting December 2026 = "Winter 2026").
    const SEASONS = ['Winter', 'Spring', 'Summer', 'Autumn'] as const;

    function nextSeason(now: Date): string {
        const month = now.getMonth(); // 0-11
        const current = Math.floor(((month + 1) % 12) / 3); // Dec-Feb → 0, Mar-May → 1, …
        const next = (current + 1) % 4;
        const startMonth = [11, 2, 5, 8][next];
        const year = startMonth < month ? now.getFullYear() + 1 : now.getFullYear();
        return `${SEASONS[next]} ${year}`;
    }

    const season = nextSeason(new Date());
</script>

<svelte:head>
    <title>Germinal</title>
    <meta name="robots" content="noindex" />
    <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate" />
    <meta http-equiv="Pragma" content="no-cache" />
</svelte:head>

<div class="min-h-screen bg-foreground flex items-center justify-center px-4">
    <div class="text-center text-background">
        <h1 class="text-5xl md:text-6xl font-bold tracking-widest uppercase mb-6">Germinal</h1>
        <p class="text-background/60 text-sm tracking-widest uppercase">An experience is being prepared &mdash; {season}</p>
    </div>
</div>
