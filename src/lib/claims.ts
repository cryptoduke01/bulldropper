let memoryStore: Map<string, string> | null = null;

function getLocalStore() {
  if (!memoryStore) memoryStore = new Map();
  return memoryStore;
}

async function getBlobsStore() {
  if (typeof window !== 'undefined') return null; // client
  try {
    const { getStore } = await import('@netlify/blobs');
    return getStore('bulldropper-claims');
  } catch {
    return null;
  }
}

export async function getClaimedWallet(handle: string): Promise<string | null> {
  const key = handle.toLowerCase().replace(/^@/, '');
  const store = await getBlobsStore();
  if (store) {
    try {
      const val = await store.get(key);
      return typeof val === 'string' ? val : null;
    } catch (e) {
      console.warn('Netlify Blobs get failed, using in-memory');
    }
  }
  return getLocalStore().get(key) ?? null;
}

export async function setClaimedWallet(handle: string, address: string): Promise<void> {
  const key = handle.toLowerCase().replace(/^@/, '');
  const store = await getBlobsStore();
  if (store) {
    try {
      await store.set(key, address);
      return;
    } catch (e) {
      console.warn('Netlify Blobs set failed, using in-memory');
    }
  }
  getLocalStore().set(key, address);
}
