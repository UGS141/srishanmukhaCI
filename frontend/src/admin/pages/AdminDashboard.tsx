import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Inbox,
  BookOpen,
  Calendar,
  Users,
  Award,
  FileText,
  Plus,
  Phone,
  MessageSquare,
  Clock,
  ArrowUpRight,
  Eye,
  ChevronRight,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  Video,
  Target,
  Zap
} from 'lucide-react';
import { cmsStore, type Lead } from '../cmsStore';
import { apiService } from '../../services/api';

interface DashboardAnalytics {
  success: boolean;
  generatedAt: string;
  counts: {
    totalLeads: number;
    newLeads7d: number;
    newLeadsToday: number;
    convertedLeads: number;
    totalStudents: number;
    totalCourses: number;
    totalBatches: number;
    totalCertificates: number;
  };
  conversionRate: number;
  followUps: { today: number; overdue: number; upcoming: number; total: number };
  leadsByStatus: { status: string; count: number }[];
  leadsBySource: { source: string; count: number }[];
  topCourseInterest: { course: string; count: number }[];
  dailyTrend: { date: string; count: number }[];
}

const STATUS_COLORS: Record<string, string> = {
  New: 'bg-orange-100 text-[#F97316]',
  Contacted: 'bg-teal-100 text-[#087F78]',
  Interested: 'bg-indigo-100 text-indigo-700',
  'Follow-up': 'bg-amber-100 text-amber-700',
  Converted: 'bg-emerald-100 text-[#12A77A]',
  'Not Interested': 'bg-gray-200 text-gray-600',
  Closed: 'bg-gray-200 text-gray-600',
  Unknown: 'bg-gray-100 text-gray-500',
};

