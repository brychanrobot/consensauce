export async function uploadImageToConvex(
  file: File | Blob,
  generateUploadUrl: () => Promise<string>,
): Promise<string> {
  const postUrl = await generateUploadUrl();
  const response = await fetch(postUrl, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'image/jpeg',
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`Upload failed with status: ${response.status}`);
  }

  const data = (await response.json()) as { storageId: string };
  return data.storageId;
}

const STORAGE_KEY = 'consensauce_device_sessions';
const MAX_SAVED = 10;

export function getDeviceRecentSessionIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_SAVED) : [];
  } catch {
    return [];
  }
}

export function saveDeviceSessionId(sessionId: string): void {
  if (typeof window === 'undefined' || !sessionId) return;
  try {
    const current = getDeviceRecentSessionIds().filter((id) => id !== sessionId);
    current.unshift(sessionId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current.slice(0, MAX_SAVED)));
  } catch {
    // Ignore storage quota or access errors in restricted modes
  }
}

export function getOrCreateClientUserId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('consensauce_client_id') || localStorage.getItem('tears_client_id');
  if (!id) {
    id = `user_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem('consensauce_client_id', id);
  }
  return id;
}

export function getStoredUserName(): string {
  if (typeof window === 'undefined') return '';
  return (
    localStorage.getItem('consensauce_user_name') ||
    localStorage.getItem('tears_user_name') ||
    ''
  ).trim();
}

export function setStoredUserName(name: string): void {
  if (typeof window === 'undefined' || !name.trim()) return;
  localStorage.setItem('consensauce_user_name', name.trim());
}
