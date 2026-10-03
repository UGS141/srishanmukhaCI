import React, { useState, useEffect, useCallback } from 'react';
import {
  Video,
  Plus,
  Edit3,
  Trash2,
  Search,
  X,
  Save,
  RefreshCw,
  AlertTriangle,
  Calendar as CalendarIcon,
  BookOpen as BookIcon,
  Users as UsersIcon,
  Clock,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import { apiService } from '../../services/api';
import { cmsStore } from '../cmsStore';

interface Topic { title: string; description?: string; duration?: string }
interface Module { title: string; summary?: string; topics: Topic[] }
interface Session { title: string; date: string; startTime: string; endTime: string; meetingUrl?: string; status: string }

interface OnlineClass {
  id: string;
  slug: string;
  title: string;
  courseSlug?: string;
  courseName?: string;
  batchId?: string;
  trainerName?: string;
  description?: string;
  timezone?: string;
  defaultMeetingUrl?: string;
  modules: Module[];
  sessions: Session[];
  enrolledStudentIds: string[];
  status: 'Draft' | 'Active' | 'Completed' | 'Archived';
  createdAt?: string;
  updatedAt?: string;
}

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-600',
  Active: 'bg-emerald-100 text-[#12A77A]',
  Completed: 'bg-indigo-100 text-indigo-700',
  Archived: 'bg-gray-200 text-gray-500',
};

const emptyClass: Partial<OnlineClass> = {
  title: '',
  courseName: '',
  courseSlug: '',
  trainerName: '',
  description: '',
  timezone: 'Asia/Kolkata',
  defaultMeetingUrl: '',
  status: 'Draft',
  modules: [],
  sessions: [],
};

