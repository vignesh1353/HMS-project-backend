const Doctor = require('../models/Doctor');

// @desc    Get all doctors with search & department filters
// @route   GET /api/doctors
// @access  Public (for client viewing) / Private
const getDoctors = async (req, res, next) => {
  try {
    const { search, department, status } = req.query;
    const query = {};

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { name: searchRegex },
        { specialization: searchRegex },
        { department: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { status: searchRegex },
      ];
    }

    if (department && department !== 'All') {
      query.$or = [
        { department: new RegExp(department, 'i') },
        { specialization: new RegExp(department, 'i') },
      ];
    }

    if (status && status !== 'All') {
      query.status = status;
    }

    const doctors = await Doctor.find(query).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: doctors.length,
      data: doctors,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single doctor by ID or doctorId
// @route   GET /api/doctors/:id
// @access  Public / Private
const getDoctorById = async (req, res, next) => {
  try {
    const { id } = req.params;
    let doctor;

    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      doctor = await Doctor.findById(id);
    } else {
      doctor = await Doctor.findOne({ doctorId: id });
    }

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: `Doctor not found with identifier ${id}`,
      });
    }

    res.status(200).json({
      success: true,
      data: doctor,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create a doctor
// @route   POST /api/doctors
// @access  Private (Admin only)
const createDoctor = async (req, res, next) => {
  try {
    const {
      name,
      email,
      phone,
      specialization,
      department,
      qualification,
      experience,
      availability,
      timing,
      consultationFee,
      status,
      patients,
    } = req.body;

    if (!name || !email || !phone || !specialization) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, phone, and specialization are required fields',
      });
    }

    // Auto format Dr. prefix
    const formattedName = name.trim().startsWith('Dr.') ? name.trim() : `Dr. ${name.trim()}`;

    // Auto-generate doctorId if not provided
    const doctorCount = await Doctor.countDocuments();
    const doctorId = req.body.doctorId || `DOC-${1001 + doctorCount}`;

    // Ensure experience has 'Years' format if numeric
    let formattedExp = experience ? String(experience).trim() : '5 Years';
    if (!formattedExp.toLowerCase().includes('year')) {
      formattedExp = `${formattedExp} Years`;
    }

    const doctor = await Doctor.create({
      doctorId,
      name: formattedName,
      email: email.toLowerCase(),
      phone,
      specialization,
      department: department || specialization,
      qualification: qualification || 'MBBS, MD',
      experience: formattedExp,
      availability: availability || 'Mon - Fri',
      timing: timing || '10:00 AM - 2:00 PM',
      consultationFee: consultationFee || 500,
      status: status || 'Available',
      patients: patients || 0,
    });

    res.status(201).json({
      success: true,
      message: 'Doctor created successfully',
      data: doctor,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a doctor
// @route   PUT /api/doctors/:id
// @access  Private (Admin only)
const updateDoctor = async (req, res, next) => {
  try {
    const { id } = req.params;
    let doctor = await Doctor.findById(id);

    if (!doctor) {
      doctor = await Doctor.findOne({ doctorId: id });
    }

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: `Doctor not found with ID ${id}`,
      });
    }

    const updateData = { ...req.body };
    if (updateData.name) {
      updateData.name = updateData.name.trim().startsWith('Dr.')
        ? updateData.name.trim()
        : `Dr. ${updateData.name.trim()}`;
    }

    if (updateData.experience && !String(updateData.experience).toLowerCase().includes('year')) {
      updateData.experience = `${updateData.experience} Years`;
    }

    const updatedDoctor = await Doctor.findByIdAndUpdate(
      doctor._id,
      updateData,
      { returnDocument: 'after', runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Doctor updated successfully',
      data: updatedDoctor,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a doctor
// @route   DELETE /api/doctors/:id
// @access  Private (Admin only)
const deleteDoctor = async (req, res, next) => {
  try {
    const { id } = req.params;
    let doctor = await Doctor.findById(id);

    if (!doctor) {
      doctor = await Doctor.findOne({ doctorId: id });
    }

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: `Doctor not found with ID ${id}`,
      });
    }

    await Doctor.findByIdAndDelete(doctor._id);

    res.status(200).json({
      success: true,
      message: `${doctor.name} deleted successfully`,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDoctors,
  getDoctorById,
  createDoctor,
  updateDoctor,
  deleteDoctor,
};
