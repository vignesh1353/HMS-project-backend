const MedicineRequest = require('../models/MedicineRequest');
const MedicalReport = require('../models/MedicalReport');
const Medicine = require('../models/Medicine');
const Patient = require('../models/Patient');
const Prescription = require('../models/Prescription');
const { createNotification } = require('../utils/notificationHelper');
const { getNextMedicineRequestId } = require('../utils/idGenerator');

// Helper to find request by Mongo _id or requestId
const findRequestRecord = async (id) => {
  let reqDoc;
  if (id.match(/^[0-9a-fA-F]{24}$/)) {
    reqDoc = await MedicineRequest.findById(id);
  } else {
    reqDoc = await MedicineRequest.findOne({ requestId: id });
  }
  if (!reqDoc) return null;
  return await reqDoc.populate([
    { path: 'patient' },
    { path: 'doctor' },
    { path: 'appointment' },
    { path: 'report' },
    { path: 'prescription' },
    { path: 'medicines.medicine' },
  ]);
};

// @desc    Get medicine requests (Patient sees own; Admin sees all)
// @route   GET /api/medicine-requests
// @access  Private
const getMedicineRequests = async (req, res, next) => {
  try {
    const { status, search } = req.query;
    const query = {};

    // Patient isolation
    if (req.user && req.user.role === 'patient') {
      const patient = await Patient.findOne({
        $or: [{ user: req.user.id }, { email: req.user.email }],
      });

      const patientConditions = [{ patientUser: req.user.id }];
      if (patient) {
        patientConditions.push({ patient: patient._id });
        if (patient.patientId) {
          patientConditions.push({ patientId: patient.patientId });
          patientConditions.push({ patientReferenceNumber: patient.patientId });
        }
      }
      query.$or = patientConditions;
    }

    if (status && status !== 'All') {
      query.status = status;
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const searchConditions = [
        { requestId: searchRegex },
        { patientId: searchRegex },
        { patientReferenceNumber: searchRegex },
        { patientName: searchRegex },
        { 'medicines.medicineName': searchRegex },
        { reason: searchRegex },
      ];

      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchConditions }];
        delete query.$or;
      } else {
        query.$or = searchConditions;
      }
    }

    const requests = await MedicineRequest.find(query)
      .populate('patient')
      .populate('doctor')
      .populate('appointment')
      .populate('report')
      .populate('prescription')
      .populate('medicines.medicine')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: requests.length,
      data: requests,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single medicine request by ID