export const AdminOnlineClassesPage: React.FC = () => {
  const [classes, setClasses] = useState<OnlineClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<OnlineClass>>(emptyClass);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionBanner, setActionBanner] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await apiService.getOnlineClasses();
    if (res?.success) {
      setClasses(res.onlineClasses || []);
    } else {
      setError(res?.message || 'Could not load online classes.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const availableCourses = cmsStore.getCourses();

  const filteredClasses = classes.filter((c) => {
    const matchesStatus = statusFilter === 'all' ? true : c.status === statusFilter;
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      c.title.toLowerCase().includes(q) ||
      (c.courseName || '').toLowerCase().includes(q) ||
      (c.trainerName || '').toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const openCreate = () => {
    setEditingSlug(null);
    setFormData({ ...emptyClass });
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEdit = (cls: OnlineClass) => {
    setEditingSlug(cls.slug);
    setFormData({ ...cls });
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setIsModalOpen(false);
    setFormError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!formData.title || formData.title.trim().length < 3) {
      setFormError('Please provide a title with at least 3 characters.');
      return;
    }

    setSaving(true);
    const payload = {
      title: formData.title?.trim(),
      courseName: formData.courseName || '',
      courseSlug: formData.courseSlug || '',
      trainerName: formData.trainerName || '',
      description: formData.description || '',
      timezone: formData.timezone || 'Asia/Kolkata',
      defaultMeetingUrl: formData.defaultMeetingUrl || '',
      status: formData.status || 'Draft',
      modules: formData.modules || [],
      sessions: formData.sessions || [],
    };
    const result = editingSlug
      ? await apiService.updateOnlineClass(editingSlug, payload)
      : await apiService.saveOnlineClass(payload);
    setSaving(false);
    if (result?.success) {
      setIsModalOpen(false);
      setActionBanner({ kind: 'success', message: editingSlug ? 'Online class updated.' : 'Online class created.' });
      refresh();
    } else {
      setFormError(result?.message || 'Could not save online class.');
    }
  };

  const handleDelete = async (cls: OnlineClass) => {
    if (!window.confirm(`Delete the online class "${cls.title}"? This cannot be undone.`)) return;
    const result = await apiService.deleteOnlineClass(cls.slug);
    if (result?.success) {
      setActionBanner({ kind: 'success', message: 'Online class deleted.' });
      refresh();
    } else {
      setActionBanner({ kind: 'error', message: result?.message || 'Delete failed.' });
    }
  };

  // Module helpers
  const addModule = () => setFormData((prev) => ({
    ...prev,
    modules: [...(prev.modules || []), { title: 'New Module', topics: [] }],
  }));
  const updateModule = (idx: number, patch: Partial<Module>) => setFormData((prev) => ({
    ...prev,
    modules: (prev.modules || []).map((m, i) => (i === idx ? { ...m, ...patch } : m)),
  }));
  const removeModule = (idx: number) => setFormData((prev) => ({
    ...prev,
    modules: (prev.modules || []).filter((_, i) => i !== idx),
  }));
  const addTopic = (moduleIdx: number) => setFormData((prev) => ({
    ...prev,
    modules: (prev.modules || []).map((m, i) =>
      i === moduleIdx ? { ...m, topics: [...(m.topics || []), { title: 'New Topic' }] } : m
    ),
  }));
  const updateTopic = (moduleIdx: number, topicIdx: number, patch: Partial<Topic>) => setFormData((prev) => ({
    ...prev,
    modules: (prev.modules || []).map((m, i) =>
      i === moduleIdx
        ? { ...m, topics: m.topics.map((t, j) => (j === topicIdx ? { ...t, ...patch } : t)) }
        : m
    ),
  }));
  const removeTopic = (moduleIdx: number, topicIdx: number) => setFormData((prev) => ({
    ...prev,
    modules: (prev.modules || []).map((m, i) =>
      i === moduleIdx ? { ...m, topics: m.topics.filter((_, j) => j !== topicIdx) } : m
    ),
  }));

  // Session helpers
  const addSession = () => setFormData((prev) => ({
    ...prev,
    sessions: [...(prev.sessions || []), { title: 'New Session', date: '', startTime: '', endTime: '', status: 'Scheduled' }],
  }));
  const updateSession = (idx: number, patch: Partial<Session>) => setFormData((prev) => ({
    ...prev,
    sessions: (prev.sessions || []).map((s, i) => (i === idx ? { ...s, ...patch } : s)),
  }));
  const removeSession = (idx: number) => setFormData((prev) => ({
    ...prev,
    sessions: (prev.sessions || []).filter((_, i) => i !== idx),
  }));

  return (
    <div className="space-y-6 animate-fadeIn" data-testid="admin-online-classes-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-teal-100/70 shadow-2xs">
        <div>
          <span className="text-xs font-bold text-[#087F78] uppercase tracking-wider block">Online Learning</span>
          <h1 className="text-2xl font-extrabold text-[#123B3A]">Online Classes & Curriculum</h1>
          <p className="text-xs text-gray-500 mt-1">Create virtual cohorts, structure modules & topics, and schedule live sessions for trainers.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="p-2 rounded-xl bg-gray-100 hover:bg-teal-50 text-gray-600 hover:text-[#087F78]"
            data-testid="online-classes-refresh"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={openCreate}
            className="py-2.5 px-4 rounded-xl brand-gradient-bg text-white text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-1.5"
            data-testid="online-classes-create-button"
          >
            <Plus className="w-4 h-4" />
            <span>New Online Class</span>
          </button>
        </div>
      </div>

      {actionBanner && (
        <div
          className={`p-3 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-3 ${
            actionBanner.kind === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
          data-testid="online-classes-action-banner"
        >
          <span className="flex items-center gap-2">
            {actionBanner.kind === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {actionBanner.message}
          </span>
          <button onClick={() => setActionBanner(null)} className="opacity-70 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-3">
          <AlertTriangle className="w-4 h-4" />
          <span className="flex-1">{error}</span>
          <button onClick={refresh} className="px-3 py-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-800 font-bold">Retry</button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-2xl border border-teal-100/70 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {['all', 'Draft', 'Active', 'Completed', 'Archived'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              data-testid={`online-classes-filter-${s.toLowerCase()}`}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                statusFilter === s
                  ? 'bg-[#087F78] text-white shadow-xs'
                  : 'bg-gray-100 text-gray-600 hover:bg-teal-50 hover:text-[#087F78]'
              }`}
            >
              {s === 'all' ? 'All Classes' : s}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search title, course, trainer..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:border-[#087F78]"
            data-testid="online-classes-search-input"
          />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-teal-100/70 p-10 text-center text-xs font-semibold text-gray-400">
          Loading online classes…
        </div>
      ) : filteredClasses.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-teal-200 p-10 text-center space-y-3" data-testid="online-classes-empty-state">
          <div className="w-14 h-14 rounded-2xl bg-teal-50 text-[#087F78] flex items-center justify-center mx-auto">
            <Video className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-[#123B3A]">No online classes yet</h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            Create a virtual cohort to deliver live sessions, publish modules & topics, and track student enrolment.
          </p>
          <button
            onClick={openCreate}
            className="py-2 px-4 rounded-xl brand-gradient-bg text-white text-xs font-bold shadow-md"
            data-testid="online-classes-empty-create-button"
          >
            Create your first online class
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="online-classes-grid">
          {filteredClasses.map((cls) => {
            const upcoming = (cls.sessions || []).filter((s) => s.status === 'Scheduled').length;
            const totalTopics = (cls.modules || []).reduce((sum, m) => sum + (m.topics?.length || 0), 0);
            return (
              <div
                key={cls.slug}
                className="bg-white rounded-2xl border border-teal-100/70 shadow-2xs hover:shadow-md transition-all overflow-hidden"
                data-testid={`online-class-card-${cls.slug}`}
              >
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-[#123B3A] truncate">{cls.title}</h3>
                      <p className="text-[11px] text-gray-500 font-semibold truncate">{cls.courseName || 'Standalone class'} • Trainer: {cls.trainerName || 'TBD'}</p>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLORS[cls.status]}`}>{cls.status}</span>
                  </div>
                  {cls.description && (
                    <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">{cls.description}</p>
                  )}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100 text-[11px]">
                    <div className="flex items-center gap-1.5 text-gray-500 font-semibold">
                      <BookIcon className="w-3.5 h-3.5 text-[#087F78]" />
                      <span>{(cls.modules || []).length} modules</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-gray-500 font-semibold">
                      <ChevronRight className="w-3.5 h-3.5 text-[#087F78]" />
                      <span>{totalTopics} topics</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-gray-500 font-semibold">
                      <CalendarIcon className="w-3.5 h-3.5 text-[#F97316]" />
                      <span>{upcoming} upcoming</span>
                    </div>
                  </div>
                </div>
                <div className="px-5 py-3 bg-teal-50/40 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-gray-500 font-semibold flex items-center gap-1.5">
                    <UsersIcon className="w-3.5 h-3.5" />
                    {(cls.enrolledStudentIds || []).length} enrolled
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openEdit(cls)}
                      className="p-1.5 rounded-lg bg-white border border-teal-200 text-[#087F78] hover:bg-teal-100"
                      data-testid={`online-class-edit-${cls.slug}`}
                      title="Edit"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(cls)}
                      className="p-1.5 rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50"
                      data-testid={`online-class-delete-${cls.slug}`}
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" data-testid="online-class-modal">
          <div className="bg-white w-full sm:max-w-3xl sm:rounded-2xl rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[#123B3A]">
                  {editingSlug ? 'Edit Online Class' : 'Create Online Class'}
                </h2>
                <p className="text-[11px] text-gray-500">Define curriculum, trainer, and live session schedule.</p>
              </div>
              <button onClick={closeModal} className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-5" data-testid="online-class-form">
              {formError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold" data-testid="online-class-form-error">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-[#123B3A] uppercase tracking-wider mb-1">Class Title *</label>
                  <input
                    type="text"
                    required
                    value={formData.title || ''}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:border-[#087F78]"
                    placeholder="e.g. Python Live Evening Cohort"
                    data-testid="online-class-title-input"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#123B3A] uppercase tracking-wider mb-1">Parent Course</label>
                  <select
                    value={formData.courseSlug || ''}
                    onChange={(e) => {
                      const slug = e.target.value;
                      const course = availableCourses.find((c) => c.slug === slug);
                      setFormData({ ...formData, courseSlug: slug, courseName: course?.title || '' });
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold bg-white focus:outline-none focus:border-[#087F78]"
                    data-testid="online-class-course-select"
                  >
                    <option value="">— Standalone (no linked course) —</option>
                    {availableCourses.map((c) => (
                      <option key={c.slug} value={c.slug}>{c.title}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#123B3A] uppercase tracking-wider mb-1">Trainer</label>
                  <input
                    type="text"
                    value={formData.trainerName || ''}
                    onChange={(e) => setFormData({ ...formData, trainerName: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:border-[#087F78]"
                    placeholder="Trainer or faculty name"
                    data-testid="online-class-trainer-input"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#123B3A] uppercase tracking-wider mb-1">Status</label>
                  <select
                    value={formData.status || 'Draft'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as OnlineClass['status'] })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold bg-white focus:outline-none focus:border-[#087F78]"
                    data-testid="online-class-status-select"
                  >
                    <option value="Draft">Draft</option>
                    <option value="Active">Active</option>
                    <option value="Completed">Completed</option>
                    <option value="Archived">Archived</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#123B3A] uppercase tracking-wider mb-1">Timezone</label>
                  <input
                    type="text"
                    value={formData.timezone || ''}
                    onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:border-[#087F78]"
                    placeholder="e.g. Asia/Kolkata"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-[#123B3A] uppercase tracking-wider mb-1">Default Meeting URL (optional)</label>
                  <input
                    type="url"
                    value={formData.defaultMeetingUrl || ''}
                    onChange={(e) => setFormData({ ...formData, defaultMeetingUrl: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:border-[#087F78]"
                    placeholder="https://meet.example.com/..."
                    data-testid="online-class-meeting-input"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-[#123B3A] uppercase tracking-wider mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={formData.description || ''}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:border-[#087F78]"
                    placeholder="Describe the cohort, outcomes, prerequisites..."
                    data-testid="online-class-description-input"
                  />
                </div>
              </div>

              {/* Modules & Topics */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[#123B3A] uppercase tracking-wider">Modules & Topics</h4>
                  <button
                    type="button"
                    onClick={addModule}
                    className="py-1.5 px-3 rounded-lg bg-teal-50 text-[#087F78] text-[11px] font-bold hover:bg-teal-100 flex items-center gap-1"
                    data-testid="online-class-add-module"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Module
                  </button>
                </div>
                {(formData.modules || []).length === 0 && (
                  <p className="text-[11px] text-gray-400 italic">No modules yet. Add modules and topics to publish curriculum.</p>
                )}
                {(formData.modules || []).map((m, mi) => (
                  <div key={mi} className="p-3 rounded-xl bg-gray-50 border border-gray-200 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={m.title}
                        onChange={(e) => updateModule(mi, { title: e.target.value })}
                        placeholder="Module title"
                        className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold focus:outline-none focus:border-[#087F78]"
                      />
                      <button
                        type="button"
                        onClick={() => removeModule(mi)}
                        className="p-1.5 rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50"
                        title="Remove module"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={m.summary || ''}
                      onChange={(e) => updateModule(mi, { summary: e.target.value })}
                      placeholder="Short summary (optional)"
                      className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-[#087F78]"
                    />
                    <div className="space-y-1.5 pl-3 border-l-2 border-teal-200">
                      {(m.topics || []).map((t, ti) => (
                        <div key={ti} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={t.title}
                            onChange={(e) => updateTopic(mi, ti, { title: e.target.value })}
                            placeholder="Topic title"
                            className="flex-1 px-3 py-1 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-[#087F78]"
                          />
                          <input
                            type="text"
                            value={t.duration || ''}
                            onChange={(e) => updateTopic(mi, ti, { duration: e.target.value })}
                            placeholder="Duration"
                            className="w-24 px-3 py-1 rounded-lg border border-gray-200 text-[11px] focus:outline-none focus:border-[#087F78]"
                          />
                          <button
                            type="button"
                            onClick={() => removeTopic(mi, ti)}
                            className="p-1 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-red-600"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addTopic(mi)}
                        className="text-[11px] font-bold text-[#087F78] hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        Add topic
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Live Sessions */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[#123B3A] uppercase tracking-wider">Live Sessions</h4>
                  <button
                    type="button"
                    onClick={addSession}
                    className="py-1.5 px-3 rounded-lg bg-amber-50 text-amber-700 text-[11px] font-bold hover:bg-amber-100 flex items-center gap-1"
                    data-testid="online-class-add-session"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Session
                  </button>
                </div>
                {(formData.sessions || []).length === 0 && (
                  <p className="text-[11px] text-gray-400 italic">No sessions scheduled. Add live sessions to publish the timetable.</p>
                )}
                {(formData.sessions || []).map((s, si) => (
                  <div key={si} className="p-3 rounded-xl bg-amber-50/40 border border-amber-200 grid grid-cols-1 sm:grid-cols-6 gap-2">
                    <input
                      type="text"
                      value={s.title}
                      onChange={(e) => updateSession(si, { title: e.target.value })}
                      placeholder="Session title"
                      className="sm:col-span-2 px-3 py-1.5 rounded-lg border border-amber-200 text-xs font-semibold bg-white focus:outline-none focus:border-amber-500"
                    />
                    <input
                      type="date"
                      value={s.date}
                      onChange={(e) => updateSession(si, { date: e.target.value })}
                      className="px-3 py-1.5 rounded-lg border border-amber-200 text-xs font-semibold bg-white focus:outline-none focus:border-amber-500"
                    />
                    <input
                      type="time"
                      value={s.startTime}
                      onChange={(e) => updateSession(si, { startTime: e.target.value })}
                      className="px-3 py-1.5 rounded-lg border border-amber-200 text-xs font-semibold bg-white focus:outline-none focus:border-amber-500"
                    />
                    <input
                      type="time"
                      value={s.endTime}
                      onChange={(e) => updateSession(si, { endTime: e.target.value })}
                      className="px-3 py-1.5 rounded-lg border border-amber-200 text-xs font-semibold bg-white focus:outline-none focus:border-amber-500"
                    />
                    <div className="flex items-center gap-2">
                      <select
                        value={s.status}
                        onChange={(e) => updateSession(si, { status: e.target.value })}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-amber-200 text-xs font-semibold bg-white focus:outline-none focus:border-amber-500"
                      >
                        <option value="Scheduled">Scheduled</option>
                        <option value="Live">Live</option>
                        <option value="Completed">Completed</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => removeSession(si)}
                        className="p-1.5 rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <input
                      type="url"
                      value={s.meetingUrl || ''}
                      onChange={(e) => updateSession(si, { meetingUrl: e.target.value })}
                      placeholder="Meeting URL (optional)"
                      className="sm:col-span-6 px-3 py-1.5 rounded-lg border border-amber-200 text-[11px] bg-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="py-2.5 px-4 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold hover:bg-gray-200 disabled:opacity-50"
                  data-testid="online-class-cancel-button"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="py-2.5 px-4 rounded-xl brand-gradient-bg text-white text-xs font-bold shadow-md hover:shadow-lg disabled:opacity-60 flex items-center gap-2"
                  data-testid="online-class-save-button"
                >
                  {saving ? <Clock className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>{saving ? 'Saving…' : editingSlug ? 'Update Class' : 'Create Class'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
