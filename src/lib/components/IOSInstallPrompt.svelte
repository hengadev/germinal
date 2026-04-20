<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { t } from 'svelte-i18n';

	// Admin domain configuration (must match server config)
	const ADMIN_DOMAINS = [
		'admin.germinalstudio.co',
		'admin-staging.germinalstudio.co'
	];

	// Staff domain configuration (must match server config)
	const STAFF_DOMAINS = [
		'staff.germinalstudio.co',
		'staff-staging.germinalstudio.co'
	];

	const DISMISSED_KEY = 'ios-install-dismissed';
	const DISMISSED_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

	let visible = $state(false);

	function isIOS(): boolean {
		if (!browser) return false;
		const ua = navigator.userAgent;
		return /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
	}

	function isInStandaloneMode(): boolean {
		if (!browser) return false;
		return (window.matchMedia('(display-mode: standalone)').matches ||
			(window as any).navigator.standalone === true);
	}

	function isAdminDomain(hostname: string): boolean {
		if (hostname.startsWith('localhost') || hostname.startsWith('127.0.0.1')) {
			return true;
		}
		return ADMIN_DOMAINS.includes(hostname);
	}

	function isStaffDomain(hostname: string): boolean {
		if (hostname.startsWith('localhost') || hostname.startsWith('127.0.0.1')) {
			return true;
		}
		return STAFF_DOMAINS.includes(hostname);
	}

	function getAppName(): string {
		if (!browser) return 'Germinal';
		const hostname = window.location.hostname;

		if (isAdminDomain(hostname)) return 'Germinal Admin';
		if (isStaffDomain(hostname)) return 'Germinal Staff';
		return 'Germinal';
	}

	onMount(() => {
		// Only show on iOS Safari, not in standalone mode
		if (!isIOS() || isInStandaloneMode()) return;

		// Don't show if recently dismissed
		const dismissed = localStorage.getItem(DISMISSED_KEY);
		if (dismissed && Date.now() - parseInt(dismissed) < DISMISSED_DURATION_MS) return;

		// Show after a short delay
		const timer = setTimeout(() => {
			visible = true;
		}, 3000);

		return () => clearTimeout(timer);
	});

	function dismiss() {
		visible = false;
		if (browser) {
			localStorage.setItem(DISMISSED_KEY, Date.now().toString());
		}
	}
</script>

<div class="ios-install-banner" style="transition: opacity 300ms; opacity: {visible ? 1 : 0}; pointer-events: {visible ? 'auto' : 'none'};" aria-hidden={!visible}>
	<div class="banner-content">
			<div class="icon-header">
				<div class="app-icon">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
						<rect width="24" height="24" rx="5" fill="currentColor"/>
						<path d="M15 6H12C10.3431 6 9 7.34315 9 9V11H7V14H9V19H12V14H15L15.5 11H12V9C12 8.44772 12.4477 8 13 8H15V6Z" fill="white"/>
					</svg>
				</div>
				<div class="banner-text">
					<p class="banner-title">{t('pwa.iosTitle', { values: { appName: getAppName() } })}</p>
					<p class="banner-subtitle">{$t('pwa.iosSubtitle')}</p>
				</div>
				<button onclick={dismiss} class="close-btn" aria-label="Close">
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M18 6 6 18"/><path d="m6 6 12 12"/>
					</svg>
				</button>
			</div>

			<div class="instructions">
				<div class="step">
					<div class="step-icon">
						<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
							<rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" stroke-width="1.5"/>
							<path d="M12 11V15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
							<path d="M12 8V8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
						</svg>
					</div>
					<span class="step-text">{@html $t('pwa.iosStep1')}</span>
					<div class="step-visual">
						<svg width="44" height="28" viewBox="0 0 44 28" fill="none" xmlns="http://www.w3.org/2000/svg">
							<rect x="0.5" y="0.5" width="43" height="27" rx="5.5" stroke="currentColor" stroke-width="1"/>
							<path d="M22 9V19M22 9L18 13M22 9L26 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</div>
				</div>

				<div class="step">
					<div class="step-icon">
						<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
							<rect x="5" y="5" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/>
							<path d="M12 8V16M8 12H16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
						</svg>
					</div>
					<span class="step-text">{@html $t('pwa.iosStep2')}</span>
					<div class="step-visual">
						<svg width="44" height="28" viewBox="0 0 44 28" fill="none" xmlns="http://www.w3.org/2000/svg">
							<rect x="0.5" y="0.5" width="43" height="27" rx="5.5" stroke="currentColor" stroke-width="1"/>
							<rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/>
							<path d="M23 14H35M23 14L27 10M23 14L27 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.ios-install-banner {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 100;
		padding: 1rem;
		padding-bottom: calc(1rem + env(safe-area-inset-bottom));
	}

	.banner-content {
		background: white;
		border-radius: 20px;
		box-shadow:
			0 10px 40px rgba(0, 0, 0, 0.12),
			0 2px 8px rgba(0, 0, 0, 0.06);
		padding: 1.25rem 1.5rem 1.5rem;
		max-width: 420px;
		margin: 0 auto;
		border: 1px solid rgba(0, 0, 0, 0.06);
	}

	.icon-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1.25rem;
		position: relative;
	}

	.app-icon {
		width: 40px;
		height: 40px;
		border-radius: 10px;
		background: #1a1a1a;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		color: white;
	}

	.banner-text {
		flex: 1;
		min-width: 0;
	}

	.banner-title {
		font-family: 'Inter', -apple-system, sans-serif;
		font-size: 15px;
		font-weight: 600;
		color: #1a1a1a;
		margin: 0;
		line-height: 1.3;
		letter-spacing: -0.01em;
	}

	.banner-subtitle {
		font-family: 'Inter', -apple-system, sans-serif;
		font-size: 13px;
		color: #6b7280;
		margin: 0.25rem 0 0;
		line-height: 1.4;
	}

	.close-btn {
		position: absolute;
		top: -4px;
		right: -4px;
		width: 28px;
		height: 28px;
		border: none;
		background: transparent;
		color: #9ca3af;
		cursor: pointer;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
	}

	.close-btn:hover {
		background: rgba(0, 0, 0, 0.05);
		color: #6b7280;
	}

	.close-btn:active {
		transform: scale(0.95);
	}

	.instructions {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.step {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.step-icon {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		color: #1a1a1a;
		opacity: 0.7;
	}

	.step-text {
		font-family: 'Inter', -apple-system, sans-serif;
		font-size: 14px;
		color: #374151;
		flex: 1;
		line-height: 1.4;
	}

	.step-text strong {
		font-weight: 600;
		color: #1a1a1a;
	}

	.step-visual {
		flex-shrink: 0;
		color: #9ca3af;
	}

	/* Dark mode */
	:global(.dark) .banner-content {
		background: #1a1a1a;
		border-color: rgba(255, 255, 255, 0.08);
		box-shadow:
			0 10px 40px rgba(0, 0, 0, 0.4),
			0 2px 8px rgba(0, 0, 0, 0.2);
	}

	:global(.dark) .banner-title {
		color: #f9fafb;
	}

	:global(.dark) .banner-subtitle {
		color: #9ca3af;
	}

	:global(.dark) .close-btn {
		color: #6b7280;
	}

	:global(.dark) .close-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		color: #9ca3af;
	}

	:global(.dark) .step-icon,
	:global(.dark) .step-visual {
		color: #d1d5db;
	}

	:global(.dark) .step-text {
		color: #e5e7eb;
	}

	:global(.dark) .step-text strong {
		color: #f9fafb;
	}
</style>
