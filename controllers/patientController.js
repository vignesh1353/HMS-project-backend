const Patient = require('../models/Patient');
const User = require('../models/User');
const { getNextPatientId } = require('../utils/idGenerator');

// @desc    Get all patients with search & filter
// @route   GET /api/patients
// @access  Private (Admin / Staff / Doctor)
const getPatients = async (req, res, next) => {
  try {
    const { search, gender, status } = req.query;
    const query = {};

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { name: searchRegex },
        { patientId: searchRegex },
        { phone: searchRegex },
        { email: searchRegex },
        { department: searchRegex },
        { doctor: searchRegex },
        { city: searchRegex },
      ];
    }

    if (gender && gender !== 'All') {
      query.gender = gender;
    }

    if (status && status !== 'All') {
      query.status = status;
    }

    const patients = await Patient.find(query).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: patients.length,
      data: patients,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single patient by ID or patientId
// @route   GET /api/patients/:id
// @access  Private
const getPatientById = async (req, res, next) => {
  try {
    const { id } = req.params;
    let patient;

    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      patient = await Patient.findById(id);
    } else {
      patient = await Patient.findOne({ patientId: id });
    }

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: `Patient not found with identifier ${id}`,
      });
    }

    // Role-based isolation: if patient, check that this patient belongs to them
    if (req.user.role === 'patient') {
      if (
        patient.user &&
        patient.user.toString() !== req.user.id &&
        patient.email !== req.user.email
      ) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized: You can only access your own patient profile',
        });
      }
    }

    res.status(200).json({
      success: true,
      data: patient,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current logged in patient profile
// @route   GET /api/patients/me/profile
// @access  Private (Patient)
const getMyProfile = async (req, res, next) => {
  try {
    let patient = await Patient.findOne({
      $or: [{ user: req.user.id }, { email: req.user.email }],
    });

    if (!patient) {
      // Create profile on the fly if not found
      const patientId = await getNextPatientId();
      patient = await Patient.create({
        patientId,
        user: req.user.id,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone || '9876543210',
      });
    }

    res.status(200).json({
      success: true,
      data: patient,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update current logged in patient profile
// @route   PUT /api/patients/me/profile
// @access  Private (Patient)
const updateMyProfile = async (req, res, next) => {
  try {
    const { name, age, phone, gender, dob, bloodGroup, address, emergencyName, emergencyPhone, city, department } = req.body;

    let patient = await Patient.findOne({
      $or: [{ user: req.user.id }, { email: req.user.email }],
    });

    if (!patient) {
      const patientId = await getNextPatientId();
      patient = new Patient({
        patientId,
        user: req.user.id,
        email: req.user.email,
      });
    }

    if (name) patient.name = name;
    if (age !== undefined && age !== null && age !== '') patient.age = Number(age);
    if (phone) patient.phone = phone;
    if (gender) patient.gender = gender;
    if (dob) patient.dob = dob;
    if (bloodGroup) patient.bloodGroup = bloodGroup;
    if (address) patient.address = address;
    if (emergencyName) patient.emergencyName = emergencyName;
    if (emergencyPhone) patient.emergencyPhone = emergencyPhone;
    if (city) patient.city = city;
    if (department) patient.department = department;

    await patient.save();

    // Also sync user name & phone
    await User.findByIdAndUpdate(req.user.id, {
      ...(name && { name }),
      ...(phone && { phone }),
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: patient,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a patient
// @route   POST /api/patients
// @access  Private (Admin / Staff)
const createPatient = async (req, res, next) => {
  try {
    const {
      name,
      age,
      gender,
      phone,
      email,
      department,
      doctor,
      bloodGroup,
      city,
      status,
      address,
      emergencyName,
      emergencyPhone,
    } = req.body;

    if (!name || !phone || !email) {
      return res.status(400).json({
        success: false,
        message: 'Name, phone, and email are required fields',
      });
    }

    // Auto-generate patientId if not provided
    const patientId = req.body.patientId || (await getNextPatientId());

    const existingPatient = await Patient.findOne({
      $or: [{ patientId }, { email: email.toLowerCase() }],
    });

    if (existingPatient) {
      return res.status(409).json({
        success: false,
        message: 'A patient with this ID or email already exists',
      });
    }

    const patient = await Patient.create({
      patientId,
      name,
      age: age ? Number(age) : 30,
      gender: gender || 'Male',
      phone,
      email: email.toLowerCase(),
      department: department || 'Cardiology',
      doctor: doctor || 'Dr. Rajesh Kumar',
      bloodGroup: bloodGroup || 'B+',
      city: city || 'Chennai',
      address: address || '',
      emergencyName: emergencyName || '',
      emergencyPhone: emergencyPhone || '',
      status: status || 'Active',
    });

    res.status(201).json({
      success: true,
      message: 'Patient created successfully',
      data: patient,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a patient
// @route   PUT /api/patients/:id
// @access  Private (Admin / Staff)
const updatePatient = async (req, res, next) => {
  try {
    const { id } = req.params;
    let patient = await Patient.findById(id);

    if (!patient) {
      patient = await Patient.findOne({ patientId: id });
    }

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: `Patient not found with ID ${id}`,
      });
    }

    const updatedPatient = await Patient.findByIdAndUpdate(
      patient._id,
      req.body,
      { returnDocument: 'after', runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Patient updated successfully',
      data: updatedPatient,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a patient
// @route   DELETE /api/patients/:id
// @access  Private (Admin)
const deletePatient = async (req, res, next) => {
  try {
    const { id } = req.params;
    let patient = await Patient.findById(id);

    if (!patient) {
      patient = await Patient.findOne({ patientId: id });
    }

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: `Patient not found with ID ${id}`,
      });
    }

    await Patient.findByIdAndDelete(patient._id);

    res.status(200).json({
      success: true,
      message: 'Patient deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPatients,
  getPatientById,
  getMyProfile,
  updateMyProfile,
  createPatient,
  updatePatient,
  deletePatient,
};
