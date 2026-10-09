const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');
const Room = require('../models/Room');
const Billing = require('../models/Billing');
const MedicalRecord = require('../models/MedicalRecord');
const Prescription = require('../models/Prescription');
const MedicalReport = require('../models/MedicalReport');

// @desc    Get live admin dashboard KPI statistics from MongoDB
// @route   GET /api/dashboard/stats
// @access  Private (Admin / Staff)
const getAdminStats = async (req, res, next) => {
  try {
    const totalPatients = await Patient.countDocuments();
    const totalDoctors = await Doctor.countDocuments();
    const totalAppointments = await Appointment.countDocuments();
    
    // Aggregate rooms for total beds and available beds
    const roomAgg = await Room.aggregate([
      {
        $group: {
          _id: null,
          totalBeds: { $sum: '$bedCount' },
          availableBeds: { $sum: '$availableBeds' },
        },
      },
    ]);

    const totalBeds = roomAgg.length > 0 ? roomAgg[0].totalBeds : 0;
    const availableBeds = roomAgg.length > 0 ? roomAgg[0].availableBeds : 0;

    // Doctor stats
    const availableDoctors = await Doctor.countDocuments({ status: 'Available' });
    const busyDoctors = await Doctor.countDocuments({ status: 'Busy' });

    // Appointment stats
    const pendingAppointments = await Appointment.countDocuments({
      status: { $in: ['Scheduled', 'Pending', 'pending', 'Confirmed', 'approved', 'doctor_assigned', 'room_assigned'] },
    });
    const completedAppointments = await Appointment.countDocuments({
      status: { $in: ['Completed', 'completed'] },
    });

    // Revenue from paid bills
    const billingAgg = await Billing.aggregate([
      { $match: { paymentStatus: 'Paid' } },
      { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' } } },
    ]);
    const totalRevenue = billingAgg.length > 0 ? billingAgg[0].totalRevenue : 0;

    // Recent patients (latest registered)
    const recentPatients = await Patient.find()
      .sort({ createdAt: -1 })
      .limit(5);

    // Today's appointments (guaranteed 3 items)
    const todayStr = new Date().toISOString().split('T')[0];
    const todayLocale = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
    let todayAppointments = await Appointment.find({
      $or: [
        { date: todayStr },
        { date: new RegExp(todayStr, 'i') },
        { date: new RegExp(todayLocale, 'i') },
      ],
    })
      .sort({ time: 1, createdAt: -1 })
      .limit(3);

    // If fewer than 3 today, pad with latest appointments to guarantee 3 are shown
    if (!todayAppointments || todayAppointments.length < 3) {
      const existingIds = (todayAppointments || []).map((a) => a._id);
      const moreAppointments = await Appointment.find({
        _id: { $nin: existingIds },
      })
        .sort({ createdAt: -1 })
        .limit(3 - (todayAppointments ? todayAppointments.length : 0));

      todayAppointments = [...(todayAppointments || []), ...moreAppointments];
    }

    res.status(200).json({
      success: true,
      data: {
        totalPatients,
        totalDoctors,
        totalAppointments,
        totalBeds,
        availableBeds,
        availableDoctors,
        busyDoctors,
        pendingAppointments,
        completedAppointments,
        totalRevenue,
        recentPatients,
        todayAppointments,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get client/patient personal dashboard statistics
// @route   GET /api/dashboard/client-stats
// @access  Private (Patient)
const getClientStats = async (req, res, next) => {
  try {
    const patient = await Patient.findOne({
      $or: [{ user: req.user.id }, { email: req.user.email }],
    });

    let upcomingAppointmentsCount = 0;
    let medicalRecordsCount = 0;
    let prescriptionsCount = 0;
    let totalBillsCount = 0;
    let approvedBillsCount = 0;
    let pendingBillsCount = 0;
    let reportsCount = 0;
    let recentAppointments = [];
    let recentPrescriptions = [];

    if (patient) {
      const patientQuery = {
        $or: [
          { patient: patient._id },
          { patientPhone: patient.phone },
          { patientName: new RegExp(patient.name, 'i') },
        ],
      };

      upcomingAppointmentsCount = await Appointment.countDocuments({
        ...patientQuery,
        status: { $in: ['Scheduled', 'Confirmed', 'pending', 'approved', 'doctor_assigned', 'room_assigned', 'in_progress'] },
      });

      recentAppointments = await Appointment.find(patientQuery)
        .sort({ createdAt: -1 })
        .limit(3);

      const recordQuery = {
        $or: [
          { patient: patient._id },
          { patientName: new RegExp(patient.name, 'i') },
        ],
      };

      medicalRecordsCount = await MedicalRecord.countDocuments(recordQuery);

      const prescriptionQuery = {
        $and: [
          {
            $or: [
              { patient: patient._id },
              { patientUser: req.user.id },
              { patientName: new RegExp(patient.name, 'i') },
            ],
          },
          {
            $or: [
              { status: 'approved' },
              { approvalStatus: 'Approved' },
              { isApproved: true },
            ],
          },
        ],
      };

      prescriptionsCount = await Prescription.countDocuments(prescriptionQuery);
      recentPrescriptions = await Prescription.find(prescriptionQuery)
        .sort({ createdAt: -1 })
        .limit(3);

      const patientBillConditions = [
        { patient: patient._id },
        ...(patient.patientId ? [{ patientId: patient.patientId }, { patientId: new RegExp('^' + patient.patientId + '$', 'i') }] : []),
        { patientName: new RegExp('^' + patient.name.trim() + '$', 'i') },
      ];

      totalBillsCount = await Billing.countDocuments({
        $or: patientBillConditions,
      });

      // Approved bills count (visible in client MyBilling)
      approvedBillsCount = await Billing.countDocuments({
        $and: [
          { $or: patientBillConditions },
          { $or: [{ approvalStatus: 'Approved' }, { isApproved: true }] },
        ],
      });

      // Pending bills count
      pendingBillsCount = await Billing.countDocuments({
        $and: [
          { $or: patientBillConditions },
          { $or: [{ approvalStatus: 'Pending' }, { isApproved: false }, { paymentStatus: 'Pending' }] },
        ],
      });

      // Doctor-issued reports count
      const reportConditions = [
        { patientUser: req.user.id },
      ];
      if (patient) {
        reportConditions.push({ patient: patient._id });
        const apts = await Appointment.find({
          $or: [{ patient: patient._id }, { patientUser: req.user.id }, { patientName: patient.name }],
        }).select('_id');
        if (apts.length > 0) {
          reportConditions.push({ appointment: { $in: apts.map((a) => a._id) } });
        }
      }

      reportsCount = await MedicalReport.countDocuments({
        $or: reportConditions,
        status: { $ne: 'draft' },
      });
    }

    res.status(200).json({
      success: true,
      data: {
        patientName: patient ? patient.name : req.user.name,
        patientId: patient ? patient.patientId : 'PAT-1001',
        age: patient ? patient.age : 28,
        bloodGroup: patient ? patient.bloodGroup : 'B+',
        upcomingAppointments: upcomingAppointmentsCount,
        medicalRecords: medicalRecordsCount,
        prescriptions: prescriptionsCount,
        reports: reportsCount,
        reportsCount: reportsCount,
        totalBills: totalBillsCount,
        approvedBills: approvedBillsCount,
        pendingBills: approvedBillsCount, // reflects approved bills count as requested
        pendingPaymentBills: pendingBillsCount,
        recentAppointments,
        recentPrescriptions,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get doctor dashboard KPI statistics
// @route   GET /api/dashboard/doctor-stats
// @access  Private (Doctor)
const getDoctorStats = async (req, res, next) => {
  try {
    const cleanUserName = (req.user.name || '').replace(/^Dr\.\s*/i, '').trim();
    const doctor = await Doctor.findOne({
      $or: [
        { user: req.user.id },
        { email: req.user.email },
        { name: new RegExp(cleanUserName || req.user.name, 'i') },
      ],
    });

    const cleanDocName = (doctor?.name || req.user.name || '').replace(/^Dr\.\s*/i, '').trim();
    const orConditions = [
      { doctorName: new RegExp(cleanDocName, 'i') },
      { doctorName: new RegExp(doctor?.name || req.user.name, 'i') },
    ];

    if (doctor) {
      orConditions.push({ doctor: doctor._id });
      orConditions.push({ assignedDoctor: doctor._id });
    }

    const approvedStatuses = ['doctor_assigned', 'room_assigned', 'in_progress', 'approved', 'completed', 'Confirmed', 'confirmed'];
    const approvedDocQuery = {
      $and: [
        { $or: orConditions },
        { status: { $in: approvedStatuses } },
      ],
    };

    // Total assigned appointments (only approved by admin)
    const totalAssigned = await Appointment.countDocuments(approvedDocQuery);

    // Active consultations
    const activeAppointments = await Appointment.countDocuments({
      $and: [
        { $or: orConditions },
        { status: { $in: ['doctor_assigned', 'room_assigned', 'in_progress', 'approved', 'Confirmed', 'confirmed'] } },
      ],
    });

    // Completed consultations
    const completedAppointments = await Appointment.countDocuments({
      $and: [
        { $or: orConditions },
        { status: { $in: ['completed', 'Completed'] } },
      ],
    });

    // Medical reports for this doctor
    const reportQuery = doctor ? { $or: [{ doctor: doctor._id }, { doctorUser: req.user.id }] } : { doctorUser: req.user.id };
    const draftReports = await MedicalReport.countDocuments({ ...reportQuery, status: 'draft' });
    const pendingApprovalReports = await MedicalReport.countDocuments({ ...reportQuery, status: 'pending_approval' });
    const approvedReports = await MedicalReport.countDocuments({ ...reportQuery, status: 'approved' });
    const rejectedReports = await MedicalReport.countDocuments({ ...reportQuery, status: 'rejected' });

    // Prescriptions count
    const prescriptionQuery = doctor ? { $or: [{ doctor: new RegExp(doctor.name, 'i') }, { doctorId: doctor.doctorId }] } : { doctor: new RegExp(req.user.name, 'i') };
    const totalPrescriptions = await Prescription.countDocuments(prescriptionQuery);

    // Recent 5 appointments (only approved by admin)
    const recentAppointments = await Appointment.find(approvedDocQuery)
      .populate('patient')
      .sort({ createdAt: -1 })
      .limit(5);

    // Recent 5 clinical reports
    const recentReports = await MedicalReport.find(reportQuery)
      .populate('patient')
      .populate('appointment')
      .sort({ updatedAt: -1 })
      .limit(5);

    res.status(200).json({
      success: true,
      data: {
        doctorName: doctor ? doctor.name : req.user.name,
        specialization: doctor ? doctor.specialization : 'General Medicine',
        department: doctor ? doctor.department : 'General',
        totalAssigned,
        activeAppointments,
        completedAppointments,
        draftReports,
        pendingApprovalReports,
        approvedReports,
        rejectedReports,
        totalPrescriptions,
        recentAppointments,
        recentReports,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAdminStats,
  getClientStats,
  getDoctorStats,
};
