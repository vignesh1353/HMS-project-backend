const Prescription = require('../models/Prescription');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Medicine = require('../models/Medicine');
const MedicineRequest = require('../models/MedicineRequest');
const User = require('../models/User');
const { createNotification } = require('../utils/notificationHelper');
const { getNextPrescriptionNo, getNextMedicineRequestId } = require('../utils/idGenerator');

// @desc    Get prescriptions (isolated for patients, all for admin/doctor)
// @route   GET /api/prescriptions
// @access  Private
const getPrescriptions = async (req, res, next) => {
  try {
    const { search } = req.query;
    const query = {};

    // Patient isolation: patients directly receive their own prescriptions issued by doctors (no admin approval required)
    if (req.user && req.user.role === 'patient') {
      const patient = await Patient.findOne({
        $or: [{ user: req.user.id }, { email: req.user.email }],
      });

      const patientConditions = [{ patientUser: req.user.id }];
      if (patient) {
        patientConditions.push({ patient: patient._id });
        patientConditions.push({ patientName: new RegExp(patient.name, 'i') });
      } else {
        patientConditions.push({ patientName: new RegExp(req.user.name, 'i') });
      }

      // Direct to patient: patient sees their prescriptions directly without requiring admin approval
      query.$and = [
        { $or: patientConditions },
        { status: { $ne: 'rejected' } },
      ];
    }

    // Admin filtering: hide prescriptions deleted from admin view only
    if (req.user && req.user.role === 'admin') {
      query.deletedFromAdmin = { $ne: true };
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const searchConditions = [
        { prescriptionNo: searchRegex },
        { doctor: searchRegex },
        { department: searchRegex },
        { diagnosis: searchRegex },
        { patientName: searchRegex },
      ];

      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchConditions }];
        delete query.$or;
      } else {
        query.$or = searchConditions;
      }
    }

    const prescriptions = await Prescription.find(query).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: prescriptions.length,
      data: prescriptions,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single prescription
