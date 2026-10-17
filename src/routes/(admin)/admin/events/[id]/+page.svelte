<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import EventEditor from './EventEditor.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<EventEditor {data} {form} />
