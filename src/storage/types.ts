export const SUPPORTED_STORES = [
	"s3",
	"tigris",
	"gcp",
	"azure",
	"disk",
] as const;
export type StoreType = (typeof SUPPORTED_STORES)[number];

export const isStoreType = (value: string): value is StoreType =>
	(SUPPORTED_STORES as readonly string[]).includes(value);

/** Returned by every adapter after a successful upload */
export type PutOutput = {
	readonly uri: string;
	readonly hash: readonly [algorithm: string, digest: string];
};

/** Describes a single configuration field for a storage adapter */
export type ConfigField = {
	readonly key: string;
	readonly required: boolean;
	/** If true, mask this field's value in API responses */
	readonly secret: boolean;
	readonly valueType: "string" | "json";
	readonly default?: string;
};

/** Max upload size in bytes (50 MB) */
export const UPLOAD_SIZE_LIMIT_BYTES = 50 * 1024 * 1024;

/** Mimetypes accepted for resource uploads */
export const ALLOWED_MIMETYPES = new Set([
	// Images
	// NOTE: image/svg+xml is deliberately NOT allowed — SVG can embed active
	// content and is served inline from resource endpoints.
	"image/jpeg",
	"image/png",
	"image/gif",
	"image/webp",
	// Documents
	"application/pdf",
	"text/plain",
	"text/csv",
	// Audio/video (clinical recordings)
	"audio/mpeg",
	"audio/ogg",
	"video/mp4",
	// Generic binary (e.g. DICOM, HL7 exports)
	"application/octet-stream",
]);

/**
 * Sniff an image's true mimetype from magic bytes. Returns null for unknown
 * content. Used to reject uploads whose declared type does not match their
 * actual content.
 */
export const sniffImageMimetype = (bytes: Uint8Array): string | null => {
	if (bytes.length < 12) return null;
	// PNG: 89 50 4E 47 0D 0A 1A 0A
	if (
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47
	) {
		return "image/png";
	}
	// JPEG: FF D8 FF
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return "image/jpeg";
	}
	// GIF: GIF87a / GIF89a
	if (
		bytes[0] === 0x47 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x38
	) {
		return "image/gif";
	}
	// WEBP: RIFF....WEBP
	if (
		bytes[0] === 0x52 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x46 &&
		bytes[8] === 0x57 &&
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50
	) {
		return "image/webp";
	}
	return null;
};

export const isAllowedMimetype = (mimetype: string): boolean =>
	ALLOWED_MIMETYPES.has(mimetype);

/** Default path prefix for form resource uploads */
export const RESOURCE_PATH_PREFIX = "hh_forms_resources";

/** Default path prefix for education content resource uploads */
export const EDUCATION_RESOURCE_PATH_PREFIX = "hh_education_resources";
