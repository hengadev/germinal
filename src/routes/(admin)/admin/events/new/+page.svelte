<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowLeft, Calendar, MapPin, Type, FileText } from 'lucide-svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let title = $state('');
	let slug = $state('');
	let description = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let location = $state('');
	let published = $state(false);

	// Auto-generate slug from title
	$effect(() => {
		if (title && !slug) {
			slug = title
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '');
		}
	});
</script>

<svelte:head>
	<title>New Event | Admin Dashboard</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
	<div class="max-w-3xl mx-auto">
		<div class="mb-8">
			<a
				href="/admin/events"
				class="inline-flex items-center gap-2 text-dark-600 hover:text-dark-900 transition-colors mb-4"
			>
				<ArrowLeft size={20} />
				<span>Back to Events</span>
			</a>
			<h1 class="text-3xl lg:text-4xl font-bold mb-2">Create New Event</h1>
			<p class="text-dark-400">
				Fill in the details to create a new event
			</p>
		</div>

		{#if form?.error}
			<div class="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
				<p class="text-sm font-medium">{form.error}</p>
			</div>
		{/if}

		{#if form?.success}
			<div class="mb-6 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
				<p class="text-sm font-medium">{form.success}</p>
			</div>
		{/if}

		<div class="bg-white rounded-lg border border-border-card p-6 lg:p-8">
			<form method="POST" use:enhance class="space-y-6">
				<!-- Title -->
				<div>
					<label for="title" class="block text-sm font-medium text-dark-700 mb-2">
						Title <span class="text-red-500">*</span>
					</label>
					<div class="relative">
						<Type
							size={18}
							class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
						/>
						<input
							id="title"
							name="title"
							type="text"
							bind:value={title}
							required
							placeholder="Summer Music Festival 2026"
							class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent"
						/>
					</div>
				</div>

				<!-- Slug -->
				<div>
					<label for="slug" class="block text-sm font-medium text-dark-700 mb-2">
						Slug <span class="text-red-500">*</span>
					</label>
					<div class="relative">
						<Type
							size={18}
							class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
						/>
						<input
							id="slug"
							name="slug"
							type="text"
							bind:value={slug}
							required
							pattern="[a-z0-9-]+"
							placeholder="summer-music-festival-2026"
							class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent font-mono text-sm"
						/>
					</div>
					<p class="mt-1 text-xs text-dark-400">
						URL-friendly version of the title (lowercase, hyphens only)
					</p>
				</div>

				<!-- Description -->
				<div>
					<label for="description" class="block text-sm font-medium text-dark-700 mb-2">
						Description <span class="text-red-500">*</span>
					</label>
					<div class="relative">
						<FileText
							size={18}
							class="absolute left-3 top-3 text-dark-400"
						/>
						<textarea
							id="description"
							name="description"
							bind:value={description}
							required
							rows="5"
							placeholder="Describe your event..."
							class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent resize-none"
						></textarea>
					</div>
				</div>

				<!-- Dates -->
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div>
						<label for="startDate" class="block text-sm font-medium text-dark-700 mb-2">
							Start Date <span class="text-red-500">*</span>
						</label>
						<div class="relative">
							<Calendar
								size={18}
								class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
							/>
							<input
								id="startDate"
								name="startDate"
								type="datetime-local"
								bind:value={startDate}
								required
								class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent"
							/>
						</div>
					</div>

					<div>
						<label for="endDate" class="block text-sm font-medium text-dark-700 mb-2">
							End Date <span class="text-red-500">*</span>
						</label>
						<div class="relative">
							<Calendar
								size={18}
								class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
							/>
							<input
								id="endDate"
								name="endDate"
								type="datetime-local"
								bind:value={endDate}
								required
								class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent"
							/>
						</div>
					</div>
				</div>

				<!-- Location -->
				<div>
					<label for="location" class="block text-sm font-medium text-dark-700 mb-2">
						Location <span class="text-red-500">*</span>
					</label>
					<div class="relative">
						<MapPin
							size={18}
							class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
						/>
						<input
							id="location"
							name="location"
							type="text"
							bind:value={location}
							required
							placeholder="Central Park, New York"
							class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent"
						/>
					</div>
				</div>

				<!-- Published Status -->
				<div class="flex items-center gap-3 p-4 bg-dark-50 rounded-lg">
					<input
						id="published"
						name="published"
						type="checkbox"
						bind:checked={published}
						class="w-5 h-5 text-dark-900 border-border-dark rounded focus:ring-dark-900"
					/>
					<div>
						<label for="published" class="block text-sm font-medium text-dark-900 cursor-pointer">
							Publish immediately
						</label>
						<p class="text-xs text-dark-400">
							Uncheck to save as draft
						</p>
					</div>
				</div>

				<!-- Submit Buttons -->
				<div class="flex flex-col sm:flex-row gap-3 pt-4 border-t border-border-card">
					<button
						type="submit"
						name="action"
						value="create"
						class="flex-1 px-6 py-3 bg-dark-900 text-white rounded-lg hover:bg-dark-800 focus:outline-none focus:ring-2 focus:ring-dark-900 focus:ring-offset-2 transition-colors font-medium"
					>
						Create Event
					</button>
					<a
						href="/admin/events"
						class="flex-1 px-6 py-3 bg-white border border-border-dark text-dark-700 rounded-lg hover:bg-dark-50 focus:outline-none focus:ring-2 focus:ring-dark-900 focus:ring-offset-2 transition-colors font-medium text-center"
					>
						Cancel
					</a>
				</div>
			</form>
		</div>
	</div>
</div>
