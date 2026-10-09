const MedicalReport = require('../models/MedicalReport');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');
const MedicineRequest = require('../models/MedicineRequest');
const Medicine = require('../models/Medicine');
const { generateMedicalReportPDF } = require('../utils/pdfGenerator');
const { createNotification } = require('../utils/notificationHelper');
const { getNextMedicalReportId } = require('../utils/idGenerator');

// Helper to find report by Mongo _id or reportId
const findReportRecord = async (id) => {
  let report;
  if (id.match(/^[0-9a-fA-F]{24}$/)) {
    report = await MedicalReport.findById(id);
  } else {
    report = await MedicalReport.findOne({ reportId: id });
  }
  if (!report) return null;
  return await report.populate([
    { path: 'patient' },
    { path: 'doctor' },
    { path: 'appointment' },
    {
      path: 'medicineRequest',
      populate: { path: 'medicines.medicine' },
    },
  ]);
};

// @desc    Get all medical reports (with role isolation)
// @route   GET /api/medical-reports
// @access  Private (Admin sees all; Doctor sees own; Patient sees own approved)
const getMedicalReports = async (req, res, next) => {
  try {
    const { status, patientId, search } = req.query;
    const query = {};

    // Patient isolation: Patients can see their own reports (both approved and doctor-issued)
    if (req.user && req.user.role === 'patient') {
      const patient = await Patient.findOne({
        $or: [{ user: req.user.id }, { email: req.user.email }],
      });

      const patientConditions = [
        { patientUser: req.user.id },
      ];
      if (patient) {
        patientConditions.push({ patient: patient._id });
        const apts = await Appointment.find({
          $or: [{ patient: patient._id }, { patientUser: req.user.id }, { patientName: patient.name }],
        }).select('_id');
        if (apts.length > 0) {
          patientConditions.push({ appointment: { $in: apts.map((a) => a._id) } });
        }
      }

      query.$or = patientConditions;
      // Patients can see their non-draft clinical reports directly
      query.status = { $ne: 'draft' };
    }

    // Doctor isolation
    if (req.user && req.user.role === 'doctor') {
      const doctor = await Doctor.findOne({
        $or: [{ user: req.user.id }, { email: req.user.email }],
      });
      if (doctor) {
        query.$or = [{ doctor: doctor._id }, { doctorUser: req.user.id }];
      }
    }

    // Admin filtering
    if (req.user && req.user.role === 'admin') {
      query.deletedFromAdmin = { $ne: true };
    }

    if (status && req.user.role !== 'patient') {
      query.status = status;
    }

    if (patientId) {
      query.patient = patientId;
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { reportId: searchRegex },
        { diagnosis: searchRegex },
        { symptoms: searchRegex },
        { treatment: searchRegex },
      ];
    }

    const reports = await MedicalReport.find(query)
      .populate('patient')
      .populate('doctor')
      .populate('appointment')
      .populate({
        path: 'medicineRequest',
        populate: { path: 'medicines.medicine' },
      })
      .sort({ createdAt: -1 });

    // Link and sync any existing MedicineRequest records
    const reportIds = reports.map((r) => r._id);
    const linkedMedReqs = await MedicineRequest.find({ report: { $in: reportIds } })
      .populate('medicines.medicine')
      .sort({ createdAt: -1 });

    const reqsByReport = {};
    linkedMedReqs.forEach((mReq) => {
      const repKey = mReq.report ? mReq.report.toString() : null;
      if (repKey && !reqsByReport[repKey]) {
        reqsByReport[repKey] = mReq;
      }
    });

    const enrichedReports = reports.map((rep) => {
      const repObj = rep.toObject ? rep.toObject() : { ...rep };
      const linkedReq = reqsByReport[rep._id.toString()];
      if (linkedReq) {
        if (!repObj.medicineRequest) {
          repObj.medicineRequest = linkedReq;
        }
        const mappedStatus =
          linkedReq.status === 'pending_approval' ? 'pending' : linkedReq.status;
        if (!repObj.medicineStatus || repObj.medicineStatus === 'none' || repObj.medicineStatus !== mappedStatus) {
          repObj.medicineStatus = mappedStatus;
          // Background sync to DB
          MedicalReport.updateOne(
            { _id: rep._id },
            {
              medicineStatus: mappedStatus,
              medicineRequest: linkedReq._id,
              medicineApproval: linkedReq.approval,
            }
          ).catch((e) => console.error('Error syncing report medicine status:', e));
        }
        if (!repObj.medicineApproval && linkedReq.approval) {
          repObj.medicineApproval = linkedReq.approval;
        }
      }
      return repObj;
    });

    res.status(200).json({
      success: true,
      count: enrichedReports.length,
      data: enrichedReports,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single medical report by ID
// @route   GET /api/medical-reports/:id
// @access  Private
const getMedicalReportById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const report = await findReportRecord(id);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: `Medical report not found with ID ${id}`,
      });
    }

    // Security & Ownership check for Patient
    if (req.user && req.user.role === 'patient') {
      const patient = await Patient.findOne({
        $or: [{ user: req.user.id }, { email: req.user.email }],
      });

      const isOwner =
        (patient && report.patient && report.patient._id.toString() === patient._id.toString()) ||
        (report.patientUser && report.patientUser.toString() === req.user.id);

      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized: You cannot access another patient’s medical report.',
        });
      }

      if (report.status !== 'approved') {
        return res.status(403).json({
          success: false,
          message: 'This report is currently pending administrative approval and is not yet available.',
        });
      }
    }

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new medical report (Doctor or Admin)
// @route   POST /api/medical-reports
// @access  Private (Doctor / Admin)
const createMedicalReport = async (req, res, next) => {
  try {
    const {
      patient,
      appointment,
      doctor,
      visitDate,
      symptoms,
      chiefComplaint,
      diagnosis,
      testInvestigation,
      findings,
      treatment,
      doctorNotes,
      followUpRecommendation,
      additionalNotes,
      status: requestedStatus,
    } = req.body;

    if (!diagnosis) {
      return res.status(400).json({
        success: false,
        message: 'Clinical diagnosis is required',
      });
    }

    if (!appointment) {
      return res.status(400).json({
        success: false,
        message: 'Appointment reference is required to create a report',
      });
    }

    // Validate Appointment
    const apt = await Appointment.findById(appointment).populate('patient').populate('doctor');
    if (!apt) {
      return res.status(404).json({
        success: false,
        message: 'Valid appointment record not found for this report',
      });
    }

    let resolvedPatient = patient || (apt.patient ? (apt.patient._id || apt.patient) : null);
    if (!resolvedPatient) {
      const foundPat = await Patient.findOne({ name: apt.patientName });
      if (foundPat) {
        resolvedPatient = foundPat._id;
      } else {
        const anyPat = await Patient.findOne();
        if (anyPat) resolvedPatient = anyPat._id;
      }
    }
    if (!resolvedPatient) {
      return res.status(400).json({
        success: false,
        message: 'Patient reference could not be resolved for this report',
      });
    }

    // Resolve Doctor
    let doctorRef = doctor;
    let doctorUserRef = null;
    if (req.user && req.user.role === 'doctor') {
      doctorUserRef = req.user.id;
      const doc = await Doctor.findOne({
        $or: [{ user: req.user.id }, { email: req.user.email }],
      });
      if (doc) doctorRef = doc._id;
    } else if (!doctorRef && apt.doctor) {
      doctorRef = apt.doctor._id || apt.doctor;
    }

    if (!doctorRef) {
      const fallbackDoc = await Doctor.findOne();
      if (fallbackDoc) doctorRef = fallbackDoc._id;
    }

    // Status: Clinical report is delivered directly to patient by default (like prescriptions)
    let finalStatus = 'approved';
    if (requestedStatus === 'draft' || req.body.status === 'draft') {
      finalStatus = 'draft';
    } else if (
      requestedStatus === 'pending_approval' ||
      req.body.status === 'pending_approval'
    ) {
      finalStatus = 'pending_approval';
    }

    // Auto generate collision-proof reportId
    const reportId = await getNextMedicalReportId();

    const approvalData = finalStatus === 'approved' ? {
      isApproved: true,
      approvedBy: req.user ? req.user.id : null,
      approvedByName: req.user ? req.user.name : (apt.doctorName || 'Attending Physician'),
      approvedAt: new Date(),
      approvalReference: `MC-REP-${Date.now().toString().slice(-6)}`,
      approvalNotes: `Clinical report issued directly to patient by attending physician`,
    } : {
      isApproved: false,
    };

    const report = await MedicalReport.create({
      reportId,
      patient: resolvedPatient,
      patientUser: apt.patientUser || null,
      doctor: doctorRef,
      doctorUser: doctorUserRef,
      appointment: apt._id,
      visitDate: visitDate || apt.date || new Date().toISOString().slice(0, 10),
      symptoms: symptoms || '',
      chiefComplaint: chiefComplaint || '',
      diagnosis,
      testInvestigation: testInvestigation || '',
      findings: findings || '',
      treatment: treatment || '',
      doctorNotes: doctorNotes || '',
      followUpRecommendation: followUpRecommendation || '',
      additionalNotes: additionalNotes || '',
      status: finalStatus,
      isApproved: finalStatus === 'approved',
      approval: approvalData,
    });

    if (finalStatus === 'pending_approval') {
      await createNotification({
        recipientRole: 'admin',
        type: 'report_submitted',
        title: 'New Clinical Report Pending Approval',
        message: `Dr. ${apt.doctorName || 'Doctor'} submitted clinical report ${report.reportId} for patient ${apt.patientName || 'Patient'}. Review and approve in Report Approvals.`,
        relatedEntity: 'MedicalReport',
        relatedEntityId: report.reportId,
      });
    } else if (finalStatus === 'approved') {
      // 1. Notify Patient directly
      const patientRecipient = apt.patientUser || (apt.patient ? apt.patient.user : null);
      if (patientRecipient) {
        await createNotification({
          recipient: patientRecipient,
          recipientRole: 'patient',
          type: 'report_approved',
          title: 'New Clinical Report Available',
          message: `Dr. ${apt.doctorName || 'Doctor'} has issued your clinical report (${report.reportId}). You can view and download your certified report.`,
          link: '/myReports',
          relatedEntity: 'MedicalReport',
          relatedEntityId: report.reportId,
        });
      }

      // 2. Notify Admin for hospital monitoring
      await createNotification({
        recipientRole: 'admin',
        type: 'report_issued',
        title: `Clinical Report Issued (${report.reportId})`,
        message: `Dr. ${apt.doctorName || 'Doctor'} issued clinical report ${report.reportId} for patient ${apt.patientName || 'Patient'}. Sent directly to patient.`,
        link: '/report-approvals',
        relatedEntity: 'MedicalReport',
        relatedEntityId: report.reportId,
      });
    }

    const populated = await findReportRecord(report._id.toString());

    res.status(201).json({
      success: true,
      message:
        finalStatus === 'approved'
          ? 'Medical report issued successfully and sent directly to patient.'
          : finalStatus === 'pending_approval'
          ? 'Medical report submitted for administrative approval.'
          : 'Medical report saved as draft.',
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Submit Draft Report for Admin Approval
// @route   POST /api/medical-reports/:id/submit
// @access  Private (Doctor / Admin)
const submitMedicalReport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const report = await findReportRecord(id);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: `Medical report not found with ID ${id}`,
      });
    }

    if (report.status === 'approved') {
      return res.status(400).json({
        success: false,
        message: 'This report has already been approved and issued.',
      });
    }

    const targetStatus = (req.body && req.body.status === 'approved')
      ? 'approved'
      : 'pending_approval';

    report.status = targetStatus;
    report.isApproved = (targetStatus === 'approved');
    report.approval = {
      isApproved: (targetStatus === 'approved'),
      approvedBy: req.user ? req.user._id : null,
      approvedByName: req.user ? req.user.name : (report.doctor?.name || 'Attending Physician'),
      approvedAt: new Date(),
      approvalReference: `MC-REP-${Date.now().toString().slice(-6)}`,
      approvalNotes: targetStatus === 'approved'
        ? 'Clinical report issued directly to patient by attending physician'
        : 'Submitted for administrative approval',
      submittedAt: new Date(),
    };
    await report.save();

    if (targetStatus === 'approved') {
      // 1. Notify Patient directly
      const patientRecipient = report.patientUser || (report.patient && report.patient.user);
      if (patientRecipient) {
        await createNotification({
          recipient: patientRecipient,
          recipientRole: 'patient',
          type: 'report_approved',
          title: 'New Clinical Report Available',
          message: `Dr. ${report.doctor?.name || 'Doctor'} has issued your clinical report (${report.reportId}). You can view and download your certified report.`,
          link: '/myReports',
          relatedEntity: 'MedicalReport',
          relatedEntityId: report.reportId,
        });
      }

      // 2. Notify Admin for hospital monitoring
      await createNotification({
        recipientRole: 'admin',
        type: 'report_issued',
        title: `Clinical Report Issued (${report.reportId})`,
        message: `Dr. ${report.doctor?.name || 'Doctor'} issued clinical report ${report.reportId} for patient ${report.patient?.name || 'Patient'}. Sent directly to patient.`,
        link: '/report-approvals',
        relatedEntity: 'MedicalReport',
        relatedEntityId: report.reportId,
      });
    } else {
      // Notify Admin for approval
      await createNotification({
        recipientRole: 'admin',
        type: 'report_submitted',
        title: 'Clinical Report Submitted for Approval',
        message: `Clinical report ${report.reportId} was submitted by doctor for administrative approval.`,
        relatedEntity: 'MedicalReport',
        relatedEntityId: report.reportId,
      });
    }

    res.status(200).json({
      success: true,
      message: targetStatus === 'approved'
        ? 'Medical report issued successfully and sent directly to patient.'
        : 'Medical report submitted for administrative approval',
      data: report,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update Medical Report / Edit Rejected Report
// @route   PUT /api/medical-reports/:id
// @access  Private (Doctor / Admin)
const updateMedicalReport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const report = await findReportRecord(id);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: `Medical report not found with ID ${id}`,
      });
    }

    // Rule: Doctor cannot modify an approved report silently
    if (report.status === 'approved' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Approved medical reports cannot be modified directly.',
      });
    }

    // If report was rejected and doctor is updating, record revision and advance to pending_approval
    if (report.status === 'rejected') {
      report.revisions.push({
        revisionNumber: report.revisions.length + 1,
        revisedAt: new Date(),
        revisedBy: req.user._id,
        diagnosis: req.body.diagnosis || report.diagnosis,
        treatment: req.body.treatment || report.treatment,
        doctorNotes: req.body.doctorNotes || report.doctorNotes,
        findings: req.body.findings || report.findings,
        comments: req.body.revisionComment || 'Resubmitted after addressing admin feedback.',
      });
      report.status = 'pending_approval';
    }

    // Apply updates
    const allowedFields = [
      'symptoms',
      'chiefComplaint',
      'diagnosis',
      'testInvestigation',
      'findings',
      'treatment',
      'doctorNotes',
      'followUpRecommendation',
      'additionalNotes',
      'visitDate',
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        report[field] = req.body[field];
      }
    });

    if (req.body.submitForApproval) {
      report.status = 'pending_approval';
    }

    await report.save();

    // If transitioned to pending_approval, alert admin
    if (report.status === 'pending_approval') {
      await createNotification({
        recipientRole: 'admin',
        type: 'report_submitted',
        title: 'Corrected Report Resubmitted',
        message: `Report ${report.reportId} resubmitted for admin review.`,
        relatedEntity: 'MedicalReport',
        relatedEntityId: report.reportId,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Medical report updated successfully',
      data: report,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin Approve Medical Report
// @route   PATCH /api/medical-reports/:id/approve
// @access  Private (Admin only)
const approveMedicalReport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const report = await findReportRecord(id);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: `Medical report not found with ID ${id}`,
      });
    }

    // Rule 4: Doctor CANNOT approve their own report
    if (
      report.doctorUser &&
      report.doctorUser.toString() === req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: 'Security policy violation: Doctors cannot approve their own clinical reports.',
      });
    }

    if (report.status === 'approved') {
      return res.status(400).json({
        success: false,
        message: 'This report is already approved.',
      });
    }

    const approvalRef = `MC-APP-${Date.now().toString().slice(-6)}`;

    report.status = 'approved';
    report.isApproved = true;
    report.approval = {
      isApproved: true,
      approvedBy: req.user._id,
      approvedByName: req.user.name,
      approvedAt: new Date(),
      approvalReference: approvalRef,
      rejectedBy: null,
      rejectedByName: null,
      rejectedAt: null,
      rejectionReason: null,
    };

    await report.save();

    // 1. Notify Attending Doctor
    if (report.doctorUser) {
      await createNotification({
        recipient: report.doctorUser,
        recipientRole: 'doctor',
        type: 'report_approved',
        title: 'Medical Report Approved',
        message: `Clinical Report ${report.reportId} for patient ${report.patient?.name || 'Patient'} has been officially approved.`,
        relatedEntity: 'MedicalReport',
        relatedEntityId: report.reportId,
      });
    }

    // 2. Notify Patient
    if (report.patientUser || (report.patient && report.patient.user)) {
      const patientUserId = report.patientUser || report.patient.user;
      await createNotification({
        recipient: patientUserId,
        recipientRole: 'patient',
        type: 'report_approved',
        title: 'Official Medical Report Available',
        message: `Your medical report ${report.reportId} is approved. You can now view, download the certified PDF, and request medications.`,
        relatedEntity: 'MedicalReport',
        relatedEntityId: report.reportId,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Medical report successfully approved and certified.',
      data: report,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin Reject Medical Report
// @route   PATCH /api/medical-reports/:id/reject
// @access  Private (Admin only)
const rejectMedicalReport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rejectionReason, reason } = req.body;
    const report = await findReportRecord(id);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: `Medical report not found with ID ${id}`,
      });
    }

    const finalReason =
      rejectionReason || reason || 'Please provide complete diagnostic test findings and clinical notes.';

    report.status = 'rejected';
    report.isApproved = false;
    report.approval = {
      ...report.approval,
      isApproved: false,
      rejectedBy: req.user._id,
      rejectedByName: req.user.name,
      rejectedAt: new Date(),
      rejectionReason: finalReason,
    };

    await report.save();

    // Notify Doctor of rejection and reason
    if (report.doctorUser) {
      await createNotification({
        recipient: report.doctorUser,
        recipientRole: 'doctor',
        type: 'report_rejected',
        title: 'Medical Report Returned / Rejected',
        message: `Report ${report.reportId} was returned by administration. Reason: ${finalReason}`,
        relatedEntity: 'MedicalReport',
        relatedEntityId: report.reportId,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Medical report rejected. Returned to doctor for correction.',
      data: report,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Generate and Stream Official Hospital PDF (Only for APPROVED reports)
// @route   GET /api/medical-reports/:id/pdf
// @access  Private (Admin, Doctor, or Patient Owner)
const generateReportPdf = async (req, res, next) => {
  try {
    const { id } = req.params;
    const report = await findReportRecord(id);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: `Medical report not found with ID ${id}`,
      });
    }

    // Rule 11 & 12: ONLY approved reports can generate official PDFs!
    if (report.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: `Cannot generate official PDF: Report status is '${report.status}'. Only reports approved by hospital administration can be issued as official documents.`,
      });
    }

    // Role security check: Patients can only download THEIR OWN reports
    if (req.user && req.user.role === 'patient') {
      const patient = await Patient.findOne({
        $or: [{ user: req.user.id }, { email: req.user.email }],
      });

      const isOwner =
        (patient && report.patient && report.patient._id.toString() === patient._id.toString()) ||
        (report.patientUser && report.patientUser.toString() === req.user.id);

      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: 'Security Alert: You are not authorized to download this patient medical report.',
        });
      }
    }

    // Set PDF response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="Medical-Report-${report.reportId}.pdf"`
    );

    generateMedicalReportPDF(report, res);
  } catch (error) {
    next(error);
  }
};

// @desc    Delete medical report
// @route   DELETE /api/medical-reports/:id
// @access  Private (Admin only)
const deleteMedicalReport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const report = await findReportRecord(id);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: `Medical report not found with ID ${id}`,
      });
    }

    if (req.query.permanent === 'true') {
      await MedicalReport.findByIdAndDelete(report._id);
    } else {
      report.deletedFromAdmin = true;
      await report.save();
    }

    res.status(200).json({
      success: true,
      message: 'Medical report removed from admin page successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMedicalReports,
  getMedicalReportById,
  createMedicalReport,
  submitMedicalReport,
  updateMedicalReport,
  approveMedicalReport,
  rejectMedicalReport,
  generateReportPdf,
  deleteMedicalReport,
};
