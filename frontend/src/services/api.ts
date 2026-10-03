import { SITE_CONFIG } from '../config/site';

// Platform env contract: prefer VITE_API_URL. Default is relative "" so that same-origin
// requests to /api/* work with the preview URL's ingress routing (/api/* -> backend:8001).
// Vite can only expose VITE_* prefixed env vars to the browser, so VITE_API_URL must be
// used client-side; the backend URL contract is still honored through the empty default.
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export interface EnquiryPayload {
  name: string;
  phone: string;
  email?: string;
  courseInterested?: string;
  preferredBatch?: string;
  message?: string;
}

export interface VerificationResult {
  valid: boolean;
  certificateNumber?: string;
  studentName?: string;
  courseName?: string;
  issueDate?: string;
  completionStatus?: string;
  grade?: string;
  verificationCode?: string;
  errorMessage?: string;
}

export const apiService = {
  // Helper for REST requests
  request: async (endpoint: string, method: string = 'GET', body?: any) => {
    try {
      const url = API_BASE_URL ? `${API_BASE_URL}${endpoint}` : endpoint;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      
      const token = localStorage.getItem('ssci_jwt_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      return await res.json();
    } catch (err) {
      console.warn(`API request to ${endpoint} failed:`, err);
      return null;
    }
  },

  // Real Backend Admin Login
  login: async (email: string, password: string): Promise<{ success: boolean; token?: string; user?: any; message?: string }> => {
    const res = await apiService.request('/api/auth/login', 'POST', { email, password });
    if (res?.success && res?.token) {
      localStorage.setItem('ssci_jwt_token', res.token);
      if (res.user) {
        localStorage.setItem('ssci_user', JSON.stringify(res.user));
      }
    }
    return res || { success: false, message: 'Backend login failed. Server unreachable.' };
  },

  // Admin Logout
  logout: async () => {
    await apiService.request('/api/auth/logout', 'POST');
    localStorage.removeItem('ssci_jwt_token');
    localStorage.removeItem('ssci_user');
  },

  me: async () => apiService.request('/api/auth/me'),

  // Submit Enquiry (Genuine Backend Call — No Fake Success)
  submitEnquiry: async (payload: EnquiryPayload & { preferredTiming?: string }): Promise<{ success: boolean; message: string }> => {
    const data = await apiService.request('/api/leads', 'POST', {
      ...payload,
      preferredBatch: payload.preferredBatch || payload.preferredTiming || 'Any Batch',
      source: 'Website',
    });
    if (data?.success) {
      return { success: true, message: data.message || 'Enquiry submitted successfully.' };
    }
    return {
      success: false,
      message: data?.message || `We could not submit your enquiry right now. Please try again or call us directly at ${SITE_CONFIG.contact.phonePrimary}.`,
    };
  },

  // Verify Certificate (Genuine Backend Call — No Local Fallback)
  verifyCertificate: async (certNumber: string): Promise<VerificationResult> => {
    const data = await apiService.request(`/api/certificates/verify/${encodeURIComponent(certNumber)}`);
    if (data) return data;
    return {
      valid: false,
      errorMessage: 'Verification service is temporarily unavailable. Please check your network connection or contact administration.',
    };
  },

  // GET Public Content Endpoints (C4)
  getCourses: async () => {
    return await apiService.request('/api/courses');
  },
  getCourseBySlug: async (slug: string) => {
    return await apiService.request(`/api/courses/${slug}`);
  },
  getBatches: async () => {
    return await apiService.request('/api/batches');
  },
  getBlogPosts: async () => {
    return await apiService.request('/api/blog');
  },
  getBlogPostBySlug: async (slug: string) => {
    return await apiService.request(`/api/blog/${slug}`);
  },
  getTrainers: async () => {
    return await apiService.request('/api/trainers');
  },
  getFloatingSkills: async () => {
    return await apiService.request('/api/floating-skills');
  },
  getHeroContent: async () => {
    return await apiService.request('/api/website/hero');
  },
  getSettings: async () => {
    return await apiService.request('/api/website/settings');
  },
  getAnnouncement: async () => {
    return await apiService.request('/api/announcement');
  },
  getLeads: async () => {
    return await apiService.request('/api/leads');
  },
  updateLeadStatus: async (id: string, status: string, noteText?: string) => {
    return await apiService.request(`/api/leads/${id}/status`, 'PUT', { status, noteText });
  },
  convertLeadToStudent: async (id: string) => {
    return await apiService.request(`/api/leads/${id}/convert`, 'POST');
  },
  getCertificates: async () => {
    return await apiService.request('/api/certificates');
  },
  getStudents: async () => {
    return await apiService.request('/api/students');
  },
  getAuditLogs: async () => {
    return await apiService.request('/api/audit-logs');
  },

  // Dashboard analytics (Phase 2)
  getDashboardAnalytics: async () => {
    return await apiService.request('/api/dashboard/analytics');
  },

  // Online Classes (Phase 2)
  getOnlineClasses: async (query?: { status?: string; courseSlug?: string; search?: string }) => {
    const qs = query
      ? '?' + Object.entries(query).filter(([, v]) => v).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')
      : '';
    return await apiService.request(`/api/online-classes${qs}`);
  },
  getOnlineClassBySlug: async (slug: string) => {
    return await apiService.request(`/api/online-classes/${encodeURIComponent(slug)}`);
  },
  saveOnlineClass: async (payload: any) => {
    return await apiService.request('/api/online-classes', 'POST', payload);
  },
  updateOnlineClass: async (slug: string, payload: any) => {
    return await apiService.request(`/api/online-classes/${encodeURIComponent(slug)}`, 'PUT', payload);
  },
  deleteOnlineClass: async (slug: string) => {
    return await apiService.request(`/api/online-classes/${encodeURIComponent(slug)}`, 'DELETE');
  },

  // Filtered exports (Phase 2). Uses fetch directly because responses are binary blobs.
  downloadExport: async (
    dataset: 'enquiries' | 'students' | 'batches',
    format: 'csv' | 'xlsx' | 'pdf',
    filters: Record<string, string | undefined> = {}
  ): Promise<{ success: boolean; message?: string }> => {
    const token = localStorage.getItem('ssci_jwt_token');
    const params = new URLSearchParams({ format });
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    }
    const url = `${API_BASE_URL}/api/exports/${dataset}?${params.toString()}`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        let msg = `Export failed with status ${res.status}.`;
        try { const data = await res.json(); msg = data?.message || msg; } catch (_) { /* non-json */ }
        return { success: false, message: msg };
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = /filename="?([^";]+)"?/i.exec(disposition);
      const filename = match ? match[1] : `ssci-${dataset}.${format}`;
      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(downloadUrl);
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Network error during export.' };
    }
  },

  // Courses API
  saveCourse: async (courseData: any) => {
    return await apiService.request('/api/courses', 'POST', courseData);
  },
  deleteCourse: async (slug: string) => {
    return await apiService.request(`/api/courses/${slug}`, 'DELETE');
  },

  // Batches API
  saveBatch: async (batchData: any) => {
    return await apiService.request('/api/batches', 'POST', batchData);
  },
  deleteBatch: async (id: string) => {
    return await apiService.request(`/api/batches/${id}`, 'DELETE');
  },

  // Blog API
  saveBlogPost: async (postData: any) => {
    return await apiService.request('/api/blog', 'POST', postData);
  },
  deleteBlogPost: async (slug: string) => {
    return await apiService.request(`/api/blog/${slug}`, 'DELETE');
  },

  // Trainers API
  saveTrainer: async (trainerData: any) => {
    return await apiService.request('/api/trainers', 'POST', trainerData);
  },
  deleteTrainer: async (id: string) => {
    return await apiService.request(`/api/trainers/${id}`, 'DELETE');
  },

  // Students API
  saveStudent: async (studentData: any) => {
    return await apiService.request('/api/students', 'POST', studentData);
  },

  // Floating Skills API
  saveFloatingSkill: async (skillData: any) => {
    return await apiService.request('/api/floating-skills', 'POST', skillData);
  },
  deleteFloatingSkill: async (id: string) => {
    return await apiService.request(`/api/floating-skills/${id}`, 'DELETE');
  },

  // Settings & Hero API
  updateSettings: async (settingsData: any) => {
    return await apiService.request('/api/website/settings', 'PUT', settingsData);
  },
  updateHeroContent: async (heroData: any) => {
    return await apiService.request('/api/website/hero', 'PUT', heroData);
  },
  updateAnnouncement: async (announcementData: any) => {
    return await apiService.request('/api/announcement', 'PUT', announcementData);
  },

  // Certificates API
  issueCertificate: async (certData: any) => {
    return await apiService.request('/api/certificates', 'POST', certData);
  },
};

