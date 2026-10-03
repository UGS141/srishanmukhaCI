import express from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Lead } from '../models/Lead.js';
import { Student } from '../models/Student.js';
import { Batch } from '../models/Batch.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

const EXPORT_ROLES = {
  enquiries: ['SUPER ADMIN', 'ADMIN', 'COUNSELLOR'],
  students: ['SUPER ADMIN', 'ADMIN', 'COUNSELLOR'],
  batches: ['SUPER ADMIN', 'ADMIN', 'CONTENT MANAGER'],
};

const slugForFilename = (label) =>
  String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'export';

const safeFilename = (prefix) => {
  const ts = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
  return `ssci-${slugForFilename(prefix)}-${ts}`;
};

const escapeCSV = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
};

const parseDateRange = (query) => {
  const { from, to } = query;
  const range = {};
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) range.$gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      range.$lte = d;
    }
  }
  return Object.keys(range).length ? range : null;
};

const buildFilterSummary = (query) => {
  const parts = [];
  for (const [k, v] of Object.entries(query)) {
    if (!v || k === 'format') continue;
    parts.push(`${k}: ${v}`);
  }
  return parts.length ? parts.join('  •  ') : 'All records';
};

// --- Dataset builders ---

const ENQUIRY_COLUMNS = [
  { header: 'Lead ID', key: 'id', width: 14 },
  { header: 'Name', key: 'name', width: 24 },
  { header: 'Phone', key: 'phone', width: 18 },
  { header: 'Email', key: 'email', width: 28 },
  { header: 'Course Interested', key: 'courseInterested', width: 26 },
  { header: 'Preferred Batch', key: 'preferredBatch', width: 20 },
  { header: 'Source', key: 'source', width: 12 },
  { header: 'Status', key: 'status', width: 14 },
  { header: 'Assigned To', key: 'assignedTo', width: 20 },
  { header: 'Follow-up Date', key: 'followUpDate', width: 16 },
  { header: 'Created', key: 'createdAt', width: 20 },
];

const buildEnquiryFilter = (query) => {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.source) filter.source = query.source;
  if (query.course) filter.courseInterested = query.course;
  if (query.counsellor) filter.assignedTo = query.counsellor;
  const range = parseDateRange(query);
  if (range) filter.createdAt = range;
  if (query.search) {
    const re = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: re }, { phone: re }, { email: re }, { courseInterested: re }];
  }
  return filter;
};

const buildStudentFilter = (query) => {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.course) filter.course = query.course;
  if (query.batch) filter.batch = query.batch;
  if (query.search) {
    const re = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: re }, { studentId: re }, { phone: re }, { email: re }, { course: re }];
  }
  return filter;
};

const STUDENT_COLUMNS = [
  { header: 'Student ID', key: 'studentId', width: 22 },
  { header: 'Name', key: 'name', width: 24 },
  { header: 'Phone', key: 'phone', width: 18 },
  { header: 'Email', key: 'email', width: 28 },
  { header: 'Course', key: 'course', width: 24 },
  { header: 'Batch', key: 'batch', width: 20 },
  { header: 'Status', key: 'status', width: 14 },
  { header: 'Admission Date', key: 'admissionDate', width: 18 },
  { header: 'Grade', key: 'grade', width: 10 },
];

const buildBatchFilter = (query) => {
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.course) filter.courseSlug = query.course;
  if (query.timing) filter.timing = query.timing;
  const range = parseDateRange(query);
  if (range) filter.createdAt = range;
  if (query.search) {
    const re = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ id: re }, { courseName: re }, { trainerName: re }];
  }
  return filter;
};

const BATCH_COLUMNS = [
  { header: 'Batch ID', key: 'id', width: 18 },
  { header: 'Course', key: 'courseName', width: 26 },
  { header: 'Category', key: 'category', width: 18 },
  { header: 'Level', key: 'level', width: 20 },
  { header: 'Duration', key: 'duration', width: 14 },
  { header: 'Timing', key: 'timing', width: 12 },
  { header: 'Time Range', key: 'timeRange', width: 22 },
  { header: 'Start Date', key: 'startDate', width: 16 },
  { header: 'Mode', key: 'mode', width: 16 },
  { header: 'Trainer', key: 'trainerName', width: 22 },
  { header: 'Seats', key: 'seats', width: 10 },
  { header: 'Status', key: 'status', width: 16 },
];

