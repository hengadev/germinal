<script lang="ts">
	// « Nouvel événement » (ADR 0008, issue 036): the Event editor with no
	// Event yet — the first save of any tab creates the Draft.
	import type { PageData } from './$types';
	import EventEditor from '../[id]/EventEditor.svelte';

	let { data }: { data: PageData } = $props();
</script>

<EventEditor {data} />
