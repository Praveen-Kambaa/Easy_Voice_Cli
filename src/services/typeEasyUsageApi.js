import { buildTypeEasyUrl } from '../config/api';

async function parseJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function authHeaders(token) {
  const t = (token || '').trim();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function getUserUsage({ userId, token }) {
  const id = String(userId || '').trim();
  if (!id) return { success: false, error: 'Missing userId' };
  try {
    const res = await fetch(buildTypeEasyUrl(`/usage/${encodeURIComponent(id)}`), {
      method: 'GET',
      headers: { ...authHeaders(token) },
    });
    const data = await parseJsonSafe(res);
    if (!res.ok) {
      return { success: false, error: data?.message || `Request failed (${res.status})` };
    }
    return { success: true, data };
  } catch (e) {
    return { success: false, error: e?.message || 'Network error' };
  }
}

export async function getUserPlan({ userId, token }) {
  const id = String(userId || '').trim();
  if (!id) return { success: false, error: 'Missing userId' };
  try {
    const res = await fetch(buildTypeEasyUrl(`/user-plan/${encodeURIComponent(id)}`), {
      method: 'GET',
      headers: { ...authHeaders(token) },
    });
    const data = await parseJsonSafe(res);
    if (!res.ok) {
      return { success: false, error: data?.message || `Request failed (${res.status})` };
    }
    return { success: true, data };
  } catch (e) {
    return { success: false, error: e?.message || 'Network error' };
  }
}

export async function updateTokensOnly({ userId, tokensUsed, token }) {
  const id = String(userId || '').trim();
  const amt = Number(tokensUsed);
  if (!id) return { success: false, error: 'Missing userId' };
  if (!Number.isFinite(amt) || amt <= 0) return { success: false, error: 'Enter a valid token amount' };
  try {
    const res = await fetch(buildTypeEasyUrl('/update-tokens'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(token),
      },
      body: JSON.stringify({ user_id: id, tokens_used: amt }),
    });
    const data = await parseJsonSafe(res);
    if (!res.ok) {
      return { success: false, error: data?.message || `Request failed (${res.status})` };
    }
    return { success: true, data };
  } catch (e) {
    return { success: false, error: e?.message || 'Network error' };
  }
}