// @route   GET /api/medicine-requests/:id
// @access  Private
const getMedicineRequestById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const reqDoc = await findRequestRecord(id);

    if (!reqDoc) {
      return res.status(404).json({
        success: false,
        message: `Medicine request not found with ID ${id}`,
      });
    }

    // Role security check
    if (req.user && req.user.role === 'patient') {
      const patient = await Patient.findOne({
        $or: [{ user: req.user.id }, { email: req.user.email }],
      });

      const isOwner =
        (patient && reqDoc.patient && reqDoc.patient._id.toString() === patient._id.toString()) ||
        (reqDoc.patientUser && reqDoc.patientUser.toString() === req.user.id);

      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized: You can only view your own medicine requests.',
        });
      }
    }

    res.status(200).json({
      success: true,
      data: reqDoc,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create / Submit Medicine Request (strictly based on Approved Medical Report)
// @route   POST /api/medicine-requests
// @access  Private (Patient, Doctor, or Admin)
const createMedicineRequest = async (req, res, next) => {
  try {
    const {
      reportId,
      medicines,
      reason,
      additionalNotes,
      patientId,
      patientReferenceNumber,
    } = req.body;

    if (!reportId) {
      return res.status(400).json({
        success: false,
        message: 'A valid Medical Report ID is required to request medicines.',
      });
    }

    if (!medicines || !Array.isArray(medicines) || medicines.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one medicine item with dosage and quantity.',
      });
    }

    // Validate Medical Report existence
    let reportDoc;
    if (reportId.match(/^[0-9a-fA-F]{24}$/)) {
      reportDoc = await MedicalReport.findById(reportId).populate('patient').populate('doctor').populate('appointment');
    } else {
      reportDoc = await MedicalReport.findOne({ reportId }).populate('patient').populate('doctor').populate('appointment');
    }

    if (!reportDoc) {
      return res.status(404).json({
        success: false,
        message: `Medical report ${reportId} not found.`,
      });
    }

    // Rule 6: Strictly ONLY approved reports can be used as the basis for medicine requests
    if (reportDoc.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: `Medicine requests can only be initiated against an officially approved report. Current report status is '${reportDoc.status}'.`,
      });
    }

    // Resolve Patient reference robustly
    const targetPatientRef = (patientId || patientReferenceNumber || '').trim();
    let patientDoc = null;

    // 1. By patientId / patientReferenceNumber if passed from frontend
    if (targetPatientRef) {
      if (targetPatientRef.match(/^[0-9a-fA-F]{24}$/)) {
        patientDoc = await Patient.findById(targetPatientRef);
      }
      if (!patientDoc) {
        patientDoc = await Patient.findOne({ patientId: targetPatientRef });
      }
    }

    // 2. By logged-in user if role is patient
    if (!patientDoc && req.user && req.user.role === 'patient') {
      patientDoc = await Patient.findOne({
        $or: [{ user: req.user.id }, { email: req.user.email }],
      });
    }

    // 3. By populated reportDoc.patient if already a valid Patient object
    if (!patientDoc && reportDoc.patient) {
      if (reportDoc.patient.patientId || reportDoc.patient.name) {
        patientDoc = reportDoc.patient;
      } else {
        const rawId = reportDoc.patient._id || reportDoc.patient;
        if (String(rawId).match(/^[0-9a-fA-F]{24}$/)) {
          patientDoc = await Patient.findById(rawId);
        }
      }
    }

    // 4. By reportDoc.patientUser if available
    if (!patientDoc && reportDoc.patientUser) {
      patientDoc = await Patient.findOne({ user: reportDoc.patientUser });
    }

    // 5. Fallback: If logged in as patient, auto-create profile if missing
    if (!patientDoc && req.user && req.user.role === 'patient') {
      const patientCount = await Patient.countDocuments();
      patientDoc = await Patient.create({
        patientId: `PAT-${1001 + patientCount}`,
        user: req.user.id,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone || '9876543210',
      });
    }

    if (!patientDoc) {
      return res.status(400).json({
        success: false,
        message: 'A valid Patient Reference Number is required to process this medicine request.',
      });
    }

    // Self-heal reportDoc if its patient reference was missing or pointing to outdated ID
    if (!reportDoc.patient || (reportDoc.patient._id && reportDoc.patient._id.toString() !== patientDoc._id.toString())) {
      reportDoc.patient = patientDoc._id;
      if (!reportDoc.patientUser && patientDoc.user) {
        reportDoc.patientUser = patientDoc.user;
      }
      await reportDoc.save();
    }

    // Prepare medicines with inventory links if available
    const processedMedicines = [];
    for (const item of medicines) {
      if (!item.medicineName || !item.quantity || Number(item.quantity) < 1) {
        return res.status(400).json({
          success: false,
          message: 'Each item must have a valid medicineName and a quantity of at least 1.',
        });
      }

      // Try matching inventory item
      let matchedMedicine = null;
      if (item.medicine && String(item.medicine).match(/^[0-9a-fA-F]{24}$/)) {
        matchedMedicine = await Medicine.findById(item.medicine);
      } else {
        matchedMedicine = await Medicine.findOne({
          name: new RegExp(`^${item.medicineName.trim()}$`, 'i'),
        });
      }

      processedMedicines.push({
        medicine: matchedMedicine ? matchedMedicine._id : null,
        medicineName: item.medicineName,
        category: item.category || (matchedMedicine ? matchedMedicine.category : 'Tablet'),
        dosage: item.dosage || 'Standard Dosage',
        frequency: item.frequency || 'As prescribed',
        duration: item.duration || '5 days',
        quantity: Number(item.quantity),
        instructions: item.instructions || 'Take after meals',
      });
    }

    const requestId = await getNextMedicineRequestId();

    const newRequest = await MedicineRequest.create({
      requestId,
      patient: patientDoc._id,
      patientId: patientDoc.patientId,
      patientReferenceNumber: patientDoc.patientId,
      patientName: patientDoc.name,
      patientUser: patientDoc.user || (req.user.role === 'patient' ? req.user.id : null),
      report: reportDoc._id,
      doctor: reportDoc.doctor ? reportDoc.doctor._id : null,
      appointment: reportDoc.appointment ? reportDoc.appointment._id : null,
      medicines: processedMedicines,
      reason: reason || `Medication prescribed under approved report ${reportDoc.reportId}`,
      additionalNotes: additionalNotes || '',
      status: 'pending_approval',
    });

    // Update linked MedicalReport to track medicine status
    reportDoc.medicineStatus = 'pending';
    reportDoc.medicineRequest = newRequest._id;
    await reportDoc.save();

    // Notify Admins
    await createNotification({
      recipientRole: 'admin',
      type: 'medicine_requested',
      title: 'New Tablet / Medicine Request',
      message: `Request ${newRequest.requestId} based on approved report ${reportDoc.reportId} submitted for review.`,
      relatedEntity: 'MedicineRequest',
      relatedEntityId: newRequest.requestId,
    });

    const populated = await findRequestRecord(newRequest._id.toString());

    res.status(201).json({
      success: true,
      message: 'Medicine request submitted for administrative approval.',
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin Approve Medicine Request & Safely Deduct Pharmacy Stock
// @route   PATCH /api/medicine-requests/:id/approve
// @access  Private (Admin only)
const approveMedicineRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const reqDoc = await findRequestRecord(id);

    if (!reqDoc) {
      return res.status(404).json({
        success: false,
        message: `Medicine request not found with ID ${id}`,
      });
    }

    if (reqDoc.status === 'approved' || reqDoc.status === 'dispensed') {
      return res.status(400).json({
        success: false,
        message: `This medicine request is already marked as ${reqDoc.status}.`,
      });
    }

    // Inventory Check & Atomic Deduction
    // Rule 8 & 9: Stock cannot become negative; verify stock before deducting
    const stockUpdates = [];

    for (const item of reqDoc.medicines) {
      let med = null;
      if (item.medicine) {
        med = await Medicine.findById(item.medicine);
      } else {
        med = await Medicine.findOne({
          name: new RegExp(`^${item.medicineName.trim()}$`, 'i'),
        });
      }

      if (med) {
        if (med.quantity < item.quantity) {
          return res.status(400).json({
            success: false,
            message: `Insufficient pharmacy inventory for "${med.name}". Available stock: ${med.quantity}, Requested: ${item.quantity}. Request cannot be approved until stock is replenished.`,
          });
        }
        stockUpdates.push({ medicineId: med._id, deductQty: item.quantity, medName: med.name });
      }
    }

    // Execute atomic stock deductions
    for (const update of stockUpdates) {
      const updatedMed = await Medicine.findOneAndUpdate(
        { _id: update.medicineId, quantity: { $gte: update.deductQty } },
        { $inc: { quantity: -update.deductQty } },
        { returnDocument: 'after' }
      );

      if (!updatedMed) {
        return res.status(400).json({
          success: false,
          message: `Concurrency conflict: Stock for "${update.medName}" was modified. Please retry.`,
        });
      }

      // Update status on medicine if low or out of stock
      if (updatedMed.quantity <= 0) {
        updatedMed.status = 'Out of Stock';
      } else if (updatedMed.quantity < 30) {
        updatedMed.status = 'Low Stock';
      }
      await updatedMed.save();
    }

    // Advance request status to 'approved'
    reqDoc.status = 'approved';
    reqDoc.approval = {
      approvedBy: req.user._id,
      approvedByName: req.user.name,
      approvedAt: new Date(),
      rejectedBy: null,
      rejectedByName: null,
      rejectedAt: null,
      rejectionReason: null,
    };

    await reqDoc.save();

    // Update linked MedicalReport
    if (reqDoc.report) {
      const repId = reqDoc.report._id || reqDoc.report;
      const linkedReport = await MedicalReport.findById(repId);
      if (linkedReport) {
        linkedReport.medicineStatus = 'approved';
        linkedReport.medicineRequest = reqDoc._id;
        linkedReport.medicineApproval = {
          status: 'approved',
          approvedAt: new Date(),
          approvedByName: req.user.name,
        };
        await linkedReport.save();

        // Notify Attending Doctor
        if (linkedReport.doctorUser) {
          await createNotification({
            recipient: linkedReport.doctorUser,
            recipientRole: 'doctor',
            type: 'medicine_approved',
            title: `Medicine Request Approved for ${linkedReport.reportId}`,
            message: `Medicine request ${reqDoc.requestId} linked to clinical report ${linkedReport.reportId} was approved by pharmacy administration.`,
            relatedEntity: 'MedicalReport',
            relatedEntityId: linkedReport.reportId,
          });
        }
      }
    }

    // Update linked Prescription
    if (reqDoc.prescription || reqDoc.prescriptionNo) {
      const rxId = reqDoc.prescription?._id || reqDoc.prescription;
      const linkedRx = rxId
        ? await Prescription.findById(rxId)
        : await Prescription.findOne({ prescriptionNo: reqDoc.prescriptionNo });

      if (linkedRx) {
        linkedRx.status = 'approved';
        linkedRx.approvalStatus = 'Approved';
        linkedRx.isApproved = true;
        linkedRx.medicineRequest = reqDoc._id;
        linkedRx.approval = {
          approvedBy: req.user._id,
          approvedByName: req.user.name,
          approvedAt: new Date(),
          rejectedBy: null,
          rejectedByName: null,
          rejectedAt: null,
          rejectionReason: null,
        };
        await linkedRx.save();

        // Notify Doctor
        if (linkedRx.doctorUser) {
          await createNotification({
            recipient: linkedRx.doctorUser,
            recipientRole: 'doctor',
            type: 'prescription_approved',
            title: `Prescription ${linkedRx.prescriptionNo} Approved`,
            message: `Prescription ${linkedRx.prescriptionNo} for patient ${linkedRx.patientName} was approved by pharmacy administration.`,
            relatedEntity: 'Prescription',
            relatedEntityId: linkedRx.prescriptionNo,
          });
        }
      }
    }

    // Notify Patient
    if (reqDoc.patientUser || (reqDoc.patient && reqDoc.patient.user)) {
      const patientUserId = reqDoc.patientUser || reqDoc.patient.user;
      await createNotification({
        recipient: patientUserId,
        recipientRole: 'patient',
        type: 'medicine_approved',
        title: 'Medicine Request Approved',
        message: `Your medicine request ${reqDoc.requestId} has been approved by the pharmacy administration.`,
        relatedEntity: 'MedicineRequest',
        relatedEntityId: reqDoc.requestId,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Medicine request approved successfully and pharmacy inventory updated.',
      data: reqDoc,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin Reject Medicine Request
// @route   PATCH /api/medicine-requests/:id/reject
// @access  Private (Admin only)
const rejectMedicineRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rejectionReason, reason } = req.body;
    const reqDoc = await findRequestRecord(id);

    if (!reqDoc) {
      return res.status(404).json({
        success: false,
        message: `Medicine request not found with ID ${id}`,
      });
    }

    const finalReason =
      rejectionReason || reason || 'Prescription dosage or medication verification failed.';

    reqDoc.status = 'rejected';
    reqDoc.approval = {
      ...reqDoc.approval,
      rejectedBy: req.user._id,
      rejectedByName: req.user.name,
      rejectedAt: new Date(),
      rejectionReason: finalReason,
    };

    await reqDoc.save();

    // Update linked MedicalReport
    if (reqDoc.report) {
      const repId = reqDoc.report._id || reqDoc.report;
      const linkedReport = await MedicalReport.findById(repId);
      if (linkedReport) {
        linkedReport.medicineStatus = 'rejected';
        linkedReport.medicineRequest = reqDoc._id;
        linkedReport.medicineApproval = {
          status: 'rejected',
          rejectedAt: new Date(),
          rejectedByName: req.user.name,
          rejectionReason: finalReason,
        };
        await linkedReport.save();

        // Notify Attending Doctor
        if (linkedReport.doctorUser) {
          await createNotification({
            recipient: linkedReport.doctorUser,
            recipientRole: 'doctor',
            type: 'medicine_rejected',
            title: `Medicine Request Rejected for ${linkedReport.reportId}`,
            message: `Medicine request ${reqDoc.requestId} linked to clinical report ${linkedReport.reportId} was rejected. Reason: ${finalReason}`,
            relatedEntity: 'MedicalReport',
            relatedEntityId: linkedReport.reportId,
          });
        }
      }
    }

    // Update linked Prescription
    if (reqDoc.prescription || reqDoc.prescriptionNo) {
      const rxId = reqDoc.prescription?._id || reqDoc.prescription;
      const linkedRx = rxId
        ? await Prescription.findById(rxId)
        : await Prescription.findOne({ prescriptionNo: reqDoc.prescriptionNo });

      if (linkedRx) {
        linkedRx.status = 'rejected';
        linkedRx.approvalStatus = 'Rejected';
        linkedRx.isApproved = false;
        linkedRx.approval = {
          ...linkedRx.approval,
          rejectedBy: req.user._id,
          rejectedByName: req.user.name,
          rejectedAt: new Date(),
          rejectionReason: finalReason,
        };
        await linkedRx.save();

        // Notify Doctor
        if (linkedRx.doctorUser) {
          await createNotification({
            recipient: linkedRx.doctorUser,
            recipientRole: 'doctor',
            type: 'prescription_rejected',
            title: `Prescription ${linkedRx.prescriptionNo} Rejected`,
            message: `Prescription ${linkedRx.prescriptionNo} for patient ${linkedRx.patientName} was rejected. Reason: ${finalReason}`,
            relatedEntity: 'Prescription',
            relatedEntityId: linkedRx.prescriptionNo,
          });
        }
      }
    }

    // Notify Patient
    if (reqDoc.patientUser || (reqDoc.patient && reqDoc.patient.user)) {
      const patientUserId = reqDoc.patientUser || reqDoc.patient.user;
      await createNotification({
        recipient: patientUserId,
        recipientRole: 'patient',
        type: 'medicine_rejected',
        title: 'Medicine Request Rejected',
        message: `Your medicine request ${reqDoc.requestId} was rejected. Reason: ${finalReason}`,
        relatedEntity: 'MedicineRequest',
        relatedEntityId: reqDoc.requestId,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Medicine request rejected.',
      data: reqDoc,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Mark Medicine Request as Dispensed
// @route   PATCH /api/medicine-requests/:id/dispense
// @access  Private (Admin / Staff)
const dispenseMedicineRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const reqDoc = await findRequestRecord(id);

    if (!reqDoc) {
      return res.status(404).json({
        success: false,
        message: `Medicine request not found with ID ${id}`,
      });
    }

    if (reqDoc.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: `Only approved requests can be dispensed. Current status is '${reqDoc.status}'.`,
      });
    }

    reqDoc.status = 'dispensed';
    reqDoc.dispensedAt = new Date();
    reqDoc.dispensedBy = req.user._id;

    await reqDoc.save();

    // Update linked MedicalReport
    if (reqDoc.report) {
      const repId = reqDoc.report._id || reqDoc.report;
      const linkedReport = await MedicalReport.findById(repId);
      if (linkedReport) {
        linkedReport.medicineStatus = 'dispensed';
        await linkedReport.save();
      }
    }

    res.status(200).json({
      success: true,
      message: 'Medication successfully dispensed to patient.',
      data: reqDoc,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete Medicine Request
// @route   DELETE /api/medicine-requests/:id
// @access  Private (Admin only)
const deleteMedicineRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const reqDoc = await findRequestRecord(id);

    if (!reqDoc) {
      return res.status(404).json({
        success: false,
        message: `Medicine request not found with ID ${id}`,
      });
    }

    await MedicineRequest.findByIdAndDelete(reqDoc._id);

    res.status(200).json({
      success: true,
      message: 'Medicine request deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMedicineRequests,
  getMedicineRequestById,
  createMedicineRequest,
  approveMedicineRequest,
  rejectMedicineRequest,
  dispenseMedicineRequest,
  deleteMedicineRequest,
};
