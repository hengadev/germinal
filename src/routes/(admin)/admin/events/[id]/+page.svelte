<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowLeft, Calendar, MapPin, Type, FileText } from 'lucide-svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let title = $state(data.event.title);
	let slug = $state(data.event.slug);
	let description = $state(data.event.description);
	let subtitle = $state(data.event.subtitle || "");
	let startDate = $state(
		new Date(data.event.startDate).toISOString().slice(0, 16)
	);
	let endDate = $state(
		new Date(data.event.endDate).toISOString().slice(0, 16)
	);
	let location = $state(data.event.location);
	let venueName = $state(data.event.venueName || "");
	let streetAddress = $state(data.event.streetAddress || "");
	let district = $state(data.event.district || "");
	let city = $state(data.event.city || "");
	let postalCode = $state(data.event.postalCode || "");
	let country = $state(data.event.country || "");
	let collaborators = $state<Array<{name: string, role: string}>>(
		data.event.collaborators ? JSON.parse(data.event.collaborators) : []
	);
	let timings = $state<Array<{label: string, time: string}>>(
		data.event.timings ? JSON.parse(data.event.timings) : []
	);
	let curator = $state(data.event.curator || "");
	let materials = $state(data.event.materials || "");
	let admissionInfo = $state(data.event.admissionInfo || "");
	let published = $state(data.event.published);
</script>

