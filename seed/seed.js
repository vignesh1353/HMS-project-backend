require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');
const Billing = require('../models/Billing');
const Medicine = require('../models/Medicine');
const Room = require('../models/Room');
const MedicalRecord = require('../models/MedicalRecord');
const Prescription = require('../models/Prescription');
const Report = require('../models/Report');
const MedicalReport = require('../models/MedicalReport');
const MedicineRequest = require('../models/MedicineRequest');
const Notification = require('../models/Notification');

const seedDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/hospital_management';
    await mongoose.connect(mongoUri);
    console.log(`Connected to MongoDB for seeding: ${mongoUri}`);

    // Clear existing data
    console.log('Clearing existing database collections...');
    await User.deleteMany({});
    await Patient.deleteMany({});
    await Doctor.deleteMany({});
    await Appointment.deleteMany({});
    await Billing.deleteMany({});
    await Medicine.deleteMany({});
    await Room.deleteMany({});
    await MedicalRecord.deleteMany({});
    await Prescription.deleteMany({});
    await Report.deleteMany({});
    await MedicalReport.deleteMany({});
    await MedicineRequest.deleteMany({});
    await Notification.deleteMany({});
    console.log('Cleared all collections successfully.');

    // 1. Create Users
    console.log('Creating users...');
    const adminUser = await User.create({
      name: 'Hospital Administrator',
      email: 'admin@medcare.com',
      password: 'Admin@123',
      phone: '+91 98765 00000',
      role: 'admin',
      status: 'active',
    });

    const doctorUser = await User.create({
      name: 'Dr. Rajesh Kumar',
      email: 'rajesh@medcare.com',
      password: 'Doctor@123',
      phone: '+91 98765 43210',
      role: 'doctor',
      status: 'active',
    });

    const patientUser1 = await User.create({
      name: 'Arun Kumar',
      email: 'arun@gmail.com',
      password: 'Patient@123',
      phone: '9876543210',
      role: 'patient',
      status: 'active',
    });

    const patientUser2 = await User.create({
      name: 'Priya Sharma',
      email: 'priya@gmail.com',
      password: 'Patient@123',
      phone: '9876543211',
      role: 'patient',
      status: 'active',
    });

    // 2. Create Patients
    console.log('Creating patients...');
    const patients = await Patient.create([
      {
        patientId: 'PAT-1001',
        user: patientUser1._id,
        name: 'Arun Kumar',
        age: 32,
        dob: '15 August 1994',
        gender: 'Male',
        phone: '9876543210',
        email: 'arun@gmail.com',
        department: 'Cardiology',
        doctor: 'Dr. Rajesh Kumar',
        bloodGroup: 'B+',
        city: 'Chennai',
        address: 'No 45, Anna Nagar, Chennai, Tamil Nadu',
        emergencyName: 'Kumar',
        emergencyPhone: '+91 98765 12345',
        status: 'Active',
      },
      {
        patientId: 'PAT-1002',
        user: patientUser2._id,
        name: 'Priya Sharma',
        age: 28,
        dob: '22 March 1998',
        gender: 'Female',
        phone: '9876543211',
        email: 'priya@gmail.com',
        department: 'Neurology',
        doctor: 'Dr. Priya Sharma',
        bloodGroup: 'A+',
        city: 'Coimbatore',
        address: '12 Gandhipuram, Coimbatore, Tamil Nadu',
        emergencyName: 'Sharma',
        emergencyPhone: '+91 98765 11111',
        status: 'Active',
      },
      {
        patientId: 'PAT-1003',
        name: 'Rahul Raj',
        age: 41,
        gender: 'Male',
        phone: '9876543212',
        email: 'rahul@gmail.com',
        department: 'Orthopedics',
        doctor: 'Dr. Suresh Kumar',
        bloodGroup: 'O+',
        city: 'Madurai',
        address: 'Madurai Main Road, Madurai',
        status: 'Inactive',
      },
    ]);

    // Link patientProfile to users
    patientUser1.patientProfile = patients[0]._id;
    await patientUser1.save();
    patientUser2.patientProfile = patients[1]._id;
    await patientUser2.save();

    // 3. Create Doctors
    console.log('Creating doctors (10 doctors across departments)...');
    const doctorData = [
      {
        doctorId: 'DOC-1001',
        user: doctorUser._id,
        name: 'Dr. Rajesh Kumar',
        email: 'rajesh@medcare.com',
        phone: '+91 98765 43210',
        specialization: 'Cardiology',
        department: 'Cardiology',
        qualification: 'MBBS, MD (Cardio)',
        experience: '14 Years',
        availability: 'Mon - Fri',
        timing: '10:00 AM - 2:00 PM',
        consultationFee: 700,
        status: 'Available',
        patients: 32,
      },
      {
        doctorId: 'DOC-1002',
        name: 'Dr. Priya Sharma',
        email: 'priyasharma@medcare.com',
        phone: '+91 98765 12345',
        specialization: 'Neurology',
        department: 'Neurology',
        qualification: 'MBBS, MD (Neuro)',
        experience: '11 Years',
        availability: 'Mon - Sat',
        timing: '09:00 AM - 1:00 PM',
        consultationFee: 800,
        status: 'Available',
        patients: 26,
      },
      {
        doctorId: 'DOC-1003',
        name: 'Dr. Arun Kumar',
        email: 'arunkumar@medcare.com',
        phone: '+91 91234 56789',
        specialization: 'Orthopedics',
        department: 'Orthopedics',
        qualification: 'MBBS, MS (Ortho)',
        experience: '9 Years',
        availability: 'Tue - Sat',
        timing: '11:00 AM - 3:00 PM',
        consultationFee: 600,
        status: 'Available',
        patients: 22,
      },
      {
        doctorId: 'DOC-1004',
        name: 'Dr. Meera Nambiar',
        email: 'meera@medcare.com',
        phone: '+91 98765 44321',
        specialization: 'Pediatrics',
        department: 'Pediatrics',
        qualification: 'MBBS, MD (Pediatrics)',
        experience: '8 Years',
        availability: 'Mon - Fri',
        timing: '09:30 AM - 1:30 PM',
        consultationFee: 500,
        status: 'Available',
        patients: 35,
      },
      {
        doctorId: 'DOC-1005',
        name: 'Dr. Suresh Menon',
        email: 'suresh@medcare.com',
        phone: '+91 98765 55432',
        specialization: 'General Medicine',
        department: 'General Medicine',
        qualification: 'MBBS, MD (General Medicine)',
        experience: '16 Years',
        availability: 'Mon - Sat',
        timing: '08:00 AM - 12:00 PM',
        consultationFee: 450,
        status: 'Available',
        patients: 48,
      },
      {
        doctorId: 'DOC-1006',
        name: 'Dr. Ananya Sengupta',
        email: 'ananya@medcare.com',
        phone: '+91 98765 66543',
        specialization: 'Dermatology',
        department: 'Dermatology',
        qualification: 'MBBS, MD (Dermatology)',
        experience: '7 Years',
        availability: 'Mon - Thu',
        timing: '02:00 PM - 6:00 PM',
        consultationFee: 550,
        status: 'Available',
        patients: 18,
      },
      {
        doctorId: 'DOC-1007',
        name: 'Dr. Vikram Rathore',
        email: 'vikram@medcare.com',
        phone: '+91 98765 77654',
        specialization: 'Oncology',
        department: 'Oncology',
        qualification: 'MBBS, MS, MCh (Oncology)',
        experience: '13 Years',
        availability: 'Mon - Fri',
        timing: '10:00 AM - 2:00 PM',
        consultationFee: 1000,
        status: 'Busy',
        patients: 15,
      },
      {
        doctorId: 'DOC-1008',
        name: 'Dr. Deepa Krishnan',
        email: 'deepa@medcare.com',
        phone: '+91 98765 88765',
        specialization: 'Gynecology',
        department: 'Gynecology',
        qualification: 'MBBS, MS (OBG)',
        experience: '12 Years',
        availability: 'Mon - Sat',
        timing: '10:30 AM - 2:30 PM',
        consultationFee: 650,
        status: 'Available',
        patients: 30,
      },
      {
        doctorId: 'DOC-1009',
        name: 'Dr. Karthik Sundaram',
        email: 'karthik@medcare.com',
        phone: '+91 98765 99876',
        specialization: 'ENT',
        department: 'ENT',
        qualification: 'MBBS, MS (ENT)',
        experience: '6 Years',
        availability: 'Wed - Sun',
        timing: '03:00 PM - 7:00 PM',
        consultationFee: 500,
        status: 'Available',
        patients: 14,
      },
      {
        doctorId: 'DOC-1010',
        name: 'Dr. Shalini Verma',
        email: 'shalini@medcare.com',
        phone: '+91 98765 11223',
        specialization: 'Ophthalmology',
        department: 'Ophthalmology',
        qualification: 'MBBS, MS (Ophthalmology)',
        experience: '10 Years',
        availability: 'Mon - Fri',
        timing: '09:00 AM - 1:00 PM',
        consultationFee: 550,
        status: 'On Leave',
        patients: 21,
      },
    ];

    // Create doctor user accounts for all doctors so any doctor can log in (Doctor@123)
    for (let i = 1; i < doctorData.length; i++) {
      const docUser = await User.create({
        name: doctorData[i].name,
        email: doctorData[i].email,
        password: 'Doctor@123',
        phone: doctorData[i].phone,
        role: 'doctor',
        status: 'active',
      });
      doctorData[i].user = docUser._id;
    }

    const doctors = await Doctor.create(doctorData);

    doctorUser.doctorProfile = doctors[0]._id;
    await doctorUser.save();

    for (let i = 1; i < doctors.length; i++) {
      await User.findByIdAndUpdate(doctors[i].user, {
        doctorProfile: doctors[i]._id,
      });
    }

    // 4. Create Rooms
    console.log('Creating rooms...');
    const rooms = await Room.create([
      {
        roomNumber: '101',
        roomType: 'General Ward',
        floor: 'Ground Floor',
        bedCount: 6,
        availableBeds: 5,
        doctor: 'Dr. Rajesh Kumar',
        status: 'Available',
        price: 1500,
      },
      {
        roomNumber: '102',
        roomType: 'General Ward',
        floor: 'Ground Floor',
        bedCount: 6,
        availableBeds: 4,
        doctor: 'Dr. Rajesh Kumar',
        status: 'Available',
        price: 1500,
      },
      {
        roomNumber: '201',
        roomType: 'Semi Private',
        floor: 'First Floor',
        bedCount: 2,
        availableBeds: 1,
        doctor: 'Dr. Arun Kumar',
        status: 'Available',
        price: 2500,
      },
      {
        roomNumber: '202',
        roomType: 'Private Room',
        floor: 'First Floor',
        bedCount: 1,
        availableBeds: 1,
        doctor: 'Dr. Priya Sharma',
        status: 'Available',
        price: 4000,
      },
    ]);

    // 5. Create Appointments
    console.log('Creating appointments...');
    const appointments = await Appointment.create([
      {
        appointmentId: 'APT-1001',
        patient: patients[0]._id,
        patientUser: patientUser1._id,
        doctor: doctors[0]._id,
        assignedDoctor: doctors[0]._id,
        assignedRoom: rooms[0]._id,
        roomNumber: '101',
        patientName: 'Arun Kumar',
        patientPhone: '9876543210',
        doctorName: 'Dr. Rajesh Kumar',
        department: 'Cardiology',
        date: 'Sep 10, 2026',
        time: '10:00 AM',
        type: 'Consultation',
        status: 'room_assigned',
        notes: 'Regular cardiac consultation and checkup',
        approval: {
          approvedBy: adminUser._id,
          approvedByName: 'Hospital Administrator',
          approvedAt: new Date(),
          adminComments: 'Approved for consultation',
        },
      },
      {
        appointmentId: 'APT-1002',
        patient: patients[1]._id,
        patientUser: patientUser2._id,
        doctor: doctors[1]._id,
        patientName: 'Priya Sharma',
        patientPhone: '9876543211',
        doctorName: 'Dr. Priya Sharma',
        department: 'Neurology',
        date: 'Sep 12, 2026',
        time: '02:00 PM',
        type: 'Regular Checkup',
        status: 'pending',
        notes: 'Awaiting admin review and room allocation',
      },
      {
        appointmentId: 'APT-1003',
        patient: patients[0]._id,
        patientUser: patientUser1._id,
        doctor: doctors[2]._id,
        assignedDoctor: doctors[2]._id,
        patientName: 'Arun Kumar',
        patientPhone: '9876543210',
        doctorName: 'Dr. Arun Kumar',
        department: 'Orthopedics',
        date: 'Sep 05, 2026',
        time: '11:00 AM',
        type: 'Follow-up',
        status: 'completed',
        notes: 'Knee joint checkup completed',
      },
    ]);

    // 6. Create Medicines
    console.log('Creating pharmacy inventory...');
    const medicines = await Medicine.create([
      {
        medicineId: 'MED-1001',
        name: 'Paracetamol 500mg',
        category: 'Tablet',
        manufacturer: 'Cipla',
        batchNo: 'PCM500-A1',
        quantity: 250,
        price: 25,
        expiryDate: 'Dec 2027',
        supplier: 'ABC Pharma',
        status: 'Available',
      },
      {
        medicineId: 'MED-1002',
        name: 'Amoxicillin 250mg',
        category: 'Capsule',
        manufacturer: 'Sun Pharma',
        batchNo: 'AMX250-B2',
        quantity: 120,
        price: 65,
        expiryDate: 'Oct 2026',
        supplier: 'MedSupply Co',
        status: 'Available',
      },
      {
        medicineId: 'MED-1003',
        name: 'Cetirizine 10mg',
        category: 'Tablet',
        manufacturer: "Dr. Reddy's",
        batchNo: 'CTZ10-C3',
        quantity: 80,
        price: 15,
        expiryDate: 'Nov 2027',
        supplier: 'ABC Pharma',
        status: 'Available',
      },
      {
        medicineId: 'MED-1004',
        name: 'Amlodipine 5mg',
        category: 'Tablet',
        manufacturer: 'Torrent',
        batchNo: 'AML5-D4',
        quantity: 100,
        price: 45,
        expiryDate: 'Jan 2028',
        supplier: 'HealthCare Ltd',
        status: 'Available',
      },
    ]);

    // 7. Create Medical Reports (Approved & Pending)
    console.log('Creating clinical medical reports...');
    const report1 = await MedicalReport.create({
      reportId: 'REP-1001',
      patient: patients[0]._id,
      patientUser: patientUser1._id,
      doctor: doctors[0]._id,
      doctorUser: doctorUser._id,
      appointment: appointments[0]._id,
      visitDate: 'Sep 10, 2026',
      symptoms: 'Mild dizziness, occasional palpitations upon exertion',
      chiefComplaint: 'Blood pressure monitoring and cardiac follow-up',
      diagnosis: 'Essential Stage 1 Hypertension with Normal Cardiac Rhythm',
      testInvestigation: '12-lead ECG, Complete Metabolic Panel, Lipid Profile',
      findings: 'ECG shows sinus rhythm at 74 bpm. Normal QRS complexes. BP recorded at 138/86 mmHg.',
      treatment: 'Oral antihypertensive therapy, sodium-restricted diet, daily aerobic walking.',
      doctorNotes: 'Patient responded well to current dosage. Advised to maintain daily BP diary.',
      followUpRecommendation: 'Review in clinic after 4 weeks with home BP chart.',
      additionalNotes: 'Patient cleared for routine domestic and office activities.',
      status: 'approved',
      approval: {
        approvedBy: adminUser._id,
        approvedByName: 'Hospital Administrator',
        approvedAt: new Date(),
        approvalReference: 'MC-APP-781923',
      },
    });

    const report2 = await MedicalReport.create({
      reportId: 'REP-1002',
      patient: patients[1]._id,
      patientUser: patientUser2._id,
      doctor: doctors[1]._id,
      appointment: appointments[1]._id,
      visitDate: 'Sep 10, 2026',
      symptoms: 'Throbbing frontal headache, photophobia',
      chiefComplaint: 'Recurrent migraine attacks over past 2 weeks',
      diagnosis: 'Common Migraine without Aura',
      testInvestigation: 'Neurological cranial nerve examination',
      findings: 'Neurological exam intact. No focal deficits.',
      treatment: 'Hydration therapy, prophylactic magnesium, analgesics as needed.',
      doctorNotes: 'Submitted for administrative approval.',
      followUpRecommendation: 'Review in 2 weeks.',
      status: 'pending_approval',
    });

    // 8. Create Medicine Requests linked to Approved Report
    console.log('Creating medicine requests...');
    await MedicineRequest.create([
      {
        requestId: 'MED-REQ-1001',
        patient: patients[0]._id,
        patientUser: patientUser1._id,
        report: report1._id,
        doctor: doctors[0]._id,
        appointment: appointments[0]._id,
        medicines: [
          {
            medicine: medicines[3]._id, // Amlodipine
            medicineName: 'Amlodipine 5mg',
            category: 'Tablet',
            dosage: '5mg',
            frequency: 'Once daily in the morning',
            duration: '30 days',
            quantity: 30,
            instructions: 'Take after breakfast',
          },
          {
            medicine: medicines[0]._id, // Paracetamol
            medicineName: 'Paracetamol 500mg',
            category: 'Tablet',
            dosage: '500mg',
            frequency: 'As needed for headache',
            duration: '5 days',
            quantity: 10,
            instructions: 'Take after meals',
          },
        ],
        reason: 'Monthly maintenance medication as per approved clinical report REP-1001',
        status: 'approved',
        approval: {
          approvedBy: adminUser._id,
          approvedByName: 'Hospital Administrator',
          approvedAt: new Date(),
        },
      },
      {
        requestId: 'MED-REQ-1002',
        patient: patients[0]._id,
        patientUser: patientUser1._id,
        report: report1._id,
        doctor: doctors[0]._id,
        appointment: appointments[0]._id,
        medicines: [
          {
            medicine: medicines[2]._id, // Cetirizine
            medicineName: 'Cetirizine 10mg',
            category: 'Tablet',
            dosage: '10mg',
            frequency: 'Once daily at bedtime',
            duration: '7 days',
            quantity: 7,
            instructions: 'Take at night',
          },
        ],
        reason: 'Allergic rhinitis symptoms noted during visit',
        status: 'pending_approval',
      },
    ]);

    // 9. Create Notifications
    console.log('Creating notifications...');
    await Notification.create([
      {
        recipientRole: 'admin',
        type: 'appointment_booked',
        title: 'New Appointment Request',
        message: 'New appointment APT-1002 booked by Priya Sharma. Awaiting Admin Approval.',
        relatedEntity: 'Appointment',
        relatedEntityId: 'APT-1002',
        read: false,
      },
      {
        recipientRole: 'admin',
        type: 'report_submitted',
        title: 'Clinical Report Pending Approval',
        message: 'Report REP-1002 submitted by Dr. Priya Sharma. Awaiting Admin Review.',
        relatedEntity: 'MedicalReport',
        relatedEntityId: 'REP-1002',
        read: false,
      },
      {
        recipientRole: 'admin',
        type: 'medicine_requested',
        title: 'New Tablet / Medicine Request',
        message: 'Medicine request MED-REQ-1002 based on approved report REP-1001 awaiting approval.',
        relatedEntity: 'MedicineRequest',
        relatedEntityId: 'MED-REQ-1002',
        read: false,
      },
      {
        recipient: patientUser1._id,
        recipientRole: 'patient',
        type: 'report_approved',
        title: 'Official Medical Report Available',
        message: 'Your medical report REP-1001 has been approved. You can now download the PDF and request medications.',
        relatedEntity: 'MedicalReport',
        relatedEntityId: 'REP-1001',
        read: false,
      },
    ]);

    console.log('=============================================');
    console.log(' Database seeded successfully with approval workflows!');
    console.log(' Total Doctors: 10 doctors created across departments');
    console.log(' Admin user:   admin@medcare.com  / Admin@123');
    console.log(' Doctor user:  rajesh@medcare.com / Doctor@123 (All doctors: Doctor@123)');
    console.log(' Patient user: arun@gmail.com     / Patient@123');
    console.log('=============================================');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

seedDB();
