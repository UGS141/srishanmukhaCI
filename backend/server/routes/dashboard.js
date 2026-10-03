import express from 'express';
import { Lead } from '../models/Lead.js';
import { Student } from '../models/Student.js';
import { Course } from '../models/Course.js';
import { Batch } from '../models/Batch.js';
import { CertificateRecord } from '../models/CertificateRecord.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

// Parse an ISO-like YYYY-MM-DD or ISO string. Return a Date or null.
const parseDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

router.get(
  '/analytics',
  authenticateToken,
  authorizeRoles('SUPER ADMIN', 'ADMIN', 'COUNSELLOR', 'CONTENT MANAGER', 'VIEWER'),
  async (req, res) => {
    try {
      const now = new Date();
      const todayStart = startOfDay(now);
      const todayEnd = endOfDay(now);
      const last7Start = startOfDay(addDays(now, -6));
      const last30Start = startOfDay(addDays(now, -29));

      const [
        totalLeads,
        newLeads7d,
        newLeadsToday,
        convertedLeads,
        totalStudents,
        totalCourses,
        totalBatches,
        totalCertificates,
        statusAggregation,
        sourceAggregation,
        courseInterestAggregation,
        dailyTrendAggregation,
        allLeadsCompact,
      ] = await Promise.all([
        Lead.countDocuments(),
        Lead.countDocuments({ createdAt: { $gte: last7Start } }),
        Lead.countDocuments({ createdAt: { $gte: todayStart, $lte: todayEnd } }),
        Lead.countDocuments({ status: 'Converted' }),
        Student.countDocuments(),
        Course.countDocuments(),
        Batch.countDocuments(),
        CertificateRecord.countDocuments(),
        Lead.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
        Lead.aggregate([{ $group: { _id: '$source', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
        Lead.aggregate([
          { $group: { _id: '$courseInterested', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 },
        ]),
        Lead.aggregate([
          { $match: { createdAt: { $gte: last30Start } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        // Follow-up data is stored as string. Pull compact subset to compute in app layer.
        Lead.find({}, { id: 1, name: 1, phone: 1, courseInterested: 1, status: 1, followUpDate: 1 }).lean(),
      ]);

      // Build daily trend series covering all 30 days (fill zeros)
      const trendMap = new Map(dailyTrendAggregation.map((r) => [r._id, r.count]));
      const dailyTrend = [];
      for (let i = 29; i >= 0; i--) {
        const d = addDays(now, -i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        dailyTrend.push({ date: key, count: trendMap.get(key) || 0 });
      }

      // Compute follow-up buckets (string followUpDate parsed defensively)
      let followUpsToday = 0;
      let followUpsOverdue = 0;
      let followUpsUpcoming = 0;
      const todayStartMs = todayStart.getTime();
      const todayEndMs = todayEnd.getTime();
      const terminalStatuses = new Set(['Converted', 'Closed', 'Not Interested']);
      for (const lead of allLeadsCompact) {
        if (!lead.followUpDate || terminalStatuses.has(lead.status)) continue;
        const parsed = parseDate(lead.followUpDate);
        if (!parsed) continue;
        const ms = parsed.getTime();
        if (ms < todayStartMs) followUpsOverdue += 1;
        else if (ms >= todayStartMs && ms <= todayEndMs) followUpsToday += 1;
        else followUpsUpcoming += 1;
      }

      const conversionRate = totalLeads === 0 ? 0 : Math.round((convertedLeads / totalLeads) * 1000) / 10;

      res.json({
        success: true,
        generatedAt: now.toISOString(),
        counts: {
          totalLeads,
          newLeads7d,
          newLeadsToday,
          convertedLeads,
          totalStudents,
          totalCourses,
          totalBatches,
          totalCertificates,
        },
        conversionRate,
        followUps: {
          today: followUpsToday,
          overdue: followUpsOverdue,
          upcoming: followUpsUpcoming,
          total: followUpsToday + followUpsOverdue + followUpsUpcoming,
        },
        leadsByStatus: statusAggregation.map((r) => ({ status: r._id || 'Unknown', count: r.count })),
        leadsBySource: sourceAggregation.map((r) => ({ source: r._id || 'Unknown', count: r.count })),
        topCourseInterest: courseInterestAggregation.map((r) => ({ course: r._id || 'Unknown', count: r.count })),
        dailyTrend,
      });
    } catch (err) {
      console.error('Dashboard analytics error:', err);
      res.status(500).json({ success: false, message: 'Unable to compute dashboard analytics.' });
    }
  }
);

export default router;
