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
  getLatestVersion: () => request('GET', '/admin/latest-version'),

  screens: {
    list: () => request('GET', '/screens'),
    get: (id) => request('GET', `/screens/${id}`),
    create: (name) => request('POST', '/screens', { name }),
    update: (id, data) => request('PUT', `/screens/${id}`, data),
    delete: (id) => request('DELETE', `/screens/${id}`),
    regenerateKey: (id) => request('POST', `/screens/${id}/regenerate-key`),
    reboot: (id) => request('POST', `/screens/${id}/reboot`),
    sendUpdate: (id) => request('POST', `/screens/${id}/update`),
    getOverrides: (id) => request('GET', `/screens/${id}/overrides`),
    setOverride: (id, data) => request('POST', `/screens/${id}/override`, data),
    deleteOverride: (id, oid) => request('DELETE', `/screens/${id}/override/${oid}`),
    getSchedules: (id) => request('GET', `/screens/${id}/schedules`),
    addSchedule: (id, data) => request('POST', `/screens/${id}/schedule`, data),
    deleteSchedule: (id, sid) => request('DELETE', `/screens/${id}/schedule/${sid}`),
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
    uploadFile: (file, name, onProgress, durationSeconds) => {
      const form = new FormData();
      form.append('file', file);
      if (name) form.append('name', name);
      if (durationSeconds) form.append('duration_seconds', String(durationSeconds));

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${BASE}/content/upload`);
        const token = getToken();
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable && onProgress) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/login';
            return;
          }
          let data;
          try { data = JSON.parse(xhr.responseText); } catch { data = {}; }
          if (xhr.status >= 200 && xhr.status < 300) resolve(data);
          else reject(new Error(data.error || 'Upload failed'));
        });

        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.send(form);
      });
    },
    addUrl: (name, url) => request('POST', '/content/url', { name, url }),
    delete: (id) => request('DELETE', `/content/${id}`),
  },
};
