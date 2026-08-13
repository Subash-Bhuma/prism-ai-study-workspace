import { getAccessToken } from './firebase';

const API_ROOT = import.meta.env.VITE_API_URL || '/api';

async function request(path, options = {}) {
  const token = options.auth === false ? null : await getAccessToken();
  const requestOptions = { ...options };
  delete requestOptions.auth;
  const response = await fetch(`${API_ROOT}${path}`, {
    ...requestOptions,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) window.dispatchEvent(new Event('prism:unauthorized'));
  if (!response.ok) throw new Error(data.detail || data.error || 'Request failed');
  return data;
}

export const api = {
  loginDemo: () => request('/auth/demo', { method: 'POST', auth: false, body: JSON.stringify({}) }),
  dashboard: () => request('/dashboard'),
  subject: (id) => request(`/subjects/${id}`),
  ask: (id, payload) => request(`/subjects/${id}/ask`, { method: 'POST', body: JSON.stringify(payload) }),
  studio: (id, kind, resourceIds) => request(`/subjects/${id}/studio/${kind}`, { method: 'POST', body: JSON.stringify({ question: `Create a ${kind}`, resource_ids: resourceIds }) }),
  map: (id) => request(`/subjects/${id}/map`),
  createSubject: (payload) => request('/subjects', { method: 'POST', body: JSON.stringify(payload) }),
  upload: (id, file) => {
    const body = new FormData();
    body.append('file', file);
    return request(`/subjects/${id}/resources`, { method: 'POST', body });
  },
  diagnostic: (id) => request(`/subjects/${id}/diagnostic`),
  answerDiagnostic: (id, payload) => request(`/subjects/${id}/diagnostic`, { method: 'POST', body: JSON.stringify(payload) }),
  practice: (id) => request(`/subjects/${id}/practice`),
  submitStep: (id, problemId, payload) => request(`/subjects/${id}/practice/${problemId}/steps`, { method: 'POST', body: JSON.stringify(payload) }),
  hint: (id, problemId) => request(`/subjects/${id}/practice/${problemId}/hint`, { method: 'POST' }),
  nextProblem: (id) => request(`/subjects/${id}/practice/next`, { method: 'POST' }),
  report: (id) => request(`/subjects/${id}/report`),
  planner: (id, payload) => request(`/subjects/${id}/planner`, { method: 'POST', body: JSON.stringify(payload) }),
};