const DATASETS = {
  enquiries: {
    label: 'Enquiries & Leads',
    columns: ENQUIRY_COLUMNS,
    buildFilter: buildEnquiryFilter,
    fetch: async (filter) => Lead.find(filter).sort({ createdAt: -1 }).lean(),
    toRow: (lead) => ({
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      email: lead.email || '',
      courseInterested: lead.courseInterested || '',
      preferredBatch: lead.preferredBatch || '',
      source: lead.source || '',
      status: lead.status || '',
      assignedTo: lead.assignedTo || '',
      followUpDate: lead.followUpDate || '',
      createdAt: lead.createdAt ? new Date(lead.createdAt).toISOString().slice(0, 19).replace('T', ' ') : '',
    }),
  },
  students: {
    label: 'Students Roster',
    columns: STUDENT_COLUMNS,
    buildFilter: buildStudentFilter,
    fetch: async (filter) => Student.find(filter).sort({ createdAt: -1 }).lean(),
    toRow: (s) => ({
      studentId: s.studentId,
      name: s.name,
      phone: s.phone,
      email: s.email,
      course: s.course,
      batch: s.batch,
      status: s.status,
      admissionDate: s.admissionDate,
      grade: s.grade || '',
    }),
  },
  batches: {
    label: 'Batches Schedule',
    columns: BATCH_COLUMNS,
    buildFilter: buildBatchFilter,
    fetch: async (filter) => Batch.find(filter).sort({ createdAt: -1 }).lean(),
    toRow: (b) => ({
      id: b.id,
      courseName: b.courseName,
      category: b.category,
      level: b.level,
      duration: b.duration,
      timing: b.timing,
      timeRange: b.timeRange,
      startDate: b.startDate,
      mode: b.mode,
      trainerName: b.trainerName,
      seats: `${b.filledSeats || 0}/${b.totalSeats || 0}`,
      status: b.status,
    }),
  },
};

// --- Writers ---