const COURSE_BAR_COLORS = ['bg-[#087F78]', 'bg-[#F97316]', 'bg-[#12A77A]', 'bg-[#F5B72C]', 'bg-[#123B3A]'];

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();

  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>(cmsStore.getLeads());

  const refreshAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    const data = await apiService.getDashboardAnalytics();
    if (data?.success) {
      setAnalytics(data);
    } else {
      setAnalyticsError(data?.message || 'Could not reach the analytics service. Please retry.');
    }
    setAnalyticsLoading(false);
  }, []);

  useEffect(() => {
    refreshAnalytics();
    const unsubscribe = cmsStore.subscribe(() => setLeads([...cmsStore.getLeads()]));
    return unsubscribe;
  }, [refreshAnalytics]);

  const counts = analytics?.counts;
  const conversionRate = analytics?.conversionRate ?? 0;
  const followUps = analytics?.followUps;
  const dailyTrend = analytics?.dailyTrend || [];
  const topCourseInterest = analytics?.topCourseInterest || [];
  const leadsByStatus = analytics?.leadsByStatus || [];

  const handleStatusChange = async (id: string, newStatus: Lead['status']) => {
    try {
      await cmsStore.updateLeadStatus(id, newStatus);
      refreshAnalytics();
    } catch (_) {
      // intentionally swallow at dashboard - detail page shows errors
    }
  };

  // SVG line chart points from dailyTrend
  const maxTrend = Math.max(1, ...dailyTrend.map((d) => d.count));
  const trendPath = dailyTrend
    .map((d, i) => {
      const x = (i / Math.max(1, dailyTrend.length - 1)) * 500;
      const y = 170 - (d.count / maxTrend) * 140;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const trendAreaPath = trendPath ? `${trendPath} L 500,180 L 0,180 Z` : '';
  const totalInterest = topCourseInterest.reduce((sum, c) => sum + c.count, 0) || 1;

  const kpiCards = [
    {
      title: 'TOTAL ENQUIRIES',
      value: counts?.totalLeads ?? '—',
      subtext: analytics ? `${counts?.newLeadsToday ?? 0} new today  •  ${counts?.newLeads7d ?? 0} in 7 days` : 'Live from MongoDB',
      icon: Inbox,
      gradient: 'from-[#087F78] to-[#12A77A]',
      path: '/admin/enquiries',
      testid: 'kpi-total-enquiries',
    },
    {
      title: 'CONVERSION RATE',
      value: analytics ? `${conversionRate}%` : '—',
      subtext: analytics ? `${counts?.convertedLeads ?? 0} converted of ${counts?.totalLeads ?? 0}` : 'Converted ÷ Total Leads',
      icon: Target,
      gradient: 'from-[#12A77A] to-emerald-600',
      path: '/admin/enquiries?status=Converted',
      testid: 'kpi-conversion-rate',
    },
    {
      title: 'FOLLOW-UPS DUE',
      value: followUps ? followUps.today + followUps.overdue : '—',
      subtext: followUps ? `${followUps.overdue} overdue  •  ${followUps.today} today  •  ${followUps.upcoming} upcoming` : 'Scheduled follow-ups',
      icon: Clock,
      gradient: 'from-[#F97316] to-amber-500',
      path: '/admin/enquiries',
      testid: 'kpi-follow-ups',
      badge: followUps && followUps.overdue > 0 ? `${followUps.overdue} OVERDUE` : undefined,
    },
    {
      title: 'REGISTERED STUDENTS',
      value: counts?.totalStudents ?? '—',
      subtext: 'Active roster & alumni',
      icon: Users,
      gradient: 'from-[#087F78] to-teal-600',
      path: '/admin/students',
      testid: 'kpi-students',
    },
    {
      title: 'PUBLISHED COURSES',
      value: counts?.totalCourses ?? '—',
      subtext: 'Active curriculum catalogue',
      icon: BookOpen,
      gradient: 'from-[#123B3A] to-[#087F78]',
      path: '/admin/courses',
      testid: 'kpi-courses',
    },
    {
      title: 'ISSUED CERTIFICATES',
      value: counts?.totalCertificates ?? '—',
      subtext: 'Verifiable credentials',
      icon: Award,
      gradient: 'from-[#F5B72C] to-amber-600',
      path: '/admin/certificates',
      testid: 'kpi-certificates',
    },
  ];

  const renderDateLabel = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-8 animate-fadeIn" data-testid="admin-dashboard">
      {/* Welcome Banner & Quick Actions */}
      <div className="bg-gradient-to-r from-[#123B3A] via-[#087F78] to-[#123B3A] rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl relative z-10">
          <span className="px-3 py-1 rounded-full bg-white/10 text-amber-300 text-xs font-bold uppercase tracking-wider backdrop-blur-md inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Live Operational Dashboard</span>
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Good day, <span className="text-[#F5B72C]">Administrator</span>
          </h1>
          <p className="text-xs sm:text-sm text-teal-100/90 leading-relaxed">
            Real-time counts, follow-ups, and conversion metrics computed directly from MongoDB. Mutations in CRM instantly reflect here.
          </p>
          {analytics && (
            <p className="text-[11px] text-teal-100/70 font-mono mt-1" data-testid="dashboard-generated-at">
              Snapshot: {new Date(analytics.generatedAt).toLocaleString()}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 relative z-10">
          <button
            onClick={refreshAnalytics}
            disabled={analyticsLoading}
            className="py-2.5 px-4 rounded-xl bg-white/15 text-white hover:bg-white/25 text-xs font-bold shadow-md transition-all flex items-center gap-1.5 backdrop-blur-sm disabled:opacity-60"
            data-testid="dashboard-refresh-button"
          >
            <RefreshCw className={`w-4 h-4 ${analyticsLoading ? 'animate-spin' : ''}`} />
            <span>{analyticsLoading ? 'Refreshing…' : 'Refresh'}</span>
          </button>
          <button
            onClick={() => navigate('/admin/online-classes')}
            className="py-2.5 px-4 rounded-xl bg-white text-[#123B3A] hover:bg-teal-50 text-xs font-bold shadow-md transition-all flex items-center gap-1.5"
            data-testid="dashboard-online-classes-cta"
          >
            <Video className="w-4 h-4 text-[#087F78]" />
            <span>Online Classes</span>
          </button>
          <button
            onClick={() => navigate('/admin/enquiries')}
            className="py-2.5 px-4 rounded-xl bg-[#F97316] text-white hover:bg-orange-600 text-xs font-bold shadow-md transition-all flex items-center gap-1.5"
            data-testid="dashboard-go-to-crm"
          >
            <Zap className="w-4 h-4" />
            <span>Open CRM</span>
          </button>
        </div>
      </div>

      {analyticsError && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-3" data-testid="dashboard-error-banner">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{analyticsError}</span>
          <button onClick={refreshAnalytics} className="px-3 py-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-800 text-[11px] font-bold">
            Retry
          </button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4" data-testid="dashboard-kpi-grid">
        {kpiCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <Link
              key={idx}
              to={card.path}
              className="bg-white rounded-2xl p-5 border border-teal-100/70 shadow-2xs hover:shadow-lg transition-all duration-300 flex flex-col justify-between group card-hover-effect"
              data-testid={card.testid}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${card.gradient} text-white flex items-center justify-center shadow-md`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  {card.badge && (
                    <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-extrabold animate-pulse">
                      {card.badge}
                    </span>
                  )}
                </div>
                <h3 className="text-[11px] font-bold text-[#4B6B69] uppercase tracking-wider">{card.title}</h3>
                <p className="text-2xl font-extrabold text-[#123B3A] group-hover:text-[#087F78] transition-colors mt-1">
                  {analyticsLoading && !analytics ? '…' : card.value}
                </p>
              </div>
              <p className="text-[11px] font-semibold text-teal-600/80 mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                <span className="truncate">{card.subtext}</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#087F78] shrink-0" />
              </p>
            </Link>
          );
        })}
      </div>

      {/* Analytics Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Enquiries Over Time (Live) */}
        <div className="lg:col-span-8 bg-white rounded-2xl p-6 border border-teal-100/70 shadow-2xs space-y-4" data-testid="dashboard-trend-chart">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-[#123B3A]">Enquiries Trend</h3>
              <p className="text-xs text-gray-500 font-medium">Daily lead volume — last 30 days</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-teal-50 text-[#087F78] text-xs font-bold">
              Peak {maxTrend}/day
            </span>
          </div>

          <div className="h-56 w-full pt-4 relative">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 500 180" preserveAspectRatio="none">
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#087F78" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#087F78" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <line x1="0" y1="30" x2="500" y2="30" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="0" y1="80" x2="500" y2="80" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="0" y1="130" x2="500" y2="130" stroke="#F1F5F9" strokeWidth="1" />
              {trendAreaPath && <path d={trendAreaPath} fill="url(#chartGradient)" />}
              {trendPath && <path d={trendPath} fill="none" stroke="#087F78" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
              {dailyTrend.map((d, i) => {
                const x = (i / Math.max(1, dailyTrend.length - 1)) * 500;
                const y = 170 - (d.count / maxTrend) * 140;
                return <circle key={d.date} cx={x} cy={y} r={d.count > 0 ? 3 : 1.5} fill={d.count > 0 ? '#087F78' : '#CBD5E1'} />;
              })}
            </svg>

            <div className="flex items-center justify-between text-[11px] text-gray-400 font-semibold mt-2">
              <span>{dailyTrend[0] ? renderDateLabel(dailyTrend[0].date) : '—'}</span>
              <span>{dailyTrend[Math.floor(dailyTrend.length / 2)] ? renderDateLabel(dailyTrend[Math.floor(dailyTrend.length / 2)].date) : ''}</span>
              <span>{dailyTrend[dailyTrend.length - 1] ? renderDateLabel(dailyTrend[dailyTrend.length - 1].date) : ''}</span>
            </div>
          </div>
        </div>

        {/* Course Interest (Live) */}
        <div className="lg:col-span-4 bg-white rounded-2xl p-6 border border-teal-100/70 shadow-2xs space-y-4" data-testid="dashboard-course-interest">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[#123B3A]">Top Course Interest</h3>
            <span className="text-xs font-bold text-[#087F78]">Live</span>
          </div>

          <div className="space-y-3.5 pt-2">
            {topCourseInterest.length === 0 && !analyticsLoading && (
              <div className="p-4 text-center text-[11px] text-gray-400">
                No course-interest data yet. Submit an enquiry to populate this chart.
              </div>
            )}
            {topCourseInterest.map((item, idx) => {
              const pct = Math.round((item.count / Math.max(1, topCourseInterest[0]?.count || 1)) * 100);
              return (
                <div key={item.course} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-[#123B3A] truncate pr-2">{item.course}</span>
                    <span className="text-gray-500 font-semibold">{item.count} {item.count === 1 ? 'lead' : 'leads'}</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className={`h-full rounded-full ${COURSE_BAR_COLORS[idx % COURSE_BAR_COLORS.length]}`} style={{ width: `${Math.max(pct, 6)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Lead status breakdown + Recent enquiries */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 bg-white rounded-2xl p-6 border border-teal-100/70 shadow-2xs space-y-4" data-testid="dashboard-status-breakdown">
          <h3 className="text-base font-bold text-[#123B3A]">Pipeline by Status</h3>
          {leadsByStatus.length === 0 && !analyticsLoading && (
            <div className="p-4 text-center text-[11px] text-gray-400">No leads in pipeline yet.</div>
          )}
          <div className="space-y-2">
            {leadsByStatus.map((s) => {
              const total = analytics?.counts.totalLeads || 1;
              const pct = Math.round((s.count / total) * 100);
              return (
                <div key={s.status} className="flex items-center justify-between gap-3">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLORS[s.status] || STATUS_COLORS.Unknown}`}>
                    {s.status}
                  </span>
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#087F78] rounded-full" style={{ width: `${Math.max(pct, 4)}%` }} />
                  </div>
                  <span className="text-xs font-bold text-[#123B3A] w-10 text-right">{s.count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-8 bg-white rounded-2xl p-6 border border-teal-100/70 shadow-2xs space-y-4" data-testid="dashboard-recent-enquiries">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-base font-bold text-[#123B3A]">Recent Enquiries</h3>
              <p className="text-xs text-gray-500">Latest leads received through the website</p>
            </div>
            <Link to="/admin/enquiries" className="text-xs font-bold text-[#087F78] hover:underline flex items-center gap-1">
              <span>View all</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 text-[11px] font-bold text-[#4B6B69] uppercase tracking-wider bg-teal-50/50">
                  <th className="py-3 px-3 rounded-l-xl">Lead</th>
                  <th className="py-3 px-3">Course</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right rounded-r-xl">Quick Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-xs">
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-xs text-gray-400">No enquiries yet.</td>
                  </tr>
                ) : (
                  leads.slice(0, 5).map((lead) => (
                    <tr key={lead.id} className="hover:bg-teal-50/30 transition-colors">
                      <td className="py-3 px-3">
                        <p className="font-bold text-[#123B3A]">{lead.name}</p>
                        <p className="text-[11px] text-gray-500 font-semibold">{lead.phone}</p>
                      </td>
                      <td className="py-3 px-3 font-semibold text-gray-700">{lead.courseInterested}</td>
                      <td className="py-3 px-3">
                        <select
                          value={lead.status}
                          onChange={(e) => handleStatusChange(lead.id, e.target.value as Lead['status'])}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold focus:outline-none cursor-pointer ${STATUS_COLORS[lead.status] || STATUS_COLORS.Unknown}`}
                        >
                          <option value="New">New</option>
                          <option value="Contacted">Contacted</option>
                          <option value="Interested">Interested</option>
                          <option value="Follow-up">Follow-up</option>
                          <option value="Converted">Converted</option>
                          <option value="Closed">Closed</option>
                        </select>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <a href={`tel:${lead.phone}`} className="p-1.5 rounded-lg bg-teal-50 text-[#087F78] hover:bg-teal-100">
                            <Phone className="w-3.5 h-3.5" />
                          </a>
                          <a
                            href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-lg bg-emerald-50 text-[#12A77A] hover:bg-emerald-100"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </a>
                          <button onClick={() => navigate('/admin/enquiries')} className="p-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
