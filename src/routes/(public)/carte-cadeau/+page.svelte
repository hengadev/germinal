<script lang="ts">
	import { ArrowRight, AlertCircle } from "lucide-svelte";
	import { enhance } from "$app/forms";
	import { page } from "$app/state";
	import { t, locale } from "svelte-i18n";
	import type { ActionData } from "./$types";

	let { form }: { form: ActionData } = $props();

	const presets = [5000, 10000, 15000, 20000];
	let selectedAmount: string = $state("10000");
	let delivery: "buyer" | "recipient" = $state("buyer");
	let isSubmitting = $state(false);

	function formatEuro(cents: number): string {
		return new Intl.NumberFormat($locale === "en" ? "en-IE" : "fr-FR", {
			style: "currency",
			currency: "EUR",
			maximumFractionDigits: 0,
		}).format(cents / 100);
	}

	function value(key: string): string {
		if (form && "formData" in form && form.formData) {
			const v = (form.formData as Record<string, unknown>)[key];
			if (typeof v === "string") return v;
		}
		return "";
	}

	function fieldError(key: string): string | undefined {
		if (form && "fieldErrors" in form && form.fieldErrors) {
			const errors = (form.fieldErrors as Record<string, string[]>)[key];
			return Array.isArray(errors) && errors.length > 0 ? errors[0] : undefined;
		}
		return undefined;
	}

	function inputClass(hasError: boolean): string {
		return `w-full px-3 py-2 text-base border-b bg-transparent focus:outline-none focus:ring-0 focus:shadow-none focus:border-b-border ${
			hasError ? "border-b-red-500" : "border-b-border-input-hover"
		}`;
	}
</script>

<svelte:head>
	<title>{$t("giftCard.pageTitle")}</title>
</svelte:head>

