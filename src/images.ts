/** Leaves room under Firestore's 1 MiB document limit for the other fields. */
const MAX_DATA_URL = 900_000;

/** Shrinks a photo or screenshot into a JPEG data URL small enough to store. */
export async function compressImage(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  let longest = 1600;
  let quality = 0.82;
  try {
    for (;;) {
      const scale = Math.min(1, longest / Math.max(bitmap.width, bitmap.height));
      const width = Math.round(bitmap.width * scale);
      const height = Math.round(bitmap.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length <= MAX_DATA_URL || longest <= 400) return { dataUrl, width, height };
      if (quality > 0.6) quality -= 0.1;
      else longest = Math.round(longest * 0.8);
    }
  } finally {
    bitmap.close();
  }
}
