const ExcelJS = require('exceljs');
const { jsPDF } = require('jspdf');
require('jspdf-autotable');
const prisma = require('../db/prisma');

/**
 * Generate Excel workbook buffer for Bookings.
 */
async function exportBookingsExcel({ month, year }) {
  const where = {};
  if (month && year) {
    const m = String(month).padStart(2, '0');
    where.bookingDate = {
      gte: `${year}-${m}-01`,
      lte: `${year}-${m}-31`,
    };
  }

  const bookings = await prisma.booking.findMany({
    where,
    orderBy: [{ bookingDate: 'asc' }, { startTime: 'asc' }],
    include: {
      user: { select: { fullName: true, company: true, email: true } },
    },
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Booking Meeting System';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Bookings Report');

  // Title row
  const monthName = month ? new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long' }) : 'All Time';
  worksheet.mergeCells('A1:G1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `Booking Meeting — Reservation Report (${monthName} ${year || ''})`;
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF0891B2' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 30;

  // Subtitle / metadata
  worksheet.mergeCells('A2:G2');
  const metaCell = worksheet.getCell('A2');
  metaCell.value = `Generated on ${new Date().toLocaleString()} | Total Bookings: ${bookings.length}`;
  metaCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };
  metaCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(2).height = 20;

  worksheet.addRow([]); // Blank row

  // Table Headers
  const headerRow = worksheet.addRow([
    'Date',
    'Time Slot',
    'Client Name',
    'Company',
    'Meeting Topic',
    'Status',
    'Booked On',
  ]);

  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF0891B2' } },
    };
  });

  // Data rows
  bookings.forEach((b) => {
    const row = worksheet.addRow([
      b.bookingDate,
      `${b.startTime} – ${b.endTime}`,
      b.user?.fullName || 'N/A',
      b.user?.company || 'N/A',
      b.topic,
      b.status,
      new Date(b.createdAt).toLocaleDateString(),
    ]);

    row.height = 20;
    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Arial', size: 10 };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };

      if (colNumber === 6) {
        // Status column styling
        if (b.status === 'CONFIRMED') {
          cell.font = { color: { argb: 'FF059669' }, bold: true };
        } else if (b.status === 'RESCHEDULED') {
          cell.font = { color: { argb: 'FFD97706' }, bold: true };
        } else if (b.status === 'CANCELLED') {
          cell.font = { color: { argb: 'FFE11D48' }, bold: true };
        }
      }
    });
  });

  // Auto-fit column widths
  worksheet.columns.forEach((column) => {
    let maxLength = 12;
    column.eachCell({ includeEmpty: false }, (cell) => {
      const length = cell.value ? String(cell.value).length : 0;
      if (length > maxLength) maxLength = Math.min(length + 2, 45);
    });
    column.width = maxLength;
  });

  return await workbook.xlsx.writeBuffer();
}

/**
 * Generate PDF buffer for Bookings.
 */
