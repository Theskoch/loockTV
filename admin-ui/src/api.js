const BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

async function request(method, path, body, isForm = false) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body && !isForm) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
    return;
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  login: (u, p) => request('POST', '/admin/login', { username: u, password: p }),
  me: () => request('GET', '/admin/me'),

  screens: {
    list: () => request('GET', '/screens'),
    get: (id) => request('GET', `/screens/${id}`),
    create: (name) => request('POST', '/screens', { name }),
    update: (id, data) => request('PUT', `/screens/${id}`, data),
    delete: (id) => request('DELETE', `/screens/${id}`),
    regenerateKey: (id) => request('POST', `/screens/${id}/regenerate-key`),
    reboot: (id) => request('POST', `/screens/${id}/reboot`),
    getOverrides: (id) => request('GET', `/screens/${id}/overrides`),
    setOverride: (id, data) => request('POST', `/screens/${id}/override`, data),
    deleteOverride: (id, oid) => request('DELETE', `/screens/${id}/override/${oid}`),
  },

  playlists: {
    list: () => request('GET', '/playlists'),
    get: (id) => request('GET', `/playlists/${id}`),
    create: (data) => request('POST', '/playlists', data),
    update: (id, data) => request('PUT', `/playlists/${id}`, data),
    delete: (id) => request('DELETE', `/playlists/${id}`),
  },

  content: {
    list: () => request('GET', '/content'),
    uploadFile: (file, name) => {
      const form = new FormData();
      form.append('file', file);
      if (name) form.append('name', name);
      return request('POST', '/content/upload', form, true);
    },
    addUrl: (name, url) => request('POST', '/content/url', { name, url }),
    delete: (id) => request('DELETE', `/content/${id}`),
  },
};
