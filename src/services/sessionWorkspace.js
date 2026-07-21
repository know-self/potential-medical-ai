export const emptySessionWorkspace = Object.freeze({ profile: null, uploads: [], shares: [] });

export async function loadSessionWorkspace(api, token, { verifiedProfile = null } = {}) {
  if (!token) return emptySessionWorkspace;

  // Authentication is intentionally verified before parallel private reads.
  // A stale or partially entered token therefore produces one 401, not a
  // profile/uploads/shares fan-out.
  const profile = verifiedProfile || await api.getProfile(token);
  const [uploadPayload, sharePayload] = await Promise.all([
    api.listUploads(token),
    api.listShares(token)
  ]);

  return {
    profile,
    uploads: uploadPayload?.uploads || [],
    shares: sharePayload?.shares || []
  };
}
