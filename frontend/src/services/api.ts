import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (data: any) => api.post('/auth/register', data),
  getProfile: () => api.get('/users/profile'),
};

export const postAPI = {
  createPost: (data: any) => api.post('/posts', data),
  getTimeline: (page: number, limit: number) =>
    api.get(`/posts/timeline?page=${page}&limit=${limit}`),
  getPost: (id: string) => api.get(`/posts/${id}`),
  deletePost: (id: string) => api.delete(`/posts/${id}`),
};

export const scheduleAPI = {
  createSchedule: (data: any) => api.post('/schedules', data),
  getSchedules: (startDate?: string, endDate?: string) =>
    api.get('/schedules', { params: { startDate, endDate } }),
  cancelSchedule: (id: string) => api.patch(`/schedules/${id}/cancel`),
  retrySchedule: (id: string) => api.post(`/schedules/${id}/retry`),
  getStats: () => api.get('/schedules/stats'),
};

export const mediaAPI = {
  upload: (formData: FormData) =>
    api.post('/media/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  delete: (publicId: string) => api.delete(`/media/${publicId}`),
};

export default api;