// @route   GET /api/prescriptions/:id
// @access  Private
const getPrescriptionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    let prescription;

    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      prescription = await Prescription.findById(id);
    } else {
      prescription = await Prescription.findOne({ prescriptionNo: id });
    }

    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: `Prescription not found with ID ${id}`,
      });
    }

    // Role check for patient
    if (req.user && req.user.role === 'patient') {
      const patient = await Patient.findOne({
        $or: [{ user: req.user.id }, { email: req.user.email }],
      });

      const isOwner =
        (patient && prescription.patient && prescription.patient.toString() === patient._id.toString()) ||
        (patient && prescription.patientName && new RegExp(patient.name, 'i').test(prescription.patientName));

      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized: You can only view your own prescriptions',
        });
      }
    }

    res.status(200).json({
      success: true,
      data: prescription,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create prescription
// @route   POST /api/prescriptions
// @access  Private (Admin / Doctor)
const createPrescription = async (req, res, next) => {
  try {
    const {
      patient,
      patientName,
      doctor,
      department,
      date,
      diagnosis,
      medicines,
      medications,
      instructions,
      notes,
    } = req.body;

    const rawMedicines = (medicines && Array.isArray(medicines) && medicines.length > 0)
      ? medicines
      : (medications && Array.isArray(medications) && medications.length > 0)
      ? medications
      : [];

    const doctorName = doctor || (req.user && req.user.name) || 'Dr. Medical Specialist';

    if (!doctorName || !diagnosis || rawMedicines.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Doctor, diagnosis, and at least one medicine are required',
      });
    }

    const prescriptionNo = req.body.prescriptionNo || (await getNextPrescriptionNo());

    let patientRef = null;
    let resolvedName = patientName;
    let patientUser = null;
    let patientId = null;

    if (patient) {
      patientRef = patient;
      const found = await Patient.findById(patient);
      if (found) {
        resolvedName = found.name;
        patientUser = found.user || null;
        patientId = found.patientId || null;
      }
    } else if (patientName) {
      const found = await Patient.findOne({ name: new RegExp(patientName.trim(), 'i') });
      if (found) {
        patientRef = found._id;
        resolvedName = found.name;
        patientUser = found.user || null;
        patientId = found.patientId || null;
      }
    }

    // Try finding matching patient user if not yet resolved
    if (!patientUser && resolvedName) {
      const userDoc = await User.findOne({
        name: new RegExp(`^${resolvedName.trim()}$`, 'i'),
        role: 'patient',
      });
      if (userDoc) {
        patientUser = userDoc._id;
      }
    }

    // Doctor user identification
    let doctorUser = null;
    if (req.user && req.user.role === 'doctor') {
      doctorUser = req.user._id;
    } else if (doctorName) {
      const docUser = await User.findOne({
        name: new RegExp(doctorName.trim(), 'i'),
        role: 'doctor',
      });
      if (docUser) doctorUser = docUser._id;
    }

    // Standardize prescription items
    const formattedRxMedicines = rawMedicines.map((m) => ({
      name: m.name || m.medicineName || 'Medicine',
      dosage: m.dosage || '500mg',
      frequency: m.frequency || 'Twice daily',
      duration: m.duration || '5 days',
      timing: m.timing || m.instructions || 'After Food',
    }));

    // Prescriptions directly go to patient upon issuance: status is 'active', isApproved = true
    const prescription = await Prescription.create({
      prescriptionNo,
      patient: patientRef,
      patientName: resolvedName || 'Patient',
      doctor: doctorName,
      department: department || 'General Medicine',
      date: date || new Date().toISOString().split('T')[0],
      diagnosis,
      medicines: formattedRxMedicines,
      instructions: instructions || notes || '',
      patientUser,
      doctorUser,
      status: 'active',
      approvalStatus: 'Active',
      isApproved: true,
    });

    // Prepare medicine request items for Admin review
    const processedRequestMeds = [];
    for (const item of rawMedicines) {
      const medName = (item.name || item.medicineName || 'Medicine').trim();
      let matchedMed = null;
      if (item.medicine && String(item.medicine).match(/^[0-9a-fA-F]{24}$/)) {
        matchedMed = await Medicine.findById(item.medicine);
      } else {
        matchedMed = await Medicine.findOne({
          name: new RegExp(`^${medName}$`, 'i'),
        });
      }

      processedRequestMeds.push({
        medicine: matchedMed ? matchedMed._id : null,
        medicineName: medName,
        category: item.category || (matchedMed ? matchedMed.category : 'Tablet'),
        dosage: item.dosage || '500mg',
        frequency: item.frequency || 'Twice daily',
        duration: item.duration || '5 days',
        quantity: item.quantity ? Number(item.quantity) : 10,
        instructions: item.instructions || item.timing || 'Take after meals',
      });
    }

    // Create linked MedicineRequest routed to Admin Medicine Approvals
    let medRequestId = `MED-${prescriptionNo}`;
    if (await MedicineRequest.findOne({ requestId: medRequestId })) {
      medRequestId = await getNextMedicineRequestId(`MED-${prescriptionNo}`);
    }
    const medicineReq = await MedicineRequest.create({
      requestId: medRequestId,
      patient: patientRef,
      patientId: patientId || '',
      patientReferenceNumber: patientId || '',
      patientName: resolvedName || 'Patient',
      patientUser: patientUser,
      prescription: prescription._id,
      prescriptionNo: prescription.prescriptionNo,
      source: 'prescription',
      doctor: null,
      medicines: processedRequestMeds,
      reason: `Doctor Prescription ${prescriptionNo} (${diagnosis}) - Issued by ${doctorName}`,
      additionalNotes: instructions || notes || 'Doctor issued prescription awaiting pharmacy admin verification.',
      status: 'pending_approval',
    });

    prescription.medicineRequest = medicineReq._id;
    await prescription.save();

    // 1. Notify Patient directly so patient receives and views prescription immediately
    if (patientUser) {
      await createNotification({
        recipient: patientUser,
        recipientRole: 'patient',
        type: 'prescription_issued',
        title: `New Prescription Issued (${prescriptionNo})`,
        message: `Dr. ${doctorName} has issued a new prescription (${prescriptionNo}) for you. You can view your medicines directly.`,
        relatedEntity: 'Prescription',
        relatedEntityId: prescription._id,
      });
    }

    // 2. Notify Admin so Admin can see and monitor prescriptions across the hospital
    await createNotification({
      recipientRole: 'admin',
      type: 'prescription_issued',
      title: `Prescription Issued (${prescriptionNo})`,
      message: `Dr. ${doctorName} issued prescription ${prescriptionNo} for patient ${resolvedName || 'Patient'}. Sent directly to patient.`,
      relatedEntity: 'Prescription',
      relatedEntityId: prescription._id,
    });

    res.status(201).json({
      success: true,
      message: 'Prescription issued successfully and sent directly to patient.',
      data: prescription,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin Approve Prescription (updates status, deducts stock, notifies)
// @route   PATCH /api/prescriptions/:id/approve
// @access  Private (Admin only)
const approvePrescription = async (req, res, next) => {
  try {
    const { id } = req.params;
    let prescription;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      prescription = await Prescription.findById(id);
    } else {
      prescription = await Prescription.findOne({ prescriptionNo: id });
    }

    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: `Prescription not found with ID ${id}`,
      });
    }

    if (prescription.isApproved || prescription.status === 'approved') {
      return res.status(400).json({
        success: false,
        message: 'This prescription is already approved.',
      });
    }

    // Find linked MedicineRequest if exists
    let medicineReq = null;
    if (prescription.medicineRequest) {
      medicineReq = await MedicineRequest.findById(prescription.medicineRequest);
    } else {
      medicineReq = await MedicineRequest.findOne({
        $or: [
          { prescription: prescription._id },
          { prescriptionNo: prescription.prescriptionNo },
          { requestId: `MED-${prescription.prescriptionNo}` },
        ],
      });
    }

    // If medicine request exists and not already approved, perform stock deduction
    if (medicineReq && medicineReq.status !== 'approved') {
      const stockUpdates = [];
      for (const item of medicineReq.medicines) {
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
              message: `Insufficient pharmacy inventory for "${med.name}". Available: ${med.quantity}, Requested: ${item.quantity}. Cannot approve until replenished.`,
            });
          }
          stockUpdates.push({ medicineId: med._id, deductQty: item.quantity, medName: med.name });
        }
      }

      for (const update of stockUpdates) {
        const updatedMed = await Medicine.findOneAndUpdate(
          { _id: update.medicineId, quantity: { $gte: update.deductQty } },
          { $inc: { quantity: -update.deductQty } },
          { returnDocument: 'after' }
        );
        if (updatedMed) {
          if (updatedMed.quantity <= 0) {
            updatedMed.status = 'Out of Stock';
          } else if (updatedMed.quantity < 30) {
            updatedMed.status = 'Low Stock';
          }
          await updatedMed.save();
        }
      }

      medicineReq.status = 'approved';
      medicineReq.approval = {
        approvedBy: req.user._id,
        approvedByName: req.user.name,
        approvedAt: new Date(),
        rejectedBy: null,
        rejectedByName: null,
        rejectedAt: null,
        rejectionReason: null,
      };
      await medicineReq.save();
    }

    // Update Prescription
    prescription.status = 'approved';
    prescription.approvalStatus = 'Approved';
    prescription.isApproved = true;
    prescription.approval = {
      approvedBy: req.user._id,
      approvedByName: req.user.name,
      approvedAt: new Date(),
      rejectedBy: null,
      rejectedByName: null,
      rejectedAt: null,
      rejectionReason: null,
    };
    await prescription.save();

    // Notify Attending Doctor
    if (prescription.doctorUser) {
      await createNotification({
        recipient: prescription.doctorUser,
        recipientRole: 'doctor',
        type: 'prescription_approved',
        title: `Prescription Approved (${prescription.prescriptionNo})`,
        message: `Prescription ${prescription.prescriptionNo} for patient ${prescription.patientName} was approved by pharmacy administration.`,
        relatedEntity: 'Prescription',
        relatedEntityId: prescription.prescriptionNo,
      });
    }

    // Notify Patient
    if (prescription.patientUser) {
      await createNotification({
        recipient: prescription.patientUser,
        recipientRole: 'patient',
        type: 'prescription_approved',
        title: 'Prescription Approved',
        message: `Your prescription ${prescription.prescriptionNo} has been approved by pharmacy administration and is now available in your portal.`,
        relatedEntity: 'Prescription',
        relatedEntityId: prescription.prescriptionNo,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Prescription approved successfully and released to patient.',
      data: prescription,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Admin Reject Prescription
// @route   PATCH /api/prescriptions/:id/reject
// @access  Private (Admin only)
const rejectPrescription = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rejectionReason, reason } = req.body;
    let prescription;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      prescription = await Prescription.findById(id);
    } else {
      prescription = await Prescription.findOne({ prescriptionNo: id });
    }

    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: `Prescription not found with ID ${id}`,
      });
    }

    const finalReason = rejectionReason || reason || 'Prescription could not be fulfilled by pharmacy.';

    prescription.status = 'rejected';
    prescription.approvalStatus = 'Rejected';
    prescription.isApproved = false;
    prescription.approval = {
      ...prescription.approval,
      rejectedBy: req.user._id,
      rejectedByName: req.user.name,
      rejectedAt: new Date(),
      rejectionReason: finalReason,
    };
    await prescription.save();

    // Update linked MedicineRequest if exists
    let medicineReq = null;
    if (prescription.medicineRequest) {
      medicineReq = await MedicineRequest.findById(prescription.medicineRequest);
    } else {
      medicineReq = await MedicineRequest.findOne({
        $or: [
          { prescription: prescription._id },
          { prescriptionNo: prescription.prescriptionNo },
          { requestId: `MED-${prescription.prescriptionNo}` },
        ],
      });
    }

    if (medicineReq) {
      medicineReq.status = 'rejected';
      medicineReq.approval = {
        ...medicineReq.approval,
        rejectedBy: req.user._id,
        rejectedByName: req.user.name,
        rejectedAt: new Date(),
        rejectionReason: finalReason,
      };
      await medicineReq.save();
    }

    // Notify Attending Doctor
    if (prescription.doctorUser) {
      await createNotification({
        recipient: prescription.doctorUser,
        recipientRole: 'doctor',
        type: 'prescription_rejected',
        title: `Prescription Rejected (${prescription.prescriptionNo})`,
        message: `Prescription ${prescription.prescriptionNo} for patient ${prescription.patientName} was rejected. Reason: ${finalReason}`,
        relatedEntity: 'Prescription',
        relatedEntityId: prescription.prescriptionNo,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Prescription rejected.',
      data: prescription,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update prescription
// @route   PUT /api/prescriptions/:id
// @access  Private (Admin / Doctor)
const updatePrescription = async (req, res, next) => {
  try {
    const { id } = req.params;
    let prescription = await Prescription.findById(id);

    if (!prescription) {
      prescription = await Prescription.findOne({ prescriptionNo: id });
    }

    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: `Prescription not found with ID ${id}`,
      });
    }

    const updated = await Prescription.findByIdAndUpdate(
      prescription._id,
      req.body,
      { returnDocument: 'after', runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Prescription updated successfully',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete prescription
// @route   DELETE /api/prescriptions/:id
// @access  Private (Admin only)
const deletePrescription = async (req, res, next) => {
  try {
    const { id } = req.params;
    let prescription = await Prescription.findById(id);

    if (!prescription) {
      prescription = await Prescription.findOne({ prescriptionNo: id });
    }

    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: `Prescription not found with ID ${id}`,
      });
    }

    if (req.query.permanent === 'true') {
      await Prescription.findByIdAndDelete(prescription._id);
    } else {
      prescription.deletedFromAdmin = true;
      await prescription.save();
    }

    res.status(200).json({
      success: true,
      message: 'Prescription removed from admin page successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPrescriptions,
  getPrescriptionById,
  createPrescription,
  approvePrescription,
  rejectPrescription,
  updatePrescription,
  deletePrescription,
};