async function exportBookingsPdf({ month, year }) {
  const where = {};
  if (month && year) {
    const m = String(month).padStart(2, '0');
    where.bookingDate = {
      gte: `${year}-${m}-01`,
      lte: `${year}-${m}-31`,
    };
  }

  const bookings = await prisma.booking.findMany({
    where,
    orderBy: [{ bookingDate: 'asc' }, { startTime: 'asc' }],
    include: {
      user: { select: { fullName: true, company: true, email: true } },
    },
  });

  const monthName = month ? new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long' }) : 'All Time';

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  // Header Banner
  doc.setFillColor(15, 23, 42); // #0f172a
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 60, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(6, 182, 212); // #06b6d4
  doc.text('Booking Meeting', 40, 36);

  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(`Monthly Meeting Room Report — ${monthName} ${year || ''}`, 200, 36);

  // Summary Metrics Banner
  const totalCount = bookings.length;
  const confirmedCount = bookings.filter((b) => b.status === 'CONFIRMED').length;
  const rescheduledCount = bookings.filter((b) => b.status === 'RESCHEDULED').length;
  const cancelledCount = bookings.filter((b) => b.status === 'CANCELLED').length;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`Generated: ${new Date().toLocaleString()}  |  Total: ${totalCount}  |  Confirmed: ${confirmedCount}  |  Rescheduled: ${rescheduledCount}  |  Cancelled: ${cancelledCount}`, 40, 82);

  // Table Data
  const tableRows = bookings.map((b) => [
    b.bookingDate,
    `${b.startTime} – ${b.endTime}`,
    b.user?.fullName || 'N/A',
    b.user?.company || 'N/A',
    b.topic,
    b.status,
  ]);

  doc.autoTable({
    startY: 96,
    head: [['Date', 'Time Slot', 'Client', 'Company', 'Meeting Topic', 'Status']],
    body: tableRows,
    margin: { left: 40, right: 40 },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 6,
      textColor: [15, 23, 42],
    },
    headStyles: {
      fillColor: [8, 145, 178], // Cyan-600
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didParseCell: function (data) {
      if (data.column.index === 5 && data.section === 'body') {
        const val = data.cell.raw;
        if (val === 'CONFIRMED') {
          data.cell.styles.textColor = [5, 150, 105];
          data.cell.styles.fontStyle = 'bold';
        } else if (val === 'RESCHEDULED') {
          data.cell.styles.textColor = [217, 119, 6];
          data.cell.styles.fontStyle = 'bold';
        } else if (val === 'CANCELLED') {
          data.cell.styles.textColor = [225, 29, 72];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  return Buffer.from(doc.output('arraybuffer'));
}

/**
 * Generate Excel workbook buffer for User Management.
 * NEVER includes password hashes or reset tokens!
 */
async function exportUsersExcel() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      fullName: true,
      email: true,
      company: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Booking Meeting System';
  const worksheet = workbook.addWorksheet('User Directory');

  // Title
  worksheet.mergeCells('A1:F1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'Booking Meeting — User Management Directory';
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF7C3AED' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 30;

  worksheet.mergeCells('A2:F2');
  const metaCell = worksheet.getCell('A2');
  metaCell.value = `Exported on ${new Date().toLocaleString()} | Total Users: ${users.length}`;
  metaCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };
  metaCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(2).height = 20;

  worksheet.addRow([]);

  // Headers
  const headerRow = worksheet.addRow([
    'Full Name',
    'Email Address',
    'Company / Department',
    'Role',
    'Status',
    'Joined Date',
  ]);

  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E1B4B' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });

  users.forEach((u) => {
    const row = worksheet.addRow([
      u.fullName,
      u.email,
      u.company,
      u.role,
      u.isActive ? 'Active' : 'Inactive',
      new Date(u.createdAt).toLocaleDateString(),
    ]);

    row.height = 20;
    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Arial', size: 10 };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };

      if (colNumber === 5) {
        cell.font = { color: u.isActive ? { argb: 'FF059669' } : { argb: 'FF94A3B8' }, bold: true };
      }
    });
  });

  worksheet.columns.forEach((column) => {
    let maxLength = 14;
    column.eachCell({ includeEmpty: false }, (cell) => {
      const length = cell.value ? String(cell.value).length : 0;
      if (length > maxLength) maxLength = Math.min(length + 2, 40);
    });
    column.width = maxLength;
  });

  return await workbook.xlsx.writeBuffer();
}

/**
 * Generate PDF buffer for User Management.
 * NEVER includes password hashes or reset tokens!
 */
async function exportUsersPdf() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      fullName: true,
      email: true,
      company: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  // Header Banner
  doc.setFillColor(30, 27, 75); // Dark Indigo
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 55, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(139, 92, 246); // Violet
  doc.text('Booking Meeting', 30, 34);

  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text('User Management Directory', 170, 34);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`Generated on ${new Date().toLocaleString()}  |  Total Accounts: ${users.length}`, 30, 75);

  const tableRows = users.map((u) => [
    u.fullName,
    u.email,
    u.company,
    u.role,
    u.isActive ? 'Active' : 'Inactive',
    new Date(u.createdAt).toLocaleDateString(),
  ]);

  doc.autoTable({
    startY: 88,
    head: [['Full Name', 'Email', 'Company', 'Role', 'Status', 'Joined Date']],
    body: tableRows,
    margin: { left: 30, right: 30 },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 6,
      textColor: [15, 23, 42],
    },
    headStyles: {
      fillColor: [124, 58, 237], // Violet-600
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didParseCell: function (data) {
      if (data.column.index === 4 && data.section === 'body') {
        const val = data.cell.raw;
        data.cell.styles.textColor = val === 'Active' ? [5, 150, 105] : [148, 163, 184];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  return Buffer.from(doc.output('arraybuffer'));
}

module.exports = {
  exportBookingsExcel,
  exportBookingsPdf,
  exportUsersExcel,
  exportUsersPdf,
};
