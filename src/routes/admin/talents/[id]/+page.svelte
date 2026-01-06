<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowLeft, User, Briefcase, FileText, Link as LinkIcon } from 'lucide-svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let firstName = $state(data.talent.firstName);
	let lastName = $state(data.talent.lastName);
	let role = $state(data.talent.role);
	let bio = $state(data.talent.bio);
	let instagram = $state(data.talent.socialLinks?.instagram || '');
	let linkedin = $state(data.talent.socialLinks?.linkedin || '');
	let twitter = $state(data.talent.socialLinks?.twitter || '');
	let website = $state(data.talent.socialLinks?.website || '');
	let published = $state(data.talent.published);
</script>

<svelte:head>
	<title>Edit Talent | Admin Dashboard</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 lg:py-12">
	<div class="max-w-3xl mx-auto">
		<div class="mb-8">
			<a
				href="/admin/talents"
				class="inline-flex items-center gap-2 text-dark-600 hover:text-dark-900 transition-colors mb-4"
			>
				<ArrowLeft size={20} />
				<span>Back to Talents</span>
			</a>
			<h1 class="text-3xl lg:text-4xl font-bold mb-2">Edit Talent</h1>
			<p class="text-dark-400">
				Updating "{data.talent.firstName} {data.talent.lastName}"
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
				<!-- Name -->
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
					<div>
						<label for="firstName" class="block text-sm font-medium text-dark-700 mb-2">
							First Name <span class="text-red-500">*</span>
						</label>
						<div class="relative">
							<User
								size={18}
								class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
							/>
							<input
								id="firstName"
								name="firstName"
								type="text"
								bind:value={firstName}
								required
								placeholder="Sarah"
								class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent"
							/>
						</div>
					</div>

					<div>
						<label for="lastName" class="block text-sm font-medium text-dark-700 mb-2">
							Last Name <span class="text-red-500">*</span>
						</label>
						<div class="relative">
							<User
								size={18}
								class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
							/>
							<input
								id="lastName"
								name="lastName"
								type="text"
								bind:value={lastName}
								required
								placeholder="Johnson"
								class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent"
							/>
						</div>
					</div>
				</div>

				<!-- Role -->
				<div>
					<label for="role" class="block text-sm font-medium text-dark-700 mb-2">
						Role <span class="text-red-500">*</span>
					</label>
					<div class="relative">
						<Briefcase
							size={18}
							class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
						/>
						<input
							id="role"
							name="role"
							type="text"
							bind:value={role}
							required
							placeholder="Lead Vocalist & Songwriter"
							class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent"
						/>
					</div>
				</div>

				<!-- Bio -->
				<div>
					<label for="bio" class="block text-sm font-medium text-dark-700 mb-2">
						Bio <span class="text-red-500">*</span>
					</label>
					<div class="relative">
						<FileText
							size={18}
							class="absolute left-3 top-3 text-dark-400"
						/>
						<textarea
							id="bio"
							name="bio"
							bind:value={bio}
							required
							rows="5"
							placeholder="Tell us about this talent..."
							class="w-full pl-10 pr-4 py-3 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent resize-none"
						></textarea>
					</div>
				</div>

				<!-- Social Links -->
				<div class="space-y-4">
					<h3 class="text-sm font-medium text-dark-700">Social Links (Optional)</h3>

					<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div>
							<label for="instagram" class="block text-sm font-medium text-dark-600 mb-2">
								Instagram
							</label>
							<div class="relative">
								<LinkIcon
									size={18}
									class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
								/>
								<input
									id="instagram"
									name="instagram"
									type="url"
									bind:value={instagram}
									placeholder="https://instagram.com/username"
									class="w-full pl-10 pr-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
								/>
							</div>
						</div>

						<div>
							<label for="linkedin" class="block text-sm font-medium text-dark-600 mb-2">
								LinkedIn
							</label>
							<div class="relative">
								<LinkIcon
									size={18}
									class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
								/>
								<input
									id="linkedin"
									name="linkedin"
									type="url"
									bind:value={linkedin}
									placeholder="https://linkedin.com/in/username"
									class="w-full pl-10 pr-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
								/>
							</div>
						</div>

						<div>
							<label for="twitter" class="block text-sm font-medium text-dark-600 mb-2">
								Twitter
							</label>
							<div class="relative">
								<LinkIcon
									size={18}
									class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
								/>
								<input
									id="twitter"
									name="twitter"
									type="url"
									bind:value={twitter}
									placeholder="https://twitter.com/username"
									class="w-full pl-10 pr-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
								/>
							</div>
						</div>

						<div>
							<label for="website" class="block text-sm font-medium text-dark-600 mb-2">
								Website
							</label>
							<div class="relative">
								<LinkIcon
									size={18}
									class="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400"
								/>
								<input
									id="website"
									name="website"
									type="url"
									bind:value={website}
									placeholder="https://example.com"
									class="w-full pl-10 pr-4 py-2.5 border border-border-dark rounded-lg focus:outline-none focus:ring-2 focus:ring-dark-900 focus:border-transparent text-sm"
								/>
							</div>
						</div>
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
						Update Talent
					</button>
					<a
						href="/admin/talents"
						class="flex-1 px-6 py-3 bg-white border border-border-dark text-dark-700 rounded-lg hover:bg-dark-50 focus:outline-none focus:ring-2 focus:ring-dark-900 focus:ring-offset-2 transition-colors font-medium text-center"
					>
						Cancel
					</a>
				</div>
			</form>
		</div>
	</div>
</div>
