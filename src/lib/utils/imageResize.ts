/**
 * Client-side image optimization utility
 * Resizes and compresses images before upload to reduce bandwidth and storage costs
 */

export interface ResizeOptions {
	maxWidth: number;
	maxHeight: number;
	quality: number; // 0-1, for JPEG/WebP
	format: 'jpeg' | 'webp' | 'png';
}

export const DEFAULT_RESIZE_OPTIONS: ResizeOptions = {
	maxWidth: 1920,
	maxHeight: 1080,
	quality: 0.85,
	format: 'webp'
};

// Presets for different use cases
export const IMAGE_PRESETS = {
	talentProfile: {
		maxWidth: 800,
		maxHeight: 800,
		quality: 0.85,
		format: 'webp' as const
	},
	eventCover: {
		maxWidth: 1920,
		maxHeight: 1080,
		quality: 0.85,
		format: 'webp' as const
	},
	eventGallery: {
		maxWidth: 1920,
		maxHeight: 1080,
		quality: 0.80,
		format: 'webp' as const
	},
	thumbnail: {
		maxWidth: 400,
		maxHeight: 400,
		quality: 0.80,
		format: 'webp' as const
	}
};

/**
 * Check if a file needs resizing based on current dimensions
 */
export async function getImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
	return new Promise((resolve) => {
		if (!file.type.startsWith('image/')) {
			resolve(null);
			return;
		}

		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(img.src);
			resolve({ width: img.width, height: img.height });
		};
		img.onerror = () => resolve(null);
		img.src = URL.createObjectURL(file);
	});
}

/**
 * Check if WebP format is supported by the browser
 */
let webpSupported: boolean | null = null;

export function supportsWebP(): Promise<boolean> {
	if (webpSupported !== null) {
		return Promise.resolve(webpSupported);
	}

	return new Promise((resolve) => {
		const canvas = document.createElement('canvas');
		canvas.width = 1;
		canvas.height = 1;

		const webpDataUrl = canvas.toDataURL('image/webp');

		// Check if the data URL starts with 'data:image/webp'
		webpSupported = webpDataUrl.startsWith('data:image/webp');
		resolve(webpSupported);
	});
}

/**
 * Get the best supported format for the current browser
 */
export async function getBestFormat(preferredFormat: 'jpeg' | 'webp' | 'png'): Promise<'jpeg' | 'webp' | 'png'> {
	if (preferredFormat === 'webp') {
		const supported = await supportsWebP();
		return supported ? 'webp' : 'jpeg';
	}
	return preferredFormat;
}

/**
 * Resize an image file to the specified dimensions
 * @param file - The image file to resize
 * @param options - Resize options
 * @returns Promise<Blob> - The resized image as a Blob
 */
export async function resizeImage(file: File, options: ResizeOptions = DEFAULT_RESIZE_OPTIONS): Promise<Blob> {
	return new Promise((resolve, reject) => {
		if (!file.type.startsWith('image/')) {
			reject(new Error('File is not an image'));
			return;
		}

		const img = new Image();
		img.onload = () => {
			try {
				const canvas = document.createElement('canvas');
				let { width, height } = img;

				// Calculate new dimensions maintaining aspect ratio
				const aspectRatio = width / height;

				if (width > options.maxWidth) {
					width = options.maxWidth;
					height = width / aspectRatio;
				}

				if (height > options.maxHeight) {
					height = options.maxHeight;
					width = height * aspectRatio;
				}

				// Round to integers
				width = Math.round(width);
				height = Math.round(height);

				canvas.width = width;
				canvas.height = height;

				const ctx = canvas.getContext('2d');
				if (!ctx) {
					reject(new Error('Failed to get canvas context'));
					return;
				}

				// Enable image smoothing for better quality
				ctx.imageSmoothingEnabled = true;
				ctx.imageSmoothingQuality = 'high';

				// Draw image
				ctx.drawImage(img, 0, 0, width, height);

				// Determine MIME type
				const mimeTypes: Record<string, string> = {
					jpeg: 'image/jpeg',
					webp: 'image/webp',
					png: 'image/png'
				};

				const mimeType = mimeTypes[options.format];

				// Convert to blob
				canvas.toBlob(
					(blob) => {
						if (blob) {
							resolve(blob);
						} else {
							reject(new Error('Failed to create blob from canvas'));
						}
					},
					mimeType,
					options.format !== 'png' ? options.quality : undefined
				);
			} catch (err) {
				reject(err);
			} finally {
				URL.revokeObjectURL(img.src);
			}
		};

		img.onerror = () => {
			reject(new Error('Failed to load image'));
			URL.revokeObjectURL(img.src);
		};

		img.src = URL.createObjectURL(file);
	});
}

/**
 * Resize an image file with auto format selection
 * @param file - The image file to resize
 * @param options - Resize options (format may be overridden if not supported)
 * @returns Promise<Blob> - The resized image as a Blob
 */
export async function resizeImageAutoFormat(
	file: File,
	options: ResizeOptions = DEFAULT_RESIZE_OPTIONS
): Promise<Blob> {
	const bestFormat = await getBestFormat(options.format);

	return resizeImage(file, {
		...options,
		format: bestFormat
	});
}

/**
 * Get the output file size estimate for an image resize
 * This is a rough estimate based on the quality and dimensions
 */
export function estimateOutputSize(
	originalSize: number,
	originalWidth: number,
	originalHeight: number,
	targetWidth: number,
	targetHeight: number,
	quality: number
): number {
	const scaleFactor = (targetWidth * targetHeight) / (originalWidth * originalHeight);
	return Math.round(originalSize * scaleFactor * quality);
}

/**
 * Create a File object from a Blob with the appropriate extension
 */
export function blobToFile(blob: Blob, originalFileName: string, format: 'jpeg' | 'webp' | 'png'): File {
	const extensions: Record<string, string> = {
		jpeg: '.jpg',
		webp: '.webp',
		png: '.png'
	};

	const extension = extensions[format];
	const baseName = originalFileName.replace(/\.[^/.]+$/, '');
	const fileName = `${baseName}${extension}`;

	const mimeTypes: Record<string, string> = {
		jpeg: 'image/jpeg',
		webp: 'image/webp',
		png: 'image/png'
	};

	return new File([blob], fileName, { type: mimeTypes[format] });
}
