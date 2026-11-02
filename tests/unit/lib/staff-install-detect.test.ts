import { describe, expect, it } from 'vitest';
import { detectInstallPlatform } from '$lib/components/staff/install/detect';

const ANDROID_CHROME =
	'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const IPHONE_SAFARI =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_SAFARI =
	'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const WINDOWS_FIREFOX =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0';

describe('detectInstallPlatform', () => {
	it('never offers anything in standalone mode', () => {
		expect(detectInstallPlatform(ANDROID_CHROME, true, false)).toBe('standalone');
		expect(detectInstallPlatform(IPHONE_SAFARI, true, false)).toBe('standalone');
	});

	it('detects Android/Chromium when the browser emitted its prompt', () => {
		expect(detectInstallPlatform(ANDROID_CHROME, false, true)).toBe('android');
	});

	it('falls back to android on Chromium even before the prompt event', () => {
		expect(detectInstallPlatform(ANDROID_CHROME, false, false)).toBe('android');
	});

	it('detects iOS Safari, which has no prompt event', () => {
		expect(detectInstallPlatform(IPHONE_SAFARI, false, false)).toBe('ios');
		expect(detectInstallPlatform(IPAD_SAFARI, false, false)).toBe('ios');
	});

	it('returns other for desktop browsers without the prompt', () => {
		expect(detectInstallPlatform(WINDOWS_FIREFOX, false, false)).toBe('other');
	});
});
