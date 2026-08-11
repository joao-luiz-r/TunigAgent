const BASE = '/api';

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Erro na requisição');
  }
  return data;
}

export const api = {
  listSkills: () => request('/skills'),
  startSession: (skillName) =>
    request('/session/start', { method: 'POST', body: JSON.stringify({ skillName }) }),
  act: (sessionId, message) =>
    request('/agent/act', { method: 'POST', body: JSON.stringify({ sessionId, message }) }),
  feedback: (sessionId, userResult) =>
    request('/agent/feedback', { method: 'POST', body: JSON.stringify({ sessionId, userResult }) }),
  getState: (sessionId) => request(`/agent/state/${sessionId}`),
};
