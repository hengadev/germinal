<script lang="ts">
	import { Plus, Calendar, MapPin, Eye, EyeOff, Edit, Trash2 } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function formatDate(date: Date | string): string {
		return new Date(date).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	function formatDateTime(date: Date | string): string {
		return new Date(date).toLocaleString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<svelte:head>
	<title>Events | Admin Dashboard</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
	<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
		<div>
			<h1 class="text-3xl lg:text-4xl font-bold mb-2">Events</h1>
			<p class="text-dark-400">
				Manage your events and exhibitions
			</p>
		</div>
		<a
			href="/admin/events/new"
			class="inline-flex items-center gap-2 px-4 py-2 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors self-start"
		>
			<Plus size={18} />
			<span>New Event</span>
		</a>
	</div>

	{#if data.events.length === 0}
		<div class="bg-white rounded-lg border border-border-card p-12 text-center">
			<Calendar size={48} class="mx-auto mb-4 text-dark-300" />
			<h3 class="text-xl font-semibold text-dark-900 mb-2">No events yet</h3>
			<p class="text-dark-400 mb-6">Create your first event to get started</p>
			<a
				href="/admin/events/new"
				class="inline-flex items-center gap-2 px-4 py-2 bg-dark-900 text-white rounded-lg hover:bg-dark-800 transition-colors"
			>
				<Plus size={18} />
				<span>Create Event</span>
			</a>
		</div>
	{:else}
		<!-- Table view for desktop -->
		<div class="bg-white rounded-lg border border-border-card overflow-hidden hidden lg:block">
			<table class="w-full">
				<thead class="bg-dark-50 border-b border-border-card">
					<tr>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Event
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Date
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Location
						</th>
						<th class="px-6 py-4 text-left text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Status
						</th>
						<th class="px-6 py-4 text-right text-xs font-semibold text-dark-600 uppercase tracking-wider">
							Actions
						</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border-card">
					{#each data.events as event}
						<tr class="hover:bg-dark-50 transition-colors">
							<td class="px-6 py-4">
								<div class="flex items-center gap-4">
									{#if event.coverMedia?.url}
										<img
											src={event.coverMedia.url}
											alt={event.title}
											class="w-16 h-16 object-cover rounded-lg"
										/>
									{:else}
										<div class="w-16 h-16 bg-dark-100 rounded-lg flex items-center justify-center">
											<Calendar size={24} class="text-dark-300" />
										</div>
									{/if}
									<div>
										<div class="font-medium text-dark-900">{event.title}</div>
										<div class="text-sm text-dark-400">{event.slug}</div>
									</div>
								</div>
							</td>
							<td class="px-6 py-4">
								<div class="text-sm">
									<div class="font-medium text-dark-900">{formatDate(event.startDate)}</div>
									<div class="text-dark-400">
										{formatDateTime(event.startDate)} - {formatDateTime(event.endDate)}
									</div>
								</div>
							</td>
							<td class="px-6 py-4">
								<div class="flex items-center gap-2 text-sm text-dark-600">
									<MapPin size={16} />
									<span class="truncate max-w-[200px]">{event.location}</span>
								</div>
							</td>
							<td class="px-6 py-4">
								{#if event.published}
									<span
										class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-green-50 text-green-700 rounded-full"
									>
										<Eye size={14} />
										Published
									</span>
								{:else}
									<span
										class="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-dark-100 text-dark-600 rounded-full"
									>
										<EyeOff size={14} />
										Draft
									</span>
								{/if}
							</td>
							<td class="px-6 py-4">
								<div class="flex items-center justify-end gap-2">
									<a
										href="/admin/events/{event.id}"
										class="p-2 text-dark-600 hover:text-dark-900 hover:bg-dark-50 rounded-lg transition-colors"
										title="Edit"
									>
										<Edit size={18} />
									</a>
									<button
										class="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors"
										title="Delete"
									>
										<Trash2 size={18} />
									</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Card view for mobile -->
		<div class="lg:hidden space-y-4">
			{#each data.events as event}
				<div class="bg-white rounded-lg border border-border-card p-4">
					<div class="flex gap-4 mb-4">
						{#if event.coverMedia?.url}
							<img
								src={event.coverMedia.url}
								alt={event.title}
								class="w-20 h-20 object-cover rounded-lg flex-shrink-0"
							/>
						{:else}
							<div class="w-20 h-20 bg-dark-100 rounded-lg flex items-center justify-center flex-shrink-0">
								<Calendar size={24} class="text-dark-300" />
							</div>
						{/if}
						<div class="flex-1 min-w-0">
							<div class="flex items-start justify-between gap-2 mb-1">
								<h3 class="font-semibold text-dark-900 truncate">{event.title}</h3>
								{#if event.published}
									<span class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700 rounded-full flex-shrink-0">
										<Eye size={12} />
									</span>
								{:else}
									<span class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-dark-100 text-dark-600 rounded-full flex-shrink-0">
										<EyeOff size={12} />
									</span>
								{/if}
							</div>
							<div class="text-sm text-dark-400 mb-1">{formatDate(event.startDate)}</div>
							<div class="flex items-center gap-1 text-sm text-dark-600">
								<MapPin size={14} />
								<span class="truncate">{event.location}</span>
							</div>
						</div>
					</div>
					<div class="flex items-center justify-end gap-2 pt-3 border-t border-border-card">
						<a
							href="/admin/events/{event.id}"
							class="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-dark-600 hover:text-dark-900 hover:bg-dark-50 rounded-lg transition-colors"
						>
							<Edit size={16} />
							Edit
						</a>
						<button
							class="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-900 hover:bg-red-50 rounded-lg transition-colors"
						>
							<Trash2 size={16} />
							Delete
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
