const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');
const Prescription = require('../models/Prescription');
const MedicalReport = require('../models/MedicalReport');
const MedicalRecord = require('../models/MedicalRecord');

const getNextPatientId = async () => {
  const all = await Patient.find({}, 'patientId').lean();
  const nums = all
    .map((p) => parseInt((p.patientId || '').replace(/\D/g, ''), 10))
    .filter((n) => !isNaN(n));
  let nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1001;
  let candidate = `PAT-${nextNum}`;
  while (await Patient.findOne({ patientId: candidate })) {
    nextNum++;
    candidate = `PAT-${nextNum}`;
  }
  return candidate;
};

const getNextAppointmentId = async () => {
  const all = await Appointment.find({}, 'appointmentId').lean();
  const nums = all
    .map((a) => parseInt((a.appointmentId || '').replace(/\D/g, ''), 10))
    .filter((n) => !isNaN(n));
  let nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1001;
  let candidate = `APT-${nextNum}`;
  while (await Appointment.findOne({ appointmentId: candidate })) {
    nextNum++;
    candidate = `APT-${nextNum}`;
  }
  return candidate;
};

const getNextPrescriptionNo = async () => {
  const all = await Prescription.find({}, 'prescriptionNo').lean();
  const nums = all
    .map((p) => parseInt((p.prescriptionNo || '').replace(/\D/g, ''), 10))
    .filter((n) => !isNaN(n));
  let nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1001;
  let candidate = `RX-${nextNum}`;
  while (await Prescription.findOne({ prescriptionNo: candidate })) {
    nextNum++;
    candidate = `RX-${nextNum}`;
  }
  return candidate;
};

const getNextMedicalReportId = async () => {
  const all = await MedicalReport.find({}, 'reportId').lean();
  const nums = all
    .map((r) => parseInt((r.reportId || '').replace(/\D/g, ''), 10))
    .filter((n) => !isNaN(n));
  let nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1001;
  let candidate = `REP-${nextNum}`;
  while (await MedicalReport.findOne({ reportId: candidate })) {
    nextNum++;
    candidate = `REP-${nextNum}`;
  }
  return candidate;
};

const getNextMedicineRequestId = async (prefix = 'MED-REQ') => {
  const MedicineRequest = require('../models/MedicineRequest');
  const all = await MedicineRequest.find({}, 'requestId').lean();
  const nums = all
    .map((m) => parseInt((m.requestId || '').replace(/\D/g, ''), 10))
    .filter((n) => !isNaN(n));
  let nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1001;
  let candidate = `${prefix}-${nextNum}`;
  while (await MedicineRequest.findOne({ requestId: candidate })) {
    nextNum++;
    candidate = `${prefix}-${nextNum}`;
  }
  return candidate;
};

module.exports = {
  getNextPatientId,
  getNextAppointmentId,
  getNextPrescriptionNo,
  getNextMedicalReportId,
  getNextMedicineRequestId,
};

