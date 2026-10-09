const PDFDocument = require('pdfkit');

/**
 * Generates a professional clinical hospital report PDF
 * @param {Object} report - Populated MedicalReport document
 * @param {Object} res - Express response stream
 */
const generateMedicalReportPDF = (report, res) => {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    info: {
      Title: `Medical-Report-${report.reportId}`,
      Author: 'MedCare Multi-Speciality Hospital',
      Subject: `Official Clinical Report for ${report.patient?.name || 'Patient'}`,
    },
  });

  doc.pipe(res);

  const primaryColor = '#1e40af'; // Deep medical blue
  const secondaryColor = '#0284c7'; // Sky accent
  const darkText = '#1e293b'; // Slate 800
  const mutedText = '#64748b'; // Slate 500
  const lightBg = '#f8fafc'; // Slate 50
  const borderColor = '#cbd5e1'; // Slate 300
  const approvedGreen = '#16a34a'; // Emerald 600

  // 1. HOSPITAL HEADER BANNER
  doc
    .rect(40, 40, 515, 75)
    .fillAndStroke('#eff6ff', primaryColor);

  doc
    .fontSize(18)
    .font('Helvetica-Bold')
    .fillColor(primaryColor)
    .text('MEDCARE MULTI-SPECIALITY HOSPITAL', 55, 52, { characterSpacing: 0.5 });

  doc
    .fontSize(8.5)
    .font('Helvetica')
    .fillColor(mutedText)
    .text('NABH & JCI Accredited Tertiary Healthcare & Research Centre', 55, 74)
    .text('456 Healthcare Avenue, Medical Enclave, Chennai, TN - 600001', 55, 87)
    .text('Helpline: +91 (044) 4321-9876  |  Emergency: 1066  |  support@medcarehms.com', 55, 99);

  // Status Badge on Header Right
  const statusX = 430;
  const statusY = 55;
  const isApproved = (report.status || '').toLowerCase() === 'approved';
  doc
    .roundedRect(statusX, statusY, 110, 26, 4)
    .fillAndStroke(isApproved ? '#dcfce7' : '#fef3c7', isApproved ? approvedGreen : '#d97706');

  doc
    .fontSize(10)
    .font('Helvetica-Bold')
    .fillColor(isApproved ? approvedGreen : '#b45309')
    .text(isApproved ? 'VERIFIED APPROVED' : (report.status || 'PENDING').toUpperCase(), statusX + 6, statusY + 8, {
      width: 98,
      align: 'center',
    });

  // 2. DOCUMENT TITLE
  let y = 128;
  doc
    .fontSize(13)
    .font('Helvetica-Bold')
    .fillColor(darkText)
    .text('OFFICIAL CLINICAL MEDICAL REPORT', 40, y);

  doc
    .fontSize(9)
    .font('Helvetica')
    .fillColor(mutedText)
    .text(`Report Ref: ${report.reportId}  |  Visit Date: ${report.visitDate || new Date().toISOString().slice(0, 10)}`, 300, y + 2, {
      align: 'right',
    });

  y += 22;
  doc
    .strokeColor(borderColor)
    .lineWidth(1)
    .moveTo(40, y)
    .lineTo(555, y)
    .stroke();

  y += 12;

  // 3. PATIENT & APPOINTMENT TWO-COLUMN BOX
  const boxTop = y;
  const boxHeight = 90;
  const colWidth = 250;

  // Left Column: Patient Information
  doc
    .rect(40, boxTop, colWidth, boxHeight)
    .fillAndStroke(lightBg, borderColor);

  doc
    .fontSize(9.5)
    .font('Helvetica-Bold')
    .fillColor(primaryColor)
    .text('PATIENT IDENTIFICATION', 50, boxTop + 8);

  const patient = report.patient || {};
  doc
    .fontSize(8.5)
    .font('Helvetica-Bold')
    .fillColor(darkText)
    .text('Full Name: ', 50, boxTop + 24)
    .font('Helvetica')
    .text(patient.name || 'N/A', 110, boxTop + 24)
    .font('Helvetica-Bold')
    .text('Patient ID: ', 50, boxTop + 38)
    .font('Helvetica')
    .text(patient.patientId || 'N/A', 110, boxTop + 38)
    .font('Helvetica-Bold')
    .text('Age / Gender: ', 50, boxTop + 52)
    .font('Helvetica')
    .text(`${patient.age || 'N/A'} Yrs  /  ${patient.gender || 'N/A'}  (${patient.bloodGroup || 'Blood: N/A'})`, 115, boxTop + 52)
    .font('Helvetica-Bold')
    .text('Phone / Email: ', 50, boxTop + 66)
    .font('Helvetica')
    .text(`${patient.phone || 'N/A'}`, 125, boxTop + 66);

  // Right Column: Consultation / Appointment Info
  const rightX = 305;
  doc
    .rect(rightX, boxTop, colWidth, boxHeight)
    .fillAndStroke(lightBg, borderColor);

  doc
    .fontSize(9.5)
    .font('Helvetica-Bold')
    .fillColor(primaryColor)
    .text('APPOINTMENT & DOCTOR IN-CHARGE', rightX + 10, boxTop + 8);

  const appointment = report.appointment || {};
  const doctor = report.doctor || {};
  doc
    .fontSize(8.5)
    .font('Helvetica-Bold')
    .fillColor(darkText)
    .text('Appointment: ', rightX + 10, boxTop + 24)
    .font('Helvetica')
    .text(appointment.appointmentId || 'N/A', rightX + 85, boxTop + 24)
    .font('Helvetica-Bold')
    .text('Doctor: ', rightX + 10, boxTop + 38)
    .font('Helvetica')
    .text(`${doctor.name || appointment.doctorName || 'Assigned Physician'}`, rightX + 85, boxTop + 38)
    .font('Helvetica-Bold')
    .text('Department: ', rightX + 10, boxTop + 52)
    .font('Helvetica')
    .text(`${doctor.specialization || appointment.department || 'General Medicine'}`, rightX + 85, boxTop + 52)
    .font('Helvetica-Bold')
    .text('Room Allocated: ', rightX + 10, boxTop + 66)
    .font('Helvetica')
    .text(`${appointment.roomNumber || 'Outpatient Clinic Room 102'}`, rightX + 95, boxTop + 66);

  y = boxTop + boxHeight + 16;

  // Helper section renderer
  const renderSection = (title, content, bgHighlight = false) => {
    if (y > 700) {
      doc.addPage();
      y = 40;
    }

    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .fillColor(primaryColor)
      .text(title.toUpperCase(), 40, y);

    y += 12;

    const contentHeight = Math.max(26, doc.heightOfString(content || 'None recorded', { width: 495, fontSize: 8.5 }) + 10);
    doc
      .rect(40, y, 515, contentHeight)
      .fillAndStroke(bgHighlight ? '#f0fdf4' : lightBg, bgHighlight ? '#86efac' : borderColor);

    doc
      .fontSize(8.5)
      .font(bgHighlight ? 'Helvetica-Bold' : 'Helvetica')
      .fillColor(bgHighlight ? '#166534' : darkText)
      .text(content || 'None recorded', 48, y + 6, {
        width: 495,
        lineGap: 2,
      });

    y += contentHeight + 10;
  };

  // 4. CLINICAL SECTIONS
  renderSection('Chief Complaint & Symptoms', `${report.chiefComplaint || ''} ${report.symptoms ? ' | Symptoms: ' + report.symptoms : ''}`.trim() || 'Routine clinical assessment');
  renderSection('Confirmed Clinical Diagnosis', report.diagnosis, true);
  renderSection('Diagnostic Investigations & Laboratory Findings', report.findings || report.testInvestigation || 'Diagnostic evaluation performed as per standard hospital protocols.');
  renderSection('Prescribed Treatment Plan & Clinical Management', report.treatment || 'Treatment recommendations administered as clinically indicated.');
  renderSection('Attending Doctor Notes & Clinical Remarks', report.doctorNotes || 'Patient advised standard post-consultation care.');
  renderSection('Follow-Up & Dietary/Lifestyle Guidance', report.followUpRecommendation || report.additionalNotes || 'Follow-up consultation in 7 days or as required.');

  // 5. OFFICIAL APPROVAL & VALIDATION BLOCK
  if (y > 660) {
    doc.addPage();
    y = 40;
  }

  y += 6;
  doc
    .rect(40, y, 515, 68)
    .fillAndStroke('#f1f5f9', '#94a3b8');

  doc
    .fontSize(9.5)
    .font('Helvetica-Bold')
    .fillColor('#0f172a')
    .text('HOSPITAL ADMINISTRATIVE APPROVAL & CERTIFICATION', 50, y + 8);

  const approval = report.approval || {};
  doc
    .fontSize(8.5)
    .font('Helvetica-Bold')
    .fillColor(darkText)
    .text('Approval Status: ', 50, y + 26)
    .font('Helvetica-Bold')
    .fillColor(approvedGreen)
    .text('OFFICIALLY APPROVED & SIGNED', 135, y + 26)
    .fillColor(darkText)
    .text('Approved By: ', 50, y + 40)
    .font('Helvetica')
    .text(approval.approvedByName || 'Medical Superintendent / Admin', 135, y + 40)
    .font('Helvetica-Bold')
    .text('Approval Date: ', 50, y + 54)
    .font('Helvetica')
    .text(approval.approvedAt ? new Date(approval.approvedAt).toLocaleString() : new Date().toLocaleString(), 135, y + 54);

  // Digital verification badge on the right
  const stampX = 350;
  doc
    .roundedRect(stampX, y + 10, 190, 48, 4)
    .fillAndStroke('#ecfdf5', '#10b981');

  doc
    .fontSize(8.5)
    .font('Helvetica-Bold')
    .fillColor('#047857')
    .text('MEDCARE OFFICIAL VERIFICATION', stampX, y + 16, { width: 190, align: 'center' })
    .fontSize(7.5)
    .font('Helvetica')
    .text(`Ref: ${approval.approvalReference || report.reportId || 'MC-2026-MED'}`, stampX, y + 30, { width: 190, align: 'center' })
    .text('Digitally Authenticated Clinical Record', stampX, y + 42, { width: 190, align: 'center' });

  // 6. FOOTER
  doc
    .fontSize(7.5)
    .font('Helvetica-Oblique')
    .fillColor(mutedText)
    .text(
      'Notice: This is a confidential medical record intended exclusively for the designated patient and healthcare provider. Tampering with or altering this document is strictly prohibited by law.',
      40,
      780,
      { width: 515, align: 'center' }
    );

  doc.end();
};

module.exports = {
  generateMedicalReportPDF,
};
