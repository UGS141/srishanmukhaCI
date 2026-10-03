import express from 'express';
import { OnlineClass } from '../models/OnlineClass.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);

const ALLOWED_FIELDS = [
  'title',
  'courseSlug',
  'courseName',
  'batchId',
  'trainerName',
  'description',
  'timezone',
  'defaultMeetingUrl',
  'status',
  'modules',
  'sessions',
  'enrolledStudentIds',
];

const WRITE_ROLES = ['SUPER ADMIN', 'ADMIN', 'CONTENT MANAGER'];
const READ_ROLES = ['SUPER ADMIN', 'ADMIN', 'CONTENT MANAGER', 'COUNSELLOR', 'TRAINER', 'VIEWER'];

const pickAllowed = (body) => {
  const out = {};
  for (const key of ALLOWED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
  }
  return out;
};

// LIST
router.get('/', authenticateToken, authorizeRoles(...READ_ROLES), async (req, res) => {
  try {
    const { status, courseSlug, search } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (courseSlug) filter.courseSlug = courseSlug;
    if (search) {
      const re = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ title: re }, { trainerName: re }, { courseName: re }];
    }
    const items = await OnlineClass.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, onlineClasses: items });
  } catch (err) {
    console.error('OnlineClass list error:', err);
    res.status(500).json({ success: false, message: 'Error fetching online classes.' });
  }
});

// GET by slug
router.get('/:slug', authenticateToken, authorizeRoles(...READ_ROLES), async (req, res) => {
  try {
    const item = await OnlineClass.findOne({ slug: req.params.slug });
    if (!item) return res.status(404).json({ success: false, message: 'Online class not found.' });
    res.json({ success: true, onlineClass: item });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching online class.' });
  }
});

// CREATE
router.post('/', authenticateToken, authorizeRoles(...WRITE_ROLES), async (req, res) => {
  try {
    const payload = pickAllowed(req.body);
    if (!payload.title || typeof payload.title !== 'string' || payload.title.trim().length < 3) {
      return res.status(400).json({ success: false, message: 'Title (min 3 characters) is required.' });
    }
    // Slug and id are server-generated from the trusted title only. Client-supplied slug/id are ignored.
    const baseSlug = slugify(payload.title) || `online-class-${Date.now()}`;
    let slug = baseSlug;
    let suffix = 1;
    while (await OnlineClass.exists({ slug })) {
      slug = `${baseSlug}-${suffix++}`;
      if (suffix > 50) break;
    }
    const id = `OC-${Date.now().toString().slice(-8)}`;
    // Force new online classes to start in Draft; status transitions must go through PUT.
    const created = await OnlineClass.create({ ...payload, id, slug, status: 'Draft' });
    res.status(201).json({ success: true, onlineClass: created });
  } catch (err) {
    console.error('OnlineClass create error:', err);
    res.status(400).json({ success: false, message: err.message || 'Could not create online class.' });
  }
});

// UPDATE (by slug)
router.put('/:slug', authenticateToken, authorizeRoles(...WRITE_ROLES), async (req, res) => {
  try {
    const payload = pickAllowed(req.body);
    const updated = await OnlineClass.findOneAndUpdate(
      { slug: req.params.slug },
      { $set: payload },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ success: false, message: 'Online class not found.' });
    res.json({ success: true, onlineClass: updated });
  } catch (err) {
    console.error('OnlineClass update error:', err);
    res.status(400).json({ success: false, message: err.message || 'Could not update online class.' });
  }
});

// DELETE
router.delete('/:slug', authenticateToken, authorizeRoles(...WRITE_ROLES), async (req, res) => {
  try {
    const removed = await OnlineClass.findOneAndDelete({ slug: req.params.slug });
    if (!removed) return res.status(404).json({ success: false, message: 'Online class not found.' });
    res.json({ success: true, message: 'Online class deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error deleting online class.' });
  }
});

export default router;