<div class="container mx-auto px-4 py-32 max-w-8xl">
	<div class="mb-8 lg:mb-16 grid gap-4">
		<h1 class="text-3xl lg:text-4xl font-serif">{$t("giftCard.title")}</h1>
		<p class="text-muted-foreground text-base lg:text-lg max-w-160">
			{$t("giftCard.description")}
		</p>
	</div>

	<div class="mt-8 lg:mt-16 max-w-2xl grid gap-6">
		{#if form?.error}
			<div class="flex items-start gap-3 p-4 bg-red-50 border border-red-200 text-sm">
				<AlertCircle class="text-red-600 shrink-0 w-5 h-5" />
				<p class="text-red-800">{form.error}</p>
			</div>
		{/if}

		<form method="POST" class="grid gap-10" novalidate use:enhance={() => {
			isSubmitting = true;
			return async ({ update }) => {
				await update();
				isSubmitting = false;
			};
		}}>
			<input type="hidden" name="csrf_token" value={page.data.csrfToken} />
			<input type="hidden" name="locale" value={$locale} />
			<div style="position: absolute; left: -5000px;" aria-hidden="true">
				<label for="website">Website</label>
				<input type="text" id="website" name="website" tabindex="-1" autocomplete="off" />
			</div>

			<section class="grid gap-4">
				<p class="text-sm font-medium text-foreground-alt">{$t("giftCard.form.amount")}</p>
				<div class="flex flex-wrap gap-3">
					{#each presets as preset}
						<button
							type="button"
							class="px-4 py-2 text-sm border cursor-pointer rounded-none {selectedAmount === String(preset) && selectedAmount !== 'custom'
								? 'bg-foreground text-white border-foreground'
								: 'text-muted-foreground border-border-input'}"
							onclick={() => (selectedAmount = String(preset))}
						>
							{formatEuro(preset)}
						</button>
					{/each}
					<button
						type="button"
						class="px-4 py-2 text-sm border cursor-pointer rounded-none {selectedAmount === 'custom'
							? 'bg-foreground text-white border-foreground'
							: 'text-muted-foreground border-border-input'}"
						onclick={() => (selectedAmount = "custom")}
					>
						{$t("giftCard.form.customAmount")}
					</button>
				</div>
				<input type="hidden" name="amount" value={selectedAmount} />
				{#if selectedAmount === "custom"}
					<div class="grid gap-2 max-w-64">
						<label for="customAmount" class="text-xs font-medium text-foreground-alt">
							{$t("giftCard.form.customAmountLabel")}
						</label>
						<input
							type="text"
							id="customAmount"
							name="customAmount"
							inputmode="decimal"
							placeholder="75,50"
							value={value("customAmount")}
							class={inputClass(!!fieldError("customAmount"))}
						/>
						{#if fieldError("customAmount")}
							<p class="text-red-500 text-xs">{fieldError("customAmount")}</p>
						{/if}
					</div>
				{/if}
			</section>

			<section class="grid grid-cols-1 md:grid-cols-2 gap-6">
				<div class="grid gap-2">
					<label for="buyerName" class="text-xs md:text-sm font-medium text-foreground-alt">
						{$t("giftCard.form.buyerName")} <span class="text-red-500">*</span>
					</label>
					<input type="text" id="buyerName" name="buyerName" required
						value={value("buyerName")} class={inputClass(!!fieldError("buyerName"))} />
					{#if fieldError("buyerName")}<p class="text-red-500 text-xs">{fieldError("buyerName")}</p>{/if}
				</div>
				<div class="grid gap-2">
					<label for="buyerEmail" class="text-xs md:text-sm font-medium text-foreground-alt">
						{$t("giftCard.form.buyerEmail")} <span class="text-red-500">*</span>
					</label>
					<input type="email" id="buyerEmail" name="buyerEmail" required
						value={value("buyerEmail")} class={inputClass(!!fieldError("buyerEmail"))} />
					{#if fieldError("buyerEmail")}<p class="text-red-500 text-xs">{fieldError("buyerEmail")}</p>{/if}
				</div>
			</section>

			<section class="grid grid-cols-1 md:grid-cols-2 gap-6">
				<div class="grid gap-2">
					<label for="recipientName" class="text-xs md:text-sm font-medium text-foreground-alt">
						{$t("giftCard.form.recipientName")} <span class="text-red-500">*</span>
					</label>
					<input type="text" id="recipientName" name="recipientName" required
						value={value("recipientName")} class={inputClass(!!fieldError("recipientName"))} />
					{#if fieldError("recipientName")}<p class="text-red-500 text-xs">{fieldError("recipientName")}</p>{/if}
				</div>
			</section>

			<section class="grid gap-2">
				<label for="message" class="text-xs md:text-sm font-medium text-foreground-alt">
					{$t("giftCard.form.message")}
				</label>
				<textarea id="message" name="message" rows="3" maxlength="500"
					class={inputClass(!!fieldError("message"))}>{value("message")}</textarea>
			</section>

			<section class="grid gap-4">
				<p class="text-sm font-medium text-foreground-alt">{$t("giftCard.form.delivery")}</p>
				<div class="flex flex-wrap gap-3">
					<button
						type="button"
						class="px-4 py-2 text-sm border cursor-pointer rounded-none {delivery === 'buyer'
							? 'bg-foreground text-white border-foreground'
							: 'text-muted-foreground border-border-input'}"
						aria-pressed={delivery === "buyer"}
						onclick={() => (delivery = "buyer")}
					>
						{$t("giftCard.form.deliveryBuyer")}
					</button>
					<button
						type="button"
						class="px-4 py-2 text-sm border cursor-pointer rounded-none {delivery === 'recipient'
							? 'bg-foreground text-white border-foreground'
							: 'text-muted-foreground border-border-input'}"
						aria-pressed={delivery === "recipient"}
						onclick={() => (delivery = "recipient")}
					>
						{$t("giftCard.form.deliveryRecipient")}
					</button>
				</div>
				<input type="hidden" name="delivery" value={delivery} />
				{#if delivery === "recipient"}
					<div class="grid gap-2">
						<label for="recipientEmail" class="text-xs md:text-sm font-medium text-foreground-alt">
							{$t("giftCard.form.recipientEmail")}
							<span class="text-red-500">*</span>
						</label>
						<input type="email" id="recipientEmail" name="recipientEmail" required
							value={value("recipientEmail")} class={inputClass(!!fieldError("recipientEmail"))} />
						{#if fieldError("recipientEmail")}<p class="text-red-500 text-xs">{fieldError("recipientEmail")}</p>{/if}
					</div>
				{/if}
			</section>

			<button
				type="submit"
				disabled={isSubmitting}
				class="flex gap-3 items-center justify-center bg-foreground text-white py-3 px-6 rounded-none hover:bg-foreground-alt transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed w-full md:w-auto"
			>
				<p class="text-sm md:text-base">
					{isSubmitting ? $t("giftCard.form.redirecting") : $t("giftCard.form.submit")}
				</p>
				<ArrowRight class="w-4 h-4" />
			</button>
		</form>
	</div>
</div>
