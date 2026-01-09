<script lang="ts">
    import { t } from 'svelte-i18n';
    import { reveal } from '$lib/actions/reveal';
</script>

<div use:reveal={{ preset: 'fade-down' }}>{$t('upcoming.title')}</div>
