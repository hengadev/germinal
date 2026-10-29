<script lang="ts">
	import 'barcode-detector/polyfill';
	import { onMount } from 'svelte';
	import { parseTicketToken } from '$lib/staff/ticket-qr';

	let { onScan }: { onScan: (token: string) => void } = $props();

	let videoEl = $state<HTMLVideoElement | null>(null);
	let error = $state<'permission' | 'no-camera' | 'insecure' | 'unknown' | null>(null);
	let unrecognized = $state('');

	let stream: MediaStream | null = null;
	let timer: ReturnType<typeof setInterval> | null = null;
	let lastToken = '';
	let lastTokenAt = 0;

	const DEBOUNCE_MS = 2000;

	function stopCamera() {
		if (timer !== null) {
			clearInterval(timer);
			timer = null;
		}
		for (const track of stream?.getTracks() ?? []) track.stop();
		stream = null;
	}

	onMount(() => {
		const Detector = (globalThis as typeof globalThis & { BarcodeDetector?: unknown }).BarcodeDetector;
		const video = videoEl;

		if (!navigator.mediaDevices?.getUserMedia) {
			error = location.protocol === 'https:' || location.hostname === 'localhost' ? 'no-camera' : 'insecure';
			return;
		}
		if (!Detector || !video) {
			error = 'unknown';
			return;
		}

		const detector = new (Detector as new (opts?: { formats: string[] }) => {
			detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
		})({ formats: ['qr_code'] });

		navigator.mediaDevices
			.getUserMedia({ video: { facingMode: 'environment' } })
			.then((mediaStream) => {
				stream = mediaStream;
				video.srcObject = mediaStream;
				void video.play();

				timer = setInterval(async () => {
					if (document.hidden || video.readyState < 2) return;
					try {
						const codes = await detector.detect(video);
						for (const code of codes) {
							const token = parseTicketToken(code.rawValue);
							if (token === null) {
								unrecognized = 'QR non reconnu';
								continue;
							}
							const now = Date.now();
							if (token === lastToken && now - lastTokenAt < DEBOUNCE_MS) continue;
							lastToken = token;
							lastTokenAt = now;
							unrecognized = '';
							onScan(token);
						}
					} catch {
						// Transient decode errors are ignored; the loop keeps running.
					}
				}, 400);
			})
			.catch((e: unknown) => {
				if (e instanceof DOMException) {
					if (e.name === 'NotAllowedError') error = 'permission';
					else if (e.name === 'NotFoundError') error = 'no-camera';
					else error = 'unknown';
				} else {
					error = 'unknown';
				}
			});

		const onVisibility = () => {
			if (document.hidden) stopCamera();
		};
		document.addEventListener('visibilitychange', onVisibility);

		return () => {
			document.removeEventListener('visibilitychange', onVisibility);
			stopCamera();
		};
	});
</script>

{#if error === 'permission'}
	<div class="rounded-lg bg-red-50 p-4 text-sm text-red-700">
		<p class="font-medium">Accès à la caméra refusé.</p>
		<p class="mt-1">
			Autorisez la caméra pour ce site&nbsp;: sur iPhone, Réglages &gt; Safari (ou Réglages &gt; Germinal
			Staff si l'app est installée) &gt; Caméra&nbsp;; sur Android, dans Chrome, menu ⋮ &gt; Informations sur
			le site &gt; Autorisations &gt; Caméra. Rechargez ensuite la page.
		</p>
	</div>
{:else if error === 'no-camera'}
	<div class="rounded-lg bg-red-50 p-4 text-sm text-red-700">
		<p class="font-medium">Aucune caméra détectée sur cet appareil.</p>
	</div>
{:else if error === 'insecure'}
	<div class="rounded-lg bg-red-50 p-4 text-sm text-red-700">
		<p class="font-medium">La caméra nécessite une connexion sécurisée (HTTPS).</p>
	</div>
{:else if error === 'unknown'}
	<div class="rounded-lg bg-red-50 p-4 text-sm text-red-700">
		<p class="font-medium">Impossible de démarrer le scanner sur cet appareil.</p>
	</div>
{:else}
	<video
		bind:this={videoEl}
		playsinline
		muted
		autoplay
		class="h-auto w-full rounded-lg bg-black"
	></video>
	{#if unrecognized}
		<p class="mt-2 text-center text-sm text-amber-600">{unrecognized}</p>
	{/if}
{/if}
