const Billing = require('../models/Billing');
const Patient = require('../models/Patient');

// @desc    Get bills (isolated for patient, all for admin)
// @route   GET /api/billing
// @access  Private
const getBills = async (req, res, next) => {
  try {
    const { search, status } = req.query;
    const query = {};

    // Patient isolation - only approved bills for this specific patient are visible in MyBilling
    if (req.user && req.user.role === 'patient') {
      const patient = await Patient.findOne({
        $or: [
          { user: req.user.id },
          { email: req.user.email },
          { name: new RegExp('^' + req.user.name + '$', 'i') },
        ],
      });

      let patientFilter;
      if (patient) {
        const patId = (patient.patientId || '').trim();
        patientFilter = {
          $or: [
            { patient: patient._id },
            ...(patId ? [{ patientId: patId }, { patientId: new RegExp('^' + patId + '$', 'i') }] : []),
            { patientName: new RegExp('^' + patient.name.trim() + '$', 'i') },
          ],
        };
      } else {
        patientFilter = {
          $or: [
            { patientName: new RegExp('^' + req.user.name.trim() + '$', 'i') },
            ...(req.user.patientId ? [{ patientId: req.user.patientId }] : []),
          ],
        };
      }

      const approvedFilter = {
        $or: [{ approvalStatus: 'Approved' }, { isApproved: true }],
      };

      if (!query.$and) query.$and = [];
      query.$and.push(patientFilter);
      query.$and.push(approvedFilter);
    }

    if (status && status !== 'All') {
      query.paymentStatus = status;
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const searchConditions = [
        { billNumber: searchRegex },
        { patientName: searchRegex },
        { patientId: searchRegex },
        { doctor: searchRegex },
        { department: searchRegex },
        { paymentStatus: searchRegex },
      ];

      if (!query.$and) query.$and = [];
      query.$and.push({ $or: searchConditions });
    }

    const bills = await Billing.find(query).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: bills.length,
      data: bills,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get bill by ID or billNumber
// @route   GET /api/billing/:id
// @access  Private
const getBillById = async (req, res, next) => {
  try {
    const { id } = req.params;
    let bill;

    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      bill = await Billing.findById(id);
    } else {
      bill = await Billing.findOne({ billNumber: id });
    }

    if (!bill) {
      return res.status(404).json({
        success: false,
        message: `Billing invoice not found with ID ${id}`,
      });
    }

    // Role check for patient
    if (req.user && req.user.role === 'patient') {
      const patient = await Patient.findOne({
        $or: [{ user: req.user.id }, { email: req.user.email }],
      });

      const isOwner =
        (patient && bill.patient && bill.patient.toString() === patient._id.toString()) ||
        (patient && bill.patientId === patient.patientId);

      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized: You can only access your own billing records',
        });
      }
    }

    res.status(200).json({
      success: true,
      data: bill,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create billing invoice (Backend computes totals)
// @route   POST /api/billing
// @access  Private (Admin / Staff)
const createBill = async (req, res, next) => {
  try {
    const {
      patientName,
      patientId,
      doctor,
      department,
      billDate,
      consultation,
      roomCharges,
      medicineCharges,
      testCharges,
      paymentStatus,
      paymentMethod,
    } = req.body;

    if (!patientName || !doctor) {
      return res.status(400).json({
        success: false,
        message: 'Patient name and doctor name are required',
      });
    }

    // Auto-generate billNumber if not provided
    const billCount = await Billing.countDocuments();
    const billNumber = req.body.billNumber || `BILL-${1001 + billCount}`;

    // Link patient if exists specifically by patientId
    let patientRef = null;
    let actualPatientId = patientId ? patientId.trim() : '';
    let actualPatientName = patientName ? patientName.trim() : '';

    if (patientId) {
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(patientId.trim());
      const foundPatient = await Patient.findOne({
        $or: [
          { patientId: patientId.trim() },
          { patientId: new RegExp('^' + patientId.trim() + '$', 'i') },
          ...(isObjectId ? [{ _id: patientId.trim() }] : []),
        ],
      });
      if (foundPatient) {
        patientRef = foundPatient._id;
        actualPatientId = foundPatient.patientId;
        if (!actualPatientName) actualPatientName = foundPatient.name;
      }
    } else if (patientName) {
      const foundPatient = await Patient.findOne({
        name: new RegExp('^' + patientName.trim() + '$', 'i'),
      });
      if (foundPatient) {
        patientRef = foundPatient._id;
        actualPatientId = foundPatient.patientId;
        actualPatientName = foundPatient.name;
      }
    }

    const c = Number(consultation) || 0;
    const r = Number(roomCharges) || 0;
    const m = Number(medicineCharges) || 0;
    const t = Number(testCharges) || 0;
    let patientAge = req.body.age !== undefined && req.body.age !== '' ? Number(req.body.age) : undefined;
    if (patientAge === undefined && patientRef) {
      const p = await Patient.findById(patientRef);
      if (p && p.age !== undefined) patientAge = p.age;
    }

    const bill = await Billing.create({
      billNumber,
      patient: patientRef,
      patientId: actualPatientId || patientId || (patientRef ? `PAT-${1001 + billCount}` : 'PAT-1001'),
      patientName: actualPatientName || patientName,
      age: patientAge,
      doctor,
      department: department || 'General Medicine',
      billDate: billDate || new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
      }),
      consultation: c,
      roomCharges: r,
      medicineCharges: m,
      testCharges: t,
      totalAmount,
      paymentStatus: paymentStatus || 'Paid',
      paymentMethod: paymentMethod || 'Cash',
      approvalStatus: req.body.approvalStatus || 'Pending',
      isApproved: req.body.approvalStatus === 'Approved' || req.body.isApproved === true || false,
    });

    res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      data: bill,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update billing invoice
// @route   PUT /api/billing/:id
// @access  Private (Admin / Staff)
const updateBill = async (req, res, next) => {
  try {
    const { id } = req.params;
    let bill = await Billing.findById(id);

    if (!bill) {
      bill = await Billing.findOne({ billNumber: id });
    }

    if (!bill) {
      return res.status(404).json({
        success: false,
        message: `Billing invoice not found with ID ${id}`,
      });
    }

    const updateData = { ...req.body };
    if (updateData.age !== undefined) {
      updateData.age = updateData.age !== '' && updateData.age !== null ? Number(updateData.age) : undefined;
    }
    const c = updateData.consultation !== undefined ? Number(updateData.consultation) : bill.consultation;
    const r = updateData.roomCharges !== undefined ? Number(updateData.roomCharges) : bill.roomCharges;
    const m = updateData.medicineCharges !== undefined ? Number(updateData.medicineCharges) : bill.medicineCharges;
    const t = updateData.testCharges !== undefined ? Number(updateData.testCharges) : bill.testCharges;
    updateData.totalAmount = (c || 0) + (r || 0) + (m || 0) + (t || 0);

    const updated = await Billing.findByIdAndUpdate(
      bill._id,
      updateData,
      { returnDocument: 'after', runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Invoice updated successfully',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update billing payment status
// @route   PATCH /api/billing/:id/payment-status
// @access  Private (Admin / Staff)
const updatePaymentStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { paymentStatus, paymentMethod } = req.body;

    if (!paymentStatus) {
      return res.status(400).json({
        success: false,
        message: 'Payment status is required',
      });
    }

    let bill = await Billing.findById(id);
    if (!bill) {
      bill = await Billing.findOne({ billNumber: id });
    }

    if (!bill) {
      return res.status(404).json({
        success: false,
        message: `Billing invoice not found with ID ${id}`,
      });
    }

    bill.paymentStatus = paymentStatus;
    if (paymentMethod) bill.paymentMethod = paymentMethod;
    await bill.save();

    res.status(200).json({
      success: true,
      message: `Payment status updated to ${paymentStatus}`,
      data: bill,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete billing invoice
// @route   DELETE /api/billing/:id
// @access  Private (Admin only)
const deleteBill = async (req, res, next) => {
  try {
    const { id } = req.params;
    let bill = await Billing.findById(id);

    if (!bill) {
      bill = await Billing.findOne({ billNumber: id });
    }

    if (!bill) {
      return res.status(404).json({
        success: false,
        message: `Billing invoice not found with ID ${id}`,
      });
    }

    await Billing.findByIdAndDelete(bill._id);

    res.status(200).json({
      success: true,
      message: 'Invoice deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Approve billing invoice (makes it visible in client MyBilling)
// @route   PATCH /api/billing/:id/approve
// @access  Private (Admin / Staff)
const approveBill = async (req, res, next) => {
  try {
    const { id } = req.params;
    let bill = await Billing.findById(id);

    if (!bill) {
      bill = await Billing.findOne({ billNumber: id });
    }

    if (!bill) {
      return res.status(404).json({
        success: false,
        message: `Billing invoice not found with ID ${id}`,
      });
    }

    // Ensure patient linkage by patientId if not already linked
    if (!bill.patient && bill.patientId) {
      const foundPatient = await Patient.findOne({
        $or: [
          { patientId: bill.patientId.trim() },
          { patientId: new RegExp('^' + bill.patientId.trim() + '$', 'i') },
        ],
      });
      if (foundPatient) {
        bill.patient = foundPatient._id;
        bill.patientName = foundPatient.name;
      }
    }

    bill.approvalStatus = 'Approved';
    bill.isApproved = true;
    await bill.save();

    // Create notification for the specific patient user
    try {
      const Notification = require('../models/Notification');
      let recipientUserId = null;
      if (bill.patient) {
        const pat = await Patient.findById(bill.patient);
        if (pat && pat.user) recipientUserId = pat.user;
      }
      await Notification.create({
        recipient: recipientUserId,
        recipientRole: 'patient',
        type: 'billing_approved',
        title: 'New Bill Approved',
        message: `Your hospital invoice #${bill.billNumber} of ₹${bill.totalAmount} has been approved by administration and is now available in your MyBilling section.`,
        relatedEntity: 'Billing',
        relatedEntityId: bill._id.toString(),
      });
    } catch (notifErr) {
      console.error('Notification creation error:', notifErr.message);
    }

    res.status(200).json({
      success: true,
      message: `Invoice ${bill.billNumber} approved and published to client ${bill.patientName} (${bill.patientId}) in MyBilling`,
      data: bill,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getBills,
  getBillById,
  createBill,
  updateBill,
  updatePaymentStatus,
  approveBill,
  deleteBill,
};