const writeCSV = (res, dataset, rows) => {
  const headers = dataset.columns.map((c) => escapeCSV(c.header)).join(',');
  const lines = [headers];
  for (const row of rows) {
    lines.push(dataset.columns.map((c) => escapeCSV(row[c.key] ?? '')).join(','));
  }
  const filename = `${safeFilename(dataset.label)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(lines.join('\r\n'));
};

const writeXLSX = async (res, dataset, rows, filterSummary) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SSCI Admin Suite';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(dataset.label.slice(0, 31), {
    properties: { tabColor: { argb: 'FF087F78' } },
  });

  // Title row
  sheet.mergeCells(1, 1, 1, dataset.columns.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `Sri Shanmukha Computer Institute — ${dataset.label}`;
  titleCell.font = { size: 14, bold: true, color: { argb: 'FF123B3A' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };

  // Meta row
  sheet.mergeCells(2, 1, 2, dataset.columns.length);
  const metaCell = sheet.getCell(2, 1);
  metaCell.value = `Generated: ${new Date().toLocaleString()}   •   Filters: ${filterSummary}   •   Rows: ${rows.length}`;
  metaCell.font = { size: 10, italic: true, color: { argb: 'FF4B6B69' } };

  sheet.addRow([]);

  const headerRow = sheet.addRow(dataset.columns.map((c) => c.header));
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF087F78' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF123B3A' } } };
  });

  dataset.columns.forEach((col, idx) => {
    sheet.getColumn(idx + 1).width = col.width;
  });

  for (const row of rows) {
    sheet.addRow(dataset.columns.map((c) => row[c.key] ?? ''));
  }

  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: dataset.columns.length } };
  sheet.views = [{ state: 'frozen', ySplit: 4 }];

  const filename = `${safeFilename(dataset.label)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
};

const writePDF = (res, dataset, rows, filterSummary) => {
  const filename = `${safeFilename(dataset.label)}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
  doc.pipe(res);

  const brandTeal = '#087F78';
  const brandInk = '#123B3A';
  const brandMuted = '#4B6B69';
  const stripe = '#F3F8F7';

  const drawHeader = () => {
    doc.fillColor(brandInk).font('Helvetica-Bold').fontSize(16).text('Sri Shanmukha Computer Institute', 36, 32);
    doc.font('Helvetica').fontSize(9).fillColor(brandMuted).text('Admin Suite  •  Powered by UGS IT Solutions', 36, 50);
    doc.fontSize(13).fillColor(brandTeal).font('Helvetica-Bold').text(dataset.label, 36, 68);
    doc.font('Helvetica').fontSize(8).fillColor(brandMuted).text(
      `Generated: ${new Date().toLocaleString()}  •  Filters: ${filterSummary}  •  Rows: ${rows.length}`,
      36,
      86
    );
    doc.moveTo(36, 102).lineTo(doc.page.width - 36, 102).lineWidth(1).strokeColor(brandTeal).stroke();
  };

  const availableWidth = doc.page.width - 72; // 36 margin each side
  const columns = dataset.columns.map((c) => c);
  const totalColumnWidth = columns.reduce((sum, c) => sum + c.width, 0);
  const colWidths = columns.map((c) => Math.floor((c.width / totalColumnWidth) * availableWidth));

  let y = 112;

  const drawRow = (values, { isHeader = false, zebra = false } = {}) => {
    const rowHeight = isHeader ? 20 : 18;
    if (zebra && !isHeader) {
      doc.rect(36, y, availableWidth, rowHeight).fill(stripe);
    }
    let x = 36;
    doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(isHeader ? 9 : 8).fillColor(isHeader ? '#FFFFFF' : brandInk);
    if (isHeader) {
      doc.rect(36, y, availableWidth, rowHeight).fill(brandTeal);
      doc.fillColor('#FFFFFF');
    }
    values.forEach((val, idx) => {
      const text = val === null || val === undefined ? '' : String(val);
      doc.text(text, x + 4, y + 5, { width: colWidths[idx] - 8, height: rowHeight - 6, ellipsis: true });
      x += colWidths[idx];
    });
    y += rowHeight;
  };

  const drawTableHead = () => drawRow(columns.map((c) => c.header), { isHeader: true });

  const drawFooter = () => {
    const pageNum = doc.bufferedPageRange().count;
    doc.font('Helvetica').fontSize(8).fillColor(brandMuted);
    doc.text(
      `Confidential • SSCI Admin Suite • Page ${pageNum}`,
      36,
      doc.page.height - 28,
      { width: doc.page.width - 72, align: 'center' }
    );
  };

  drawHeader();
  drawTableHead();
  rows.forEach((row, idx) => {
    if (y > doc.page.height - 60) {
      drawFooter();
      doc.addPage();
      y = 36;
      drawHeader();
      y = 112;
      drawTableHead();
    }
    drawRow(columns.map((c) => row[c.key] ?? ''), { zebra: idx % 2 === 0 });
  });

  if (rows.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(11).fillColor(brandMuted);
    doc.text('No records match the current filters.', 36, y + 20);
  }

  drawFooter();
  doc.end();
};

const makeHandler = (datasetKey) => async (req, res) => {
  try {
    const dataset = DATASETS[datasetKey];
    if (!dataset) return res.status(404).json({ success: false, message: 'Unknown export dataset.' });

    const format = String(req.query.format || 'csv').toLowerCase();
    if (!['csv', 'xlsx', 'pdf'].includes(format)) {
      return res.status(400).json({ success: false, message: "Format must be one of 'csv', 'xlsx', 'pdf'." });
    }

    const filter = dataset.buildFilter(req.query);
    const docs = await dataset.fetch(filter);
    const rows = docs.map(dataset.toRow);
    const filterSummary = buildFilterSummary(req.query);

    if (format === 'csv') return writeCSV(res, dataset, rows);
    if (format === 'xlsx') return writeXLSX(res, dataset, rows, filterSummary);
    return writePDF(res, dataset, rows, filterSummary);
  } catch (err) {
    console.error(`Export ${datasetKey} error:`, err);
    res.status(500).json({ success: false, message: 'Export generation failed.' });
  }
};

router.get(
  '/enquiries',
  authenticateToken,
  authorizeRoles(...EXPORT_ROLES.enquiries),
  makeHandler('enquiries')
);
router.get(
  '/students',
  authenticateToken,
  authorizeRoles(...EXPORT_ROLES.students),
  makeHandler('students')
);
router.get(
  '/batches',
  authenticateToken,
  authorizeRoles(...EXPORT_ROLES.batches),
  makeHandler('batches')
);

export default router;
