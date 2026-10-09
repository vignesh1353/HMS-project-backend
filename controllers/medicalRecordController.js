const MedicalRecord = require('../models/MedicalRecord');
const Patient = require('../models/Patient');

// @desc    Get medical records (isolated for patients, all for admin/doctor)
// @route   GET /api/medical-records
// @access  Private
const getMedicalRecords = async (req, res, next) => {
  try {
    const { search, type, department } = req.query;
    const query = {};

    // Patient isolation
    if (req.user && req.user.role === 'patient') {
      const patient = await Patient.findOne({
        $or: [{ user: req.user.id }, { email: req.user.email }],
      });

      if (patient) {
        query.$or = [
          { patient: patient._id },
          { patientName: new RegExp(patient.name, 'i') },
        ];
      } else {
        query.patientName = req.user.name;
      }
    }

    if (type && type !== 'All') {
      query.type = type;
    }

    if (department && department !== 'All') {
      query.department = department;
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const searchConditions = [
        { title: searchRegex },
        { recordId: searchRegex },
        { doctor: searchRegex },
        { department: searchRegex },
        { type: searchRegex },
        { description: searchRegex },
        { patientName: searchRegex },
      ];

      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchConditions }];
        delete query.$or;
      } else {
        query.$or = searchConditions;
      }
    }

    const records = await MedicalRecord.find(query).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: records.length,
      data: records,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single medical record
// @route   GET /api/medical-records/:id
// @access  Private
const getMedicalRecordById = async (req, res, next) => {
  try {
    const { id } = req.params;
    let record;

    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      record = await MedicalRecord.findById(id);
    } else {
      record = await MedicalRecord.findOne({ recordId: id });
    }

    if (!record) {
      return res.status(404).json({
        success: false,
        message: `Medical record not found with ID ${id}`,
      });
    }

    // Role check for patient
    if (req.user && req.user.role === 'patient') {
      const patient = await Patient.findOne({
        $or: [{ user: req.user.id }, { email: req.user.email }],
      });

      const isOwner =
        (patient && record.patient && record.patient.toString() === patient._id.toString()) ||
        (patient && record.patientName && new RegExp(patient.name, 'i').test(record.patientName));

      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized: You can only view your own medical records',
        });
      }
    }

    res.status(200).json({
      success: true,
      data: record,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create medical record
// @route   POST /api/medical-records
// @access  Private (Admin / Doctor)
const createMedicalRecord = async (req, res, next) => {
  try {
    const {
      patient,
      patientName,
      doctor,
      title,
      department,
      type,
      date,
      description,
      diagnosis,
      symptoms,
      treatment,
      notes,
      status,
    } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Title is required for medical record',
      });
    }

    const count = await MedicalRecord.countDocuments();
    const recordId = req.body.recordId || `REC-${1001 + count}`;

    // Resolve patient if ID or name given
    let patientRef = null;
    let resolvedName = patientName;
    if (patient) {
      patientRef = patient;
      const found = await Patient.findById(patient);
      if (found) resolvedName = found.name;
    } else if (patientName) {
      const found = await Patient.findOne({ name: new RegExp(patientName, 'i') });
      if (found) {
        patientRef = found._id;
        resolvedName = found.name;
      }
    }

    const record = await MedicalRecord.create({
      recordId,
      patient: patientRef,
      patientName: resolvedName || 'Patient',
      doctor: doctor || 'Dr. Rajesh Kumar',
      title,
      department: department || 'General Medicine',
      type: type || 'Medical Report',
      date: date || new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
      }),
      description: description || '',
      diagnosis: diagnosis || '',
      symptoms: symptoms || '',
      treatment: treatment || '',
      notes: notes || '',
      status: status || 'Available',
    });

    res.status(201).json({
      success: true,
      message: 'Medical record created successfully',
      data: record,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update medical record
// @route   PUT /api/medical-records/:id
// @access  Private (Admin / Doctor)
const updateMedicalRecord = async (req, res, next) => {
  try {
    const { id } = req.params;
    let record = await MedicalRecord.findById(id);

    if (!record) {
      record = await MedicalRecord.findOne({ recordId: id });
    }

    if (!record) {
      return res.status(404).json({
        success: false,
        message: `Medical record not found with ID ${id}`,
      });
    }

    const updated = await MedicalRecord.findByIdAndUpdate(
      record._id,
      req.body,
      { returnDocument: 'after', runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Medical record updated successfully',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete medical record
// @route   DELETE /api/medical-records/:id
// @access  Private (Admin only)
const deleteMedicalRecord = async (req, res, next) => {
  try {
    const { id } = req.params;
    let record = await MedicalRecord.findById(id);

    if (!record) {
      record = await MedicalRecord.findOne({ recordId: id });
    }

    if (!record) {
      return res.status(404).json({
        success: false,
        message: `Medical record not found with ID ${id}`,
      });
    }

    await MedicalRecord.findByIdAndDelete(record._id);

    res.status(200).json({
      success: true,
      message: 'Medical record deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMedicalRecords,
  getMedicalRecordById,
  createMedicalRecord,
  updateMedicalRecord,
  deleteMedicalRecord,
};
