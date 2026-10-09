const mongoose = require('mongoose');

async function fix() {
  await mongoose.connect('mongodb://127.0.0.1:27017/hospital_management');
  console.log('Connected to MongoDB');

  const Patient = require('../models/Patient');
  const MedicalReport = require('../models/MedicalReport');
  const MedicineRequest = require('../models/MedicineRequest');

  // Find Arun Kumar
  const arunPatient = await Patient.findOne({
    $or: [
      { patientId: 'PAT-1001' },
      { email: 'arun@gmail.com' },
      { name: new RegExp('Arun Kumar', 'i') }
    ]
  });

  if (!arunPatient) {
    console.error('Could not find Arun Kumar patient record!');
    process.exit(1);
  }

  console.log(`Found active patient: ${arunPatient.name} (${arunPatient.patientId}), _id: ${arunPatient._id}`);

  // 1. Fix MedicalReports
  const oldPatientId = new mongoose.Types.ObjectId('6aa24ab409b6847a0152507e');
  const reportsResult = await MedicalReport.updateMany(
    {
      $or: [
        { patient: oldPatientId },
        { patientUser: arunPatient.user }
      ]
    },
    {
      $set: {
        patient: arunPatient._id,
        patientUser: arunPatient.user
      }
    }
  );
  console.log(`Updated ${reportsResult.modifiedCount} MedicalReports to active patient reference.`);

  // 2. Fix MedicineRequests
  const requestsResult = await MedicineRequest.updateMany(
    {
      $or: [
        { patient: oldPatientId },
        { patientUser: arunPatient.user },
        { patient: null }
      ]
    },
    {
      $set: {
        patient: arunPatient._id,
        patientId: arunPatient.patientId,
        patientReferenceNumber: arunPatient.patientId,
        patientName: arunPatient.name,
        patientUser: arunPatient.user
      }
    }
  );
  console.log(`Updated ${requestsResult.modifiedCount} MedicineRequests with active patientId and references.`);

  // Also backfill any other medicine requests that might have missing patientId
  const allRequests = await MedicineRequest.find({}).populate('patient');
  let backfilled = 0;
  for (const req of allRequests) {
    if (!req.patientId && req.patient && req.patient.patientId) {
      req.patientId = req.patient.patientId;
      req.patientReferenceNumber = req.patient.patientId;
      req.patientName = req.patient.name;
      await req.save();
      backfilled++;
    }
  }
  console.log(`Backfilled ${backfilled} additional requests with patientId.`);

  console.log('Data migration complete!');
  process.exit(0);
}

fix().catch((err) => {
  console.error('Fix error:', err);
  process.exit(1);
});