<svelte:head>
	<title>Edit Event | Admin Dashboard</title>
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
			<h1 class="text-3xl lg:text-4xl font-bold mb-2">Edit Event</h1>
			<p class="text-dark-400">
				Updating "{data.event.title}"
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

				<!-- Subtitle -->
				<div>
					<label for="subtitle" class="block text-sm font-medium text-dark-700 mb-2">
						Subtitle (Optional)
					</label>
					<div class="relative">
						<FileText
							size={18}
							class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
						/>
						<input
							id="subtitle"
							name="subtitle"
							type="text"
							bind:value={subtitle}
							placeholder="A short tagline for the event..."
							class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent"
						/>
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

				<!-- Venue Details -->
				<div class="space-y-4">
					<h3 class="text-sm font-medium text-dark-700">Venue Details (Optional)</h3>

					<div>
						<label for="venueName" class="block text-sm font-medium text-dark-600 mb-2">
							Venue Name
						</label>
						<input
							id="venueName"
							name="venueName"
							type="text"
							bind:value={venueName}
							placeholder="e.g., Central Convention Center"
							class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
						/>
					</div>

					<div>
						<label for="streetAddress" class="block text-sm font-medium text-dark-600 mb-2">
							Street Address
						</label>
						<input
							id="streetAddress"
							name="streetAddress"
							type="text"
							bind:value={streetAddress}
							placeholder="e.g., 123 Main Street"
							class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
						/>
					</div>

					<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
						<div>
							<label for="district" class="block text-sm font-medium text-dark-600 mb-2">
								District
							</label>
							<input
								id="district"
								name="district"
								type="text"
								bind:value={district}
								placeholder="e.g., Downtown"
								class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
							/>
						</div>
						<div>
							<label for="city" class="block text-sm font-medium text-dark-600 mb-2">
								City
							</label>
							<input
								id="city"
								name="city"
								type="text"
								bind:value={city}
								placeholder="e.g., Tokyo"
								class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
							/>
						</div>
						<div>
							<label for="postalCode" class="block text-sm font-medium text-dark-600 mb-2">
								Postal Code
							</label>
							<input
								id="postalCode"
								name="postalCode"
								type="text"
								bind:value={postalCode}
								placeholder="e.g., 12345"
								class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
							/>
						</div>
					</div>

					<div>
						<label for="country" class="block text-sm font-medium text-dark-600 mb-2">
							Country
						</label>
						<input
							id="country"
							name="country"
							type="text"
							bind:value={country}
							placeholder="e.g., Japan"
							class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
						/>
					</div>
				</div>

				<!-- Collaborators -->
				<div>
					<label class="block text-sm font-medium text-dark-700 mb-2">
						Collaborators (Optional)
					</label>
					<p class="text-xs text-dark-400 mb-3">Add collaborating talents or partners</p>

					<div class="space-y-2">
						{#each collaborators as collab, i}
							<div class="flex gap-2">
								<input
									type="text"
									bind:value={collaborators[i].name}
									placeholder="Name"
									class="flex-1 px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
								/>
								<input
									type="text"
									bind:value={collaborators[i].role}
									placeholder="Role"
									class="flex-1 px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
								/>
								<button
									type="button"
									onclick={() => collaborators = collaborators.filter((_, idx) => idx !== i)}
									class="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
								>
									Remove
								</button>
							</div>
						{/each}

						<button
							type="button"
							onclick={() => collaborators = [...collaborators, {name: "", role: ""}]}
							class="text-sm text-dark-600 hover:text-dark-900 font-medium"
						>
							+ Add Collaborator
						</button>
					</div>

					<input type="hidden" name="collaborators" value={JSON.stringify(collaborators.filter(c => c.name.trim() && c.role.trim()))} />
				</div>

				<!-- Timings -->
				<div>
					<label class="block text-sm font-medium text-dark-700 mb-2">
						Event Timings (Optional)
					</label>
					<p class="text-xs text-dark-400 mb-3">Add schedule information for different sessions</p>

					<div class="space-y-2">
						{#each timings as timing, i}
							<div class="flex gap-2">
								<input
									type="text"
									bind:value={timings[i].label}
									placeholder="e.g., Opening Night"
									class="flex-1 px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
								/>
								<input
									type="text"
									bind:value={timings[i].time}
									placeholder="e.g., 18:00 - 22:00"
									class="flex-1 px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
								/>
								<button
									type="button"
									onclick={() => timings = timings.filter((_, idx) => idx !== i)}
									class="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
								>
									Remove
								</button>
							</div>
						{/each}

						<button
							type="button"
							onclick={() => timings = [...timings, {label: "", time: ""}]}
							class="text-sm text-dark-600 hover:text-dark-900 font-medium"
						>
							+ Add Timing
						</button>
					</div>

					<input type="hidden" name="timings" value={JSON.stringify(timings.filter(t => t.label.trim() && t.time.trim()))} />
				</div>

				<!-- Event Details -->
				<div class="space-y-4">
					<h3 class="text-sm font-medium text-dark-700">Additional Details (Optional)</h3>

					<div>
						<label for="curator" class="block text-sm font-medium text-dark-600 mb-2">
							Curator
						</label>
						<input
							id="curator"
							name="curator"
							type="text"
							bind:value={curator}
							placeholder="e.g., John Smith"
							class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
						/>
					</div>

					<div>
						<label for="materials" class="block text-sm font-medium text-dark-600 mb-2">
							Materials
						</label>
						<input
							id="materials"
							name="materials"
							type="text"
							bind:value={materials}
							placeholder="e.g., Canvas, Wood, Digital"
							class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
						/>
					</div>

					<div>
						<label for="admissionInfo" class="block text-sm font-medium text-dark-600 mb-2">
							Admission Info
						</label>
						<input
							id="admissionInfo"
							name="admissionInfo"
							type="text"
							bind:value={admissionInfo}
							placeholder="e.g., Free, $25, Members Only"
							class="w-full px-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
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
						value="true"
						class="w-5 h-5 text-dark-900 border-border-dark rounded focus:ring-dark-900"
					/>
					<div>
						<label for="published" class="block text-sm font-medium text-dark-900 cursor-pointer">
							Published
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
						class="flex-1 px-6 py-3 bg-dark-900 text-white rounded-lg hover:bg-dark-800 focus:outline-none focus:ring-2 focus:ring-dark-900 focus:ring-offset-2 transition-colors font-medium"
					>
						Update Event
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